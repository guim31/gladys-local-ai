// -----------------------------------------------------------------------------
// The AI provider: one chat completion in, one out, answered by the local
// model server.
//
// The whole agentic loop (prompts, tools, history) runs in the Gladys core:
// this handler only picks the model, adapts the request to what the model
// can do, and returns the completion. It runs no tool.
//
//   - `intent-classification` (the router, before every chat turn): the fast
//     model, without thinking, under 18 s (the core waits 20 s);
//   - `chat`, `weekly-digest` and anything else: the chat model, under the
//     timeout of the configuration (115 s at most, the core waits 120 s).
//
// With Ollama, the capabilities of the model are read first (`/api/show`):
// tools asked of a model that cannot call them fail at once with a clear
// reason instead of a model inventing an answer; images sent to a model
// without vision become a note it can answer to.
//
// Nothing of the conversation is logged, at any level: sizes and times only.
// -----------------------------------------------------------------------------

import { AI_CHAT_PURPOSES, createLogger } from '@gladysassistant/integration-sdk';
import { modelFor } from './config.js';
import { hasImages, withoutImages } from './ollama.js';
import { ERROR_KINDS, LocalAiError } from './server.js';

const logger = createLogger({ name: 'chat' });

export const ROUTER_TIMEOUT_MS = 18_000;
/** Characters per token, low on purpose: JSON tool schemas and French text are dense. */
const CHARS_PER_TOKEN = 3.5;
/** The bounds the core applies to a completion (validateAiCompletion of the SDK). */
const MAX_TOOL_CALLS = 20;
const MAX_ARGUMENTS_CHARS = 100_000;
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;
const MAX_CONTENT_CHARS = 50_000;

/**
 * @description Estimated tokens of a request. Ollama never says it cut a
 * prompt (it keeps about half the window and reports the kept count), so the
 * size is estimated before sending.
 * @param {object} request - The request.
 * @returns {number} The estimate.
 */
export function estimateTokens(request) {
  const chars =
    JSON.stringify(request?.messages ?? []).length + JSON.stringify(request?.tools ?? []).length;
  return Math.round(chars / CHARS_PER_TOKEN);
}

/**
 * @description Keep a completion within what the core accepts: tool calls
 * with a valid name and bounded arguments, at most 20, content bounded. A
 * small model inventing \`functions.get temp\` would otherwise make the core
 * refuse the whole answer.
 * @param {object} completion - The completion.
 * @returns {number} How many tool calls were dropped.
 */
export function boundCompletion(completion) {
  const message = completion.choices[0].message;
  let dropped = 0;
  if (Array.isArray(message.tool_calls)) {
    const kept = message.tool_calls.filter(
      (call) =>
        TOOL_NAME.test(call.function.name) && call.function.arguments.length <= MAX_ARGUMENTS_CHARS,
    );
    dropped = message.tool_calls.length - Math.min(kept.length, MAX_TOOL_CALLS);
    if (kept.length === 0) {
      delete message.tool_calls;
      message.content ??= '';
    } else {
      message.tool_calls = kept.slice(0, MAX_TOOL_CALLS);
    }
  }
  if (typeof message.content === 'string' && message.content.length > MAX_CONTENT_CHARS) {
    message.content = message.content.slice(0, MAX_CONTENT_CHARS);
  }
  return dropped;
}

/**
 * @description The role a request plays.
 * @param {string} purpose - The `purpose` of the request.
 * @returns {'chat'|'router'} The role.
 */
export function roleOf(purpose) {
  return purpose === AI_CHAT_PURPOSES.INTENT_CLASSIFICATION ? 'router' : 'chat';
}

/**
 * @description The use counted and shown for a purpose.
 * @param {string} purpose - The `purpose` of the request.
 * @returns {'chat'|'router'|'digest'} The use.
 */
export function useOf(purpose) {
  if (purpose === AI_CHAT_PURPOSES.WEEKLY_DIGEST) {
    return 'digest';
  }
  return roleOf(purpose);
}

/**
 * @description The size of a request, for the debug logs: counts only.
 * @param {object} request - The request.
 * @returns {string} e.g. `12 messages, 18342 chars, 9 tools, 1 image`.
 */
function sizeOf(request) {
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const chars = JSON.stringify(messages).length;
  const tools = Array.isArray(request?.tools) ? request.tools.length : 0;
  return `${messages.length} messages, ${chars} chars, ${tools} tools${hasImages(messages) ? ', images' : ''}`;
}

/**
 * @description Create the `onAiChat` handler.
 * @param {object} options - Options.
 * @param {object} options.server - The model server client (server.js).
 * @param {() => object} options.getConfig - The normalized configuration.
 * @param {(error: LocalAiError, context: object) => void} [options.onFailure] - After a failure.
 * @param {(context: object) => void} [options.onSuccess] - After an answer.
 * @param {() => number} [options.now] - Clock.
 * @returns {(request: object) => Promise<object>} The handler.
 */
export function createChatHandler({
  server,
  getConfig,
  onFailure = () => {},
  onSuccess = () => {},
  now = Date.now,
}) {
  // Context windows already reported full, per model: one warning, not one
  // per request.
  const fullReported = new Set();

  return async function onAiChat(request) {
    const config = getConfig();
    const role = roleOf(request?.purpose);
    const use = useOf(request?.purpose);
    const model = modelFor(config, role);
    const started = now();
    try {
      if (!model) {
        throw new LocalAiError(ERROR_KINDS.CONFIG, 'No model chosen in the configuration');
      }
      // One deadline for the whole request: detection and capabilities
      // (after a reset) count too, the core does not wait longer.
      const deadline =
        started + (role === 'router' ? ROUTER_TIMEOUT_MS : config.timeout_seconds * 1000);
      let chatRequest = request ?? {};
      let think;
      const capabilities = await server.modelCapabilities(config, model);
      if (capabilities) {
        const wantsTools =
          Array.isArray(chatRequest.tools) &&
          chatRequest.tools.length > 0 &&
          chatRequest.tool_choice !== 'none';
        if (wantsTools && !capabilities.includes('tools')) {
          throw new LocalAiError(ERROR_KINDS.TOOLS, `${model} cannot call tools`, { model });
        }
        if (hasImages(chatRequest.messages) && !capabilities.includes('vision')) {
          logger.debug(`${model} has no vision: images replaced by a note`);
          chatRequest = { ...chatRequest, messages: withoutImages(chatRequest.messages) };
        }
        if (capabilities.includes('thinking')) {
          think = role === 'router' ? false : config.thinking;
        }
      }
      logger.debug(`${use} -> ${model}: ${sizeOf(chatRequest)}`);
      const estimate = estimateTokens(chatRequest);
      const fullKey = `${model} ${config.context_window}`;
      const contextFull = capabilities !== null && estimate > config.context_window;
      if (contextFull && !fullReported.has(fullKey)) {
        fullReported.add(fullKey);
        logger.warn(
          `${model}: a request of about ${estimate} tokens exceeds the context window ` +
            `(${config.context_window}): Ollama cuts the start of the prompt, ` +
            'raise the context window in the configuration',
        );
      }
      const timeoutMs = Math.max(1000, deadline - now());
      const completion = await server.chat(config, chatRequest, { model, timeoutMs, think });
      const dropped = boundCompletion(completion);
      if (dropped > 0) {
        logger.warn(`${model} returned ${dropped} invalid or extra tool call(s): dropped`);
      }
      const message = completion.choices[0].message;
      if (!message.content && !message.tool_calls) {
        // The server works: the model said nothing usable this time.
        throw new LocalAiError(
          ERROR_KINDS.REQUEST,
          completion.choices[0].finish_reason === 'length'
            ? 'The answer was cut at max_tokens before any text'
            : 'The model returned an empty answer',
          { model },
        );
      }
      const ms = now() - started;
      const { prompt_tokens: promptTokens, completion_tokens: completionTokens } = completion.usage;
      logger.debug(
        `${use} <- ${model} in ${(ms / 1000).toFixed(1)} s: ${promptTokens} tokens in, ` +
          `${completionTokens} out, ${message.tool_calls?.length ?? 0} tool call(s), ` +
          `${message.content?.length ?? 0} chars (estimate ${estimate} tokens in)`,
      );
      onSuccess({ use, model, ms, contextFull });
      return completion;
    } catch (err) {
      const error =
        err instanceof LocalAiError
          ? err
          : new LocalAiError(ERROR_KINDS.SERVER, String(err?.message ?? err).slice(0, 160));
      error.model ??= model;
      onFailure(error, { use, model });
      throw error;
    }
  };
}
