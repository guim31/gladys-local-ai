// -----------------------------------------------------------------------------
// The model server: Ollama, LM Studio, llama.cpp `llama-server`, LocalAI,
// vLLM... reached over HTTP at the base URL of the configuration.
//
// Every one of them serves the OpenAI API (`/v1/models`,
// `/v1/chat/completions`). Ollama is recognized by `GET /api/version` next to
// `/v1` and then gets its native chat API (src/ollama.js says why), plus the
// calls only Ollama has: model capabilities (`/api/show`), loaded models
// (`/api/ps`), load and unload (`/api/generate`).
//
// Nothing of a request or an answer is logged here: the errors carry the
// status and the short message of the server only.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { fromOllamaResponse, textOf, toOllamaRequest } from './ollama.js';

const logger = createLogger({ name: 'server' });

export const ERROR_KINDS = {
  /** No address, or no model chosen. */
  CONFIG: 'config',
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  /** The model is not on the server. */
  MODEL: 'model',
  /** The model cannot call tools. */
  TOOLS: 'tools',
  /** The server lacks the memory to load the model. */
  MEMORY: 'memory',
  /** The server refused this request only (400): says nothing about the server. */
  REQUEST: 'request',
  SERVER: 'server',
};

const DETECT_TIMEOUT_MS = 4000;
const INFO_TIMEOUT_MS = 8000;
const MAX_ERROR_CHARS = 160;

export class LocalAiError extends Error {
  /**
   * @param {string} kind - One of ERROR_KINDS.
   * @param {string} message - English, safe to log.
   * @param {object} [extra] - `{ status, model }`.
   */
  constructor(kind, message, { status, model } = {}) {
    super(message);
    this.name = 'LocalAiError';
    this.kind = kind;
    this.status = status;
    this.model = model;
  }
}

/**
 * @description The short error message of a server answer.
 * @param {string} body - The raw body.
 * @returns {string} The message, bounded.
 */
function errorText(body) {
  let message = body;
  try {
    const parsed = JSON.parse(body);
    message = parsed?.error?.message ?? parsed?.error ?? parsed?.message ?? body;
  } catch {
    // not JSON: the raw text
  }
  return String(typeof message === 'string' ? message : JSON.stringify(message))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ERROR_CHARS);
}

/**
 * @description The kind of an HTTP error of the server.
 * @param {number} status - The HTTP status.
 * @param {string} message - Its message.
 * @returns {string} One of ERROR_KINDS.
 */
export function kindOf(status, message) {
  if (
    /does not support tools|tools? (are|is) not supported|tool calling is not supported/i.test(
      message,
    )
  ) {
    return ERROR_KINDS.TOOLS;
  }
  if (
    /more system memory|out of memory|insufficient memory|not enough memory|cudaMalloc failed/i.test(
      message,
    )
  ) {
    return ERROR_KINDS.MEMORY;
  }
  if (status === 401 || status === 403) {
    return ERROR_KINDS.AUTH;
  }
  if (status === 404 && /model/i.test(message)) {
    return ERROR_KINDS.MODEL;
  }
  if (status === 400 || status === 413 || status === 422) {
    return /model .*(not found|not loaded|does not exist)|no such model|unknown model/i.test(
      message,
    )
      ? ERROR_KINDS.MODEL
      : ERROR_KINDS.REQUEST;
  }
  return ERROR_KINDS.SERVER;
}

/**
 * @description The root of Ollama for a base URL (without `/v1`).
 * @param {string} baseUrl - The base URL.
 * @returns {string} The root.
 */
export function rootOf(baseUrl) {
  return baseUrl.replace(/\/v1$/, '');
}

/**
 * @description Create the client of the model server.
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {() => number} [options.now] - Clock.
 * @returns {object} The client.
 */
export function createServerClient({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  // base URL -> Promise<{ kind, version? }>
  const detected = new Map();
  // `${base} ${model}` -> capabilities (Ollama only)
  const capabilities = new Map();

  async function request(config, url, { method = 'GET', body, timeoutMs, model } = {}) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (config.api_key) {
      headers.authorization = `Bearer ${config.api_key}`;
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new LocalAiError(
          ERROR_KINDS.TIMEOUT,
          `No answer within ${Math.round(timeoutMs / 1000)} s`,
          {
            model,
          },
        );
      }
      const code = err?.cause?.code ?? err?.code;
      throw new LocalAiError(
        ERROR_KINDS.UNREACHABLE,
        `Cannot reach the server${code ? ` (${code})` : ''}`,
        { model },
      );
    }
    const raw = await response.text().catch(() => '');
    if (!response.ok) {
      const message = errorText(raw) || response.statusText;
      const kind = kindOf(response.status, message);
      if (response.status === 404 && kind !== ERROR_KINDS.MODEL) {
        throw new LocalAiError(
          ERROR_KINDS.SERVER,
          `HTTP 404 on ${new URL(url).pathname}: check the address (it usually ends with /v1)`,
          { status: 404, model },
        );
      }
      throw new LocalAiError(kind, `HTTP ${response.status}: ${message}`, {
        status: response.status,
        model,
      });
    }
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      throw new LocalAiError(ERROR_KINDS.SERVER, 'The server answered something else than JSON', {
        model,
      });
    }
  }

  function requireBase(config) {
    if (!config.base_url_resolved) {
      throw new LocalAiError(ERROR_KINDS.CONFIG, 'The server address is not a valid http(s) URL');
    }
    return config.base_url_resolved;
  }

  /**
   * @description Which server answers: Ollama (native API next to /v1) or
   * any other OpenAI-compatible one. Cached per address; a failed probe is
   * not cached.
   * @param {object} config - The normalized configuration.
   * @returns {Promise<{ kind: 'ollama'|'openai', version?: string }>} The server.
   */
  function detect(config) {
    if (!config.base_url_resolved) {
      return Promise.reject(
        new LocalAiError(ERROR_KINDS.CONFIG, 'The server address is not a valid http(s) URL'),
      );
    }
    const base = config.base_url_resolved;
    if (!detected.has(base)) {
      const probe = request(config, `${rootOf(base)}/api/version`, { timeoutMs: DETECT_TIMEOUT_MS })
        .then((answer) =>
          typeof answer?.version === 'string'
            ? { kind: 'ollama', version: answer.version }
            : { kind: 'openai' },
        )
        .catch((err) => {
          // Only "no such route" says the server is not Ollama. A proxy in
          // 502 while Ollama starts must not send every request to its /v1
          // endpoint, which ignores the context window.
          if ([400, 404, 405].includes(err.status)) {
            return { kind: 'openai' };
          }
          detected.delete(base);
          throw err;
        });
      detected.set(base, probe);
    }
    return detected.get(base);
  }

  /**
   * @description Forget what was learnt about the servers (new address,
   * models pulled or removed).
   */
  function reset() {
    detected.clear();
    capabilities.clear();
  }

  async function listModels(config) {
    const answer = await request(config, `${requireBase(config)}/models`, {
      timeoutMs: INFO_TIMEOUT_MS,
    });
    const list = Array.isArray(answer?.data) ? answer.data : [];
    return list
      .map((entry) => entry?.id)
      .filter((id) => typeof id === 'string' && id)
      .sort((a, b) => a.localeCompare(b));
  }

  /**
   * @description What an Ollama model can do (`completion`, `tools`,
   * `vision`, `thinking`...), cached. Null when the server is not Ollama or
   * does not say.
   * @param {object} config - The normalized configuration.
   * @param {string} model - The model.
   * @returns {Promise<Array<string>|null>} The capabilities.
   */
  async function modelCapabilities(config, model) {
    const server = await detect(config);
    if (server.kind !== 'ollama') {
      return null;
    }
    const key = `${config.base_url_resolved} ${model}`;
    if (!capabilities.has(key)) {
      const answer = await request(config, `${rootOf(config.base_url_resolved)}/api/show`, {
        method: 'POST',
        body: { model },
        timeoutMs: INFO_TIMEOUT_MS,
        model,
      });
      capabilities.set(key, Array.isArray(answer?.capabilities) ? answer.capabilities : null);
    }
    return capabilities.get(key);
  }

  /**
   * @description The models Ollama holds in memory.
   * @param {object} config - The normalized configuration.
   * @returns {Promise<Array<{ name: string, size: number, context: number, expiresAt: string }>>} The models.
   */
  async function loadedModels(config) {
    const answer = await request(config, `${rootOf(requireBase(config))}/api/ps`, {
      timeoutMs: INFO_TIMEOUT_MS,
    });
    return (Array.isArray(answer?.models) ? answer.models : []).map((entry) => ({
      name: String(entry?.name ?? entry?.model ?? ''),
      size: Number(entry?.size) || 0,
      context: Number(entry?.context_length) || 0,
      expiresAt: typeof entry?.expires_at === 'string' ? entry.expires_at : '',
    }));
  }

  /**
   * @description Load a model in Ollama with the context window of the
   * configuration (a later request with the same options reuses it), or
   * unload it.
   * @param {object} config - The normalized configuration.
   * @param {string} model - The model.
   * @param {object} [options] - Options.
   * @param {boolean} [options.unload] - Unload instead.
   * @param {number} [options.timeoutMs] - Deadline.
   * @returns {Promise<void>}
   */
  async function loadModel(config, model, { unload = false, timeoutMs = 110_000 } = {}) {
    const keepAlive = config.keep_alive === '-1' ? -1 : config.keep_alive;
    await request(config, `${rootOf(requireBase(config))}/api/generate`, {
      method: 'POST',
      body: unload
        ? { model, keep_alive: 0 }
        : { model, keep_alive: keepAlive, options: { num_ctx: config.context_window } },
      timeoutMs,
      model,
    });
  }

  /**
   * @description One chat completion, in the dialect of the server.
   * @param {object} config - The normalized configuration.
   * @param {object} request - `{ messages, tools?, tool_choice?, max_tokens? }`.
   * @param {object} options - Options.
   * @param {string} options.model - The model.
   * @param {number} options.timeoutMs - Deadline.
   * @param {boolean} [options.think] - Ollama `think`, when the model thinks.
   * @returns {Promise<object>} An OpenAI chat completion.
   */
  async function chat(config, chatRequest, { model, timeoutMs, think }) {
    const server = await detect(config);
    if (server.kind === 'ollama') {
      const body = toOllamaRequest(chatRequest, {
        model,
        contextWindow: config.context_window,
        keepAlive: config.keep_alive,
        think,
      });
      const answer = await request(config, `${rootOf(config.base_url_resolved)}/api/chat`, {
        method: 'POST',
        body,
        timeoutMs,
        model,
      });
      if (typeof answer?.error === 'string') {
        throw new LocalAiError(kindOf(500, answer.error), errorText(answer.error), { model });
      }
      return fromOllamaResponse(answer, { now });
    }
    const body = { model, messages: chatRequest.messages, stream: false };
    if (Array.isArray(chatRequest.tools) && chatRequest.tools.length > 0) {
      body.tools = chatRequest.tools;
      if (chatRequest.tool_choice !== undefined) {
        body.tool_choice = chatRequest.tool_choice;
      }
    }
    if (Number.isInteger(chatRequest.max_tokens) && chatRequest.max_tokens > 0) {
      body.max_tokens = chatRequest.max_tokens;
    }
    const answer = await request(config, `${config.base_url_resolved}/chat/completions`, {
      method: 'POST',
      body,
      timeoutMs,
      model,
    });
    return normalizeCompletion(answer, { now });
  }

  logger.debug('Model server client ready');
  return { detect, reset, listModels, modelCapabilities, loadedModels, loadModel, chat };
}

/**
 * @description Tidy the completion of an OpenAI-compatible server into what
 * the core accepts: `content` a string or null, tool call arguments a JSON
 * string, an id on every call. Reasoning fields are dropped.
 * @param {object} answer - The completion of the server.
 * @param {object} [options] - Options.
 * @param {() => number} [options.now] - Clock.
 * @returns {object} The completion.
 */
export function normalizeCompletion(answer, { now = Date.now } = {}) {
  const choice = Array.isArray(answer?.choices) ? answer.choices[0] : undefined;
  const message = choice?.message;
  if (!message || typeof message !== 'object') {
    throw new LocalAiError(ERROR_KINDS.SERVER, 'The server answered without choices[0].message');
  }
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
    .filter((call) => typeof call?.function?.name === 'string' && call.function.name)
    .map((call, index) => ({
      id: typeof call.id === 'string' && call.id ? call.id : `call_${now().toString(36)}_${index}`,
      type: 'function',
      function: {
        name: call.function.name,
        arguments:
          typeof call.function.arguments === 'string'
            ? call.function.arguments || '{}'
            : JSON.stringify(call.function.arguments ?? {}),
      },
    }));
  const content = textOf(message.content);
  return {
    id: answer.id ?? `chatcmpl-${now().toString(36)}`,
    object: 'chat.completion',
    created: Number(answer.created) || Math.floor(now() / 1000),
    model: answer.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content || (toolCalls.length > 0 ? null : ''),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: choice.finish_reason ?? (toolCalls.length > 0 ? 'tool_calls' : 'stop'),
      },
    ],
    usage: {
      prompt_tokens: Number(answer.usage?.prompt_tokens) || 0,
      completion_tokens: Number(answer.usage?.completion_tokens) || 0,
      total_tokens: Number(answer.usage?.total_tokens) || 0,
    },
  };
}
