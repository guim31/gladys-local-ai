// -----------------------------------------------------------------------------
// Connection status and the configuration buttons.
//
// The status shown in Gladys says whether the assistant can answer: the
// server answers, the chosen models are on it, and (with Ollama) the chat
// model can call tools. It names the server, the models and, with Ollama,
// the models in memory. Reading the model list costs nothing: no text is
// generated. The "Test" button does generate a one-word answer per model, to
// show the time it takes.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { modelFor, safeUrl } from './config.js';
import { ERROR_KINDS, LocalAiError } from './server.js';
import { all, t } from './i18n.js';

const logger = createLogger({ name: 'connection' });

/** Both tests together, within the 120 s of the action. */
const TEST_BUDGET_MS = 110_000;
/** Models named in a status at most (a status stays short). */
const STATUS_MODELS = 6;
/** Models named by the "List the models" button at most. */
const LIST_MODELS = 40;

/**
 * @description Whether a model id of the server is the model of the
 * configuration (Ollama adds `:latest` to an untagged name).
 * @param {string} id - An id listed by the server.
 * @param {string} model - The configured model.
 * @returns {boolean} True when they match.
 */
export function sameModel(id, model) {
  return id === model || id === `${model}:latest`;
}

/**
 * @description A short list of model names.
 * @param {Array<string>} models - The names.
 * @param {number} max - How many to name.
 * @returns {(language: string) => string} The list, per language.
 */
function listOf(models, max) {
  return (language) => {
    if (models.length === 0) {
      return t('noneListed', language);
    }
    const shown = models.slice(0, max).join(', ');
    return models.length > max ? `${shown}…` : shown;
  };
}

/**
 * @description The localized reason of a failure.
 * @param {unknown} err - The error.
 * @param {object} config - The normalized configuration.
 * @param {Array<string>} [models] - The models of the server, when known.
 * @returns {Record<string, string>} `{ en, fr, de, es }`.
 */
export function failureMessage(err, config, models = []) {
  const kind = err instanceof LocalAiError ? err.kind : ERROR_KINDS.SERVER;
  const model = err?.model ?? config.model;
  const list = listOf(models, STATUS_MODELS);
  switch (kind) {
    case ERROR_KINDS.CONFIG:
      return config.base_url_resolved
        ? all((language) => t('statusNoModel', language, { models: list(language) }))
        : all('statusBadUrl');
    case ERROR_KINDS.UNREACHABLE:
      return all('statusUnreachable', { url: safeUrl(config.base_url_resolved) });
    case ERROR_KINDS.TIMEOUT:
      return all('statusTimeout', { model });
    case ERROR_KINDS.AUTH:
      return all('statusAuth');
    case ERROR_KINDS.MODEL:
      return all((language) =>
        t('statusModelMissing', language, { model, models: list(language) }),
      );
    case ERROR_KINDS.TOOLS:
      return all('statusTools', { model });
    case ERROR_KINDS.MEMORY:
      return all('statusMemory', { model });
    default:
      return all('statusServerError', { detail: err?.message ?? String(err) });
  }
}

/**
 * @description Size of a model in memory, for people.
 * @param {number} bytes - The size.
 * @returns {string} e.g. `4.7 GB`.
 */
export function gigabytes(bytes) {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/**
 * @description Check the configuration against the server, without
 * generating text.
 * @param {object} server - The server client.
 * @param {object} config - The normalized configuration.
 * @returns {Promise<{ ok: boolean, message: Record<string, string>, server?: object, error?: LocalAiError }>}
 *   The status to show.
 */
export async function checkConnection(server, config) {
  let models = [];
  try {
    if (!config.base_url_resolved) {
      throw new LocalAiError(ERROR_KINDS.CONFIG, 'Invalid address');
    }
    const info = await server.detect(config);
    models = await server.listModels(config);
    if (!config.model) {
      throw new LocalAiError(ERROR_KINDS.CONFIG, 'No model chosen');
    }
    const chosen = [...new Set([modelFor(config, 'chat'), modelFor(config, 'router')])];
    const notListed = chosen.filter((model) => !models.some((id) => sameModel(id, model)));
    const notes = [];
    if (info.kind === 'ollama') {
      if (notListed.length > 0) {
        throw new LocalAiError(ERROR_KINDS.MODEL, 'Model not on the server', {
          model: notListed[0],
        });
      }
      const capabilities = await server.modelCapabilities(config, config.model);
      if (capabilities && !capabilities.includes('tools')) {
        throw new LocalAiError(ERROR_KINDS.TOOLS, 'No tools', { model: config.model });
      }
      const loaded = await server.loadedModels(config).catch(() => []);
      notes.push((language) =>
        loaded.length === 0
          ? t('statusNothingLoaded', language)
          : t('statusLoaded', language, {
              models: loaded.map((entry) => `${entry.name} (${gigabytes(entry.size)})`).join(', '),
            }),
      );
    } else {
      // llama.cpp answers with whatever it loaded, LM Studio loads on
      // demand: a name missing from the list is only a hint there.
      for (const model of notListed) {
        notes.push((language) => t('statusNotListed', language, { model }));
      }
    }
    const message = all((language) =>
      [
        t('statusConnected', language, {
          server:
            info.kind === 'ollama'
              ? t('serverOllama', language, { version: info.version })
              : t('serverOpenai', language),
          chat: modelFor(config, 'chat'),
          router: modelFor(config, 'router'),
        }),
        ...notes.map((note) => note(language)),
      ].join(' '),
    );
    return { ok: true, message, server: info };
  } catch (err) {
    logger.debug(`Connection check failed: ${err?.message ?? err}`);
    return { ok: false, message: failureMessage(err, config, models), error: err };
  }
}

/**
 * @description The "Test" button: one tiny real answer from each model.
 * @param {object} server - The server client.
 * @param {object} config - The normalized configuration.
 * @param {() => number} [now] - Clock.
 * @returns {Promise<Record<string, string>>} The message under the button.
 */
export async function testConnection(server, config, now = Date.now) {
  const status = await checkConnection(server, config);
  if (!status.ok) {
    return status.message;
  }
  const lines = [];
  const tested = new Map();
  const started = now();
  for (const role of ['chat', 'router']) {
    const model = modelFor(config, role);
    if (!tested.has(model)) {
      const begin = now();
      let line;
      try {
        const capabilities = await server.modelCapabilities(config, model);
        await server.chat(
          config,
          {
            messages: [{ role: 'user', content: 'Reply with the single word OK.' }],
            max_tokens: 16,
          },
          {
            model,
            timeoutMs: Math.max(1000, TEST_BUDGET_MS - (now() - started)),
            think: capabilities?.includes('thinking') ? false : undefined,
          },
        );
        const seconds = (now() - begin) / 1000;
        line = (language) =>
          t('testAnswered', language, {
            model,
            seconds: seconds.toLocaleString(language, { maximumFractionDigits: 1 }),
          });
      } catch (err) {
        logger.warn(`Test of ${model} failed: ${err?.message ?? err}`);
        const reason = failureMessage(err, config);
        line = (language) => reason[language];
      }
      tested.set(model, line);
    }
    const line = tested.get(model);
    lines.push((language) => `${t(`role_${role}`, language)} — ${line(language)}`);
  }
  return all((language) =>
    [status.message[language], ...lines.map((line) => line(language))].join('\n'),
  );
}

/**
 * @description The "List the models" button.
 * @param {object} server - The server client.
 * @param {object} config - The normalized configuration.
 * @returns {Promise<Record<string, string>>} The message under the button.
 */
export async function listModelsMessage(server, config) {
  try {
    if (!config.base_url_resolved) {
      throw new LocalAiError(ERROR_KINDS.CONFIG, 'Invalid address');
    }
    const models = await server.listModels(config);
    return all((language) =>
      t('modelsList', language, {
        count: models.length,
        models: listOf(models, LIST_MODELS)(language),
      }),
    );
  } catch (err) {
    return failureMessage(err, config);
  }
}
