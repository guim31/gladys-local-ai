// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the administrator in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module holds the defaults (they
// MUST match the manifest `default` values, see test/manifest.test.js) and
// normalizes the received object, so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

/** Port of Ollama: the default server, on the Gladys host. */
export const OLLAMA_PORT = 11434;

export const CONTEXT_WINDOW_MIN = 2048;
export const CONTEXT_WINDOW_MAX = 262144;
export const TIMEOUT_MIN_S = 20;
/** The core waits 120 s for a chat answer: give up just before it. */
export const TIMEOUT_MAX_S = 115;

export const KEEP_ALIVE_VALUES = ['5m', '30m', '2h', '24h', '-1'];

export const DEFAULT_CONFIG = {
  // Empty: Ollama on the Gladys host (see defaultBaseUrl).
  base_url: '',
  api_key: '',
  model: '',
  // Empty: the chat model answers the router too.
  fast_model: '',
  // Ollama only. A scene-creation request of the core reaches 10-15k tokens;
  // Ollama defaults to 4096 and silently cuts the start of the prompt.
  context_window: 16384,
  // Ollama only: how long a model stays in memory after a request.
  keep_alive: '30m',
  // Ollama only, for models that can think (qwen3, deepseek-r1...): off by
  // default, a CPU model thinking for a minute makes the chat unusable.
  thinking: false,
  timeout_seconds: 110,
};

/**
 * @description Clamp an integer.
 * @param {unknown} value - The raw value.
 * @param {number} fallback - Used when the value is not a number.
 * @param {number} min - Lower bound.
 * @param {number} max - Upper bound.
 * @returns {number} The integer.
 */
function clampInt(value, fallback, min, max) {
  const number = Math.round(Number(value));
  if (value === '' || value === null || value === undefined || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

/**
 * @description A trimmed string, empty for anything else.
 * @param {unknown} value - The raw value.
 * @returns {string} The string.
 */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @description The default server address: Ollama on the host that runs
 * Gladys, whose integrations reach it through the hostname of the host API
 * (the gateway of the integrations network, `172.30.0.1` on a standard
 * install).
 * @param {string} [hostApiUrl] - `GLADYS_HOST_API_URL`.
 * @returns {string} The base URL, with `/v1`.
 */
export function defaultBaseUrl(hostApiUrl = process.env.GLADYS_HOST_API_URL) {
  let host = '172.30.0.1';
  try {
    host = new URL(hostApiUrl).hostname || host;
  } catch {
    // keep the standard gateway
  }
  return `http://${host.includes(':') ? `[${host}]` : host}:${OLLAMA_PORT}/v1`;
}

/**
 * @description Normalize the base URL typed by the administrator: scheme
 * added when missing, trailing slashes removed, `/v1` added to a bare
 * `host:port` (every OpenAI-compatible server serves it there).
 * @param {string} raw - The typed value.
 * @param {string} [hostApiUrl] - `GLADYS_HOST_API_URL`, for the default.
 * @returns {string|null} The base URL, null when it is not a valid http(s) URL.
 */
export function normalizeBaseUrl(raw, hostApiUrl) {
  const typed = text(raw);
  if (!typed) {
    return defaultBaseUrl(hostApiUrl);
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `http://${typed}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '');
  url.pathname = path === '' ? '/v1' : path;
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/+$/, '');
}

/**
 * @description Merge the configuration of Gladys with the defaults.
 * @param {Record<string, unknown>} [raw] - The configuration from the SDK.
 * @param {string} [hostApiUrl] - `GLADYS_HOST_API_URL`, for the default address.
 * @returns {object} The normalized configuration, with `base_url_resolved`.
 */
export function normalizeConfig(raw = {}, hostApiUrl) {
  const config = raw ?? {};
  const keepAlive = text(config.keep_alive);
  return {
    base_url: text(config.base_url),
    base_url_resolved: normalizeBaseUrl(config.base_url, hostApiUrl),
    api_key: text(config.api_key),
    model: text(config.model),
    fast_model: text(config.fast_model),
    context_window: clampInt(
      config.context_window,
      DEFAULT_CONFIG.context_window,
      CONTEXT_WINDOW_MIN,
      CONTEXT_WINDOW_MAX,
    ),
    keep_alive: KEEP_ALIVE_VALUES.includes(keepAlive) ? keepAlive : DEFAULT_CONFIG.keep_alive,
    thinking: config.thinking === true || config.thinking === 'true',
    timeout_seconds: clampInt(
      config.timeout_seconds,
      DEFAULT_CONFIG.timeout_seconds,
      TIMEOUT_MIN_S,
      TIMEOUT_MAX_S,
    ),
  };
}

/**
 * @description The model that answers a role.
 * @param {object} config - The normalized configuration.
 * @param {'chat'|'router'} role - The role.
 * @returns {string} The model id, empty when none is chosen.
 */
export function modelFor(config, role) {
  return role === 'router' ? config.fast_model || config.model : config.model;
}

/**
 * @description The base URL with its credentials masked, for the logs.
 * @param {string|null} baseUrl - The base URL.
 * @returns {string} Safe to log.
 */
export function safeUrl(baseUrl) {
  if (!baseUrl) {
    return '(invalid address)';
  }
  try {
    const url = new URL(baseUrl);
    url.username = '';
    url.password = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '(invalid address)';
  }
}
