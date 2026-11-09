// -----------------------------------------------------------------------------
// OpenAI chat completions <-> the native chat API of Ollama (`/api/chat`).
//
// Why not Ollama's own OpenAI-compatible endpoint: it ignores `num_ctx` and
// `keep_alive` (checked on Ollama 0.40.15: the model loads with its default
// 4096-token context, `/api/ps` says so). A scene-creation request of the core
// reaches 10-15k tokens, and Ollama then silently drops the start of the
// prompt: the system prompt and the tools. The native API takes both, so for
// Ollama this module translates:
//   - messages: `developer` becomes `system`; text parts are joined; image
//     parts (data URLs, the core resizes and inlines them) go to `images` as
//     raw base64; an assistant tool call carries its arguments as an object;
//     a tool result carries `tool_call_id` and the `tool_name` of its call;
//   - tools: the same shape, passed as they are; `tool_choice: "none"` drops
//     them (the native API has no tool_choice);
//   - `max_tokens` becomes `options.num_predict`;
//   - the answer becomes one OpenAI chat completion: arguments back to a
//     JSON string, an id for every tool call, `usage` from the eval counters.
// -----------------------------------------------------------------------------

/** What replaces an image the model cannot see, so it can say so. */
export const IMAGE_OMITTED = '[An image was attached, but this model cannot see images.]';

/**
 * @description The text of an OpenAI content (string or list of parts).
 * @param {unknown} content - The content.
 * @returns {string} The text parts joined.
 */
export function textOf(content) {
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      return part?.type === 'text' && typeof part.text === 'string' ? part.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * @description The URLs of the image parts of a content.
 * @param {unknown} content - The content.
 * @returns {Array<string>} The URLs.
 */
function imageUrls(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content
    .filter((part) => part?.type === 'image_url')
    .map((part) => (typeof part.image_url === 'string' ? part.image_url : part.image_url?.url))
    .filter((url) => typeof url === 'string' && url);
}

/**
 * @description Whether a request carries an image.
 * @param {Array<object>} messages - OpenAI messages.
 * @returns {boolean} True when a message has an image part.
 */
export function hasImages(messages) {
  return (messages ?? []).some((message) => imageUrls(message?.content).length > 0);
}

/**
 * @description Replace the images of the messages by a note, for a model
 * without vision: it then answers that it cannot see the picture instead of
 * failing the whole turn.
 * @param {Array<object>} messages - OpenAI messages.
 * @returns {Array<object>} New messages, without image parts.
 */
export function withoutImages(messages) {
  return (messages ?? []).map((message) => {
    if (imageUrls(message?.content).length === 0) {
      return message;
    }
    return {
      ...message,
      content: [textOf(message.content), IMAGE_OMITTED].filter(Boolean).join('\n'),
    };
  });
}

/**
 * @description The arguments of a tool call as an object.
 * @param {unknown} value - A JSON string or an object.
 * @returns {object} The arguments, `{}` when unreadable.
 */
function argumentsObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * @description OpenAI messages -> Ollama messages.
 * @param {Array<object>} messages - The messages of the core.
 * @returns {Array<object>} The native messages.
 */
export function toOllamaMessages(messages) {
  const names = new Map();
  const out = [];
  for (const message of messages ?? []) {
    const role = message?.role === 'developer' ? 'system' : message?.role;
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) {
      continue;
    }
    const native = { role, content: textOf(message.content) };
    const images = imageUrls(message.content)
      .map((url) => /^data:[^,]*;base64,(.*)$/s.exec(url)?.[1])
      .filter(Boolean);
    if (images.length > 0) {
      native.images = images;
    }
    if (role === 'assistant' && Array.isArray(message.tool_calls)) {
      const calls = message.tool_calls
        .filter((call) => typeof call?.function?.name === 'string' && call.function.name)
        .map((call) => {
          if (typeof call.id === 'string' && call.id) {
            names.set(call.id, call.function.name);
          }
          return {
            ...(typeof call.id === 'string' && call.id ? { id: call.id } : {}),
            function: {
              name: call.function.name,
              arguments: argumentsObject(call.function.arguments),
            },
          };
        });
      if (calls.length > 0) {
        native.tool_calls = calls;
      }
    }
    if (role === 'tool') {
      if (typeof message.tool_call_id === 'string' && message.tool_call_id) {
        native.tool_call_id = message.tool_call_id;
        const name = names.get(message.tool_call_id);
        if (name) {
          native.tool_name = name;
        }
      }
    }
    out.push(native);
  }
  return out;
}

/**
 * @description The body of a native chat request.
 * @param {object} request - `{ messages, tools?, tool_choice?, max_tokens? }`.
 * @param {object} options - Options.
 * @param {string} options.model - The model.
 * @param {number} options.contextWindow - `num_ctx`.
 * @param {string} options.keepAlive - `keep_alive`.
 * @param {boolean} [options.think] - `think`, sent only when defined (a
 *   model that cannot think refuses the field).
 * @returns {object} The body of `POST /api/chat`.
 */
export function toOllamaRequest(request, { model, contextWindow, keepAlive, think }) {
  const body = {
    model,
    messages: toOllamaMessages(request?.messages),
    stream: false,
    keep_alive: keepAlive === '-1' ? -1 : keepAlive,
    options: { num_ctx: contextWindow },
  };
  if (Array.isArray(request?.tools) && request.tools.length > 0 && request.tool_choice !== 'none') {
    body.tools = request.tools;
  }
  const maxTokens = Number(request?.max_tokens);
  if (Number.isInteger(maxTokens) && maxTokens > 0) {
    body.options.num_predict = maxTokens;
  }
  if (think !== undefined) {
    body.think = think;
  }
  return body;
}

/**
 * @description A native chat answer -> one OpenAI chat completion.
 * @param {object} answer - The body of the `/api/chat` answer.
 * @param {object} [options] - Options.
 * @param {() => number} [options.now] - Clock.
 * @returns {object} The completion.
 */
export function fromOllamaResponse(answer, { now = Date.now } = {}) {
  const message = answer?.message ?? {};
  const toolCalls = (Array.isArray(message.tool_calls) ? message.tool_calls : [])
    .filter((call) => typeof call?.function?.name === 'string' && call.function.name)
    .map((call, index) => ({
      id: typeof call.id === 'string' && call.id ? call.id : `call_${now().toString(36)}_${index}`,
      type: 'function',
      function: {
        name: call.function.name,
        arguments:
          typeof call.function.arguments === 'string'
            ? call.function.arguments
            : JSON.stringify(call.function.arguments ?? {}),
      },
    }));
  const content = typeof message.content === 'string' ? message.content : '';
  const promptTokens = Number(answer?.prompt_eval_count) || 0;
  const completionTokens = Number(answer?.eval_count) || 0;
  let finishReason = 'stop';
  if (toolCalls.length > 0) {
    finishReason = 'tool_calls';
  } else if (answer?.done_reason === 'length') {
    finishReason = 'length';
  }
  return {
    id: `chatcmpl-ollama-${now().toString(36)}`,
    object: 'chat.completion',
    created: Math.floor(now() / 1000),
    model: answer?.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: content || (toolCalls.length > 0 ? null : ''),
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}
