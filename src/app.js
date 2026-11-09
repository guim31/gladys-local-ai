// -----------------------------------------------------------------------------
// SDK wiring: every handler of the integration, registered on the Gladys
// client given, before `connect()`. Kept out of index.js so the tests run it
// against the fake Gladys of the SDK (`createFakeGladys`) and a fake server.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { modelFor, normalizeConfig, safeUrl } from './config.js';
import { createChatHandler } from './chat.js';
import {
  checkConnection,
  failureMessage,
  listModelsMessage,
  testConnection,
} from './connection.js';
import { createEvents } from './events.js';
import { all, t } from './i18n.js';
import { createServerClient, ERROR_KINDS } from './server.js';
import { WIDGET_ACTIONS, WIDGETS, buildServerWidget } from './widgets.js';

const logger = createLogger({ name: 'app' });

/** Keys of the manifest `actions` and `scene_actions`: forever. */
export const ACTIONS = { TEST_CONNECTION: 'test_connection', LIST_MODELS: 'list_models' };
export const SCENE_ACTIONS = { LOAD_MODEL: 'load_model', UNLOAD_MODELS: 'unload_models' };

/** Loading every requested model, within the 120 s of the scene action. */
const LOAD_BUDGET_MS = 115_000;

/** The status (and the models in memory it names) is re-read this often. */
const STATUS_INTERVAL_MS = 5 * 60_000;

/**
 * @description Register the handlers on a Gladys client, before `connect()`.
 * @param {object} gladys - A `GladysIntegration` (or the fake one of the SDK).
 * @param {object} [options] - Test seams.
 * @param {typeof fetch} [options.fetchImpl] - fetch.
 * @param {string} [options.hostApiUrl] - `GLADYS_HOST_API_URL`, for the default address.
 * @param {() => number} [options.now] - Clock.
 * @param {number} [options.statusIntervalMs] - Status refresh period, 0 for none.
 * @returns {object} Handles for the tests.
 */
export function createApp(
  gladys,
  {
    fetchImpl = globalThis.fetch,
    hostApiUrl = process.env.GLADYS_HOST_API_URL,
    now = Date.now,
    statusIntervalMs = STATUS_INTERVAL_MS,
  } = {},
) {
  let config = normalizeConfig({}, hostApiUrl);
  const getConfig = () => config;
  const server = createServerClient({ fetchImpl, now });
  const events = createEvents({ publish: (key, data) => gladys.publishSceneEvent(key, data), now });

  const nudgeWidget = () =>
    Promise.resolve()
      .then(() => gladys.requestWidgetRefresh(WIDGETS.SERVER))
      .catch(() => {});

  // --- Connection status --------------------------------------------------------
  // `connected` is what the status screen shows; the log says only the changes.
  let connected = null;
  const setStatus = async (ok, message) => {
    if (ok !== connected) {
      if (ok) {
        logger.info(`Model server ready at ${safeUrl(config.base_url_resolved)}: ${message.en}`);
      } else {
        logger.warn(`Model server not usable: ${message.en}`);
      }
    }
    connected = ok;
    await Promise.resolve()
      .then(() => gladys.setConnectionStatus(ok, message))
      .catch((err) => logger.warn(`Status not updated: ${err?.message ?? err}`));
  };

  // The localized reason of the current failure of the assistant: a check
  // that reads the models fine generates no text, so it must not clear it.
  let failureStatus = null;
  let checking = null;
  const refreshStatus = () => {
    checking ??= checkConnection(server, config)
      .then(({ ok, message }) =>
        ok && events.state() && failureStatus
          ? setStatus(false, failureStatus)
          : setStatus(ok, message),
      )
      .finally(() => {
        checking = null;
      });
    return checking;
  };

  // --- AI provider: every AI request of the instance arrives here -------------------
  let routerFailing = false;
  gladys.onAiChat(
    createChatHandler({
      server,
      getConfig,
      now,
      onFailure: (error, context) => {
        if (error.kind === ERROR_KINDS.REQUEST) {
          logger.warn(`${context.use} refused by the server: ${error.message}`);
          return;
        }
        // The core swallows the failures of the router (it then offers every
        // tool) and a router waits behind a long chat on a busy CPU: it says
        // nothing of the assistant, one log line per streak.
        if (context.use === 'router') {
          if (!routerFailing) {
            routerFailing = true;
            logger.warn(`The router model failed (${error.kind}): ${error.message}`);
          }
          return;
        }
        const changed = events.failure(error, context);
        failureStatus = failureMessage(error, config);
        if (changed || connected !== false) {
          setStatus(false, failureStatus);
        }
        nudgeWidget();
      },
      onSuccess: (answer) => {
        if (answer.use === 'router') {
          if (routerFailing) {
            routerFailing = false;
            logger.info('The router model answers again');
          }
          return;
        }
        if (events.success(answer)) {
          failureStatus = null;
          logger.info(`The assistant answers again (${answer.use}, ${answer.model})`);
          refreshStatus().catch(() => {});
          nudgeWidget();
        }
      },
    }),
  );

  // --- Configuration buttons ----------------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    logger.info('Action test_connection');
    const message = await testConnection(server, config, now);
    refreshStatus().catch(() => {});
    return message;
  });
  gladys.onAction(ACTIONS.LIST_MODELS, async () => {
    logger.info('Action list_models');
    server.reset();
    return listModelsMessage(server, config);
  });

  // --- Load / unload (scene actions and widget buttons) -------------------------------
  async function requireOllama() {
    const info = await server.detect(config);
    if (info.kind !== 'ollama') {
      throw new Error(all('ollamaOnly').en);
    }
  }

  async function loadModels(which) {
    await requireOllama();
    const roles = { chat: ['chat'], router: ['router'], both: ['chat', 'router'] }[which] ?? [
      'chat',
    ];
    const models = [...new Set(roles.map((role) => modelFor(config, role)).filter(Boolean))];
    if (models.length === 0) {
      throw new Error('No model chosen in the configuration');
    }
    const started = now();
    // One deadline for all the models: the core gives the action 120 s.
    for (const model of models) {
      await server.loadModel(config, model, {
        timeoutMs: Math.max(1000, LOAD_BUDGET_MS - (now() - started)),
      });
    }
    const seconds = Math.round((now() - started) / 100) / 10;
    logger.info(`Loaded ${models.join(', ')} in ${seconds} s`);
    nudgeWidget();
    refreshStatus().catch(() => {});
    return { models, seconds };
  }

  async function unloadModels() {
    await requireOllama();
    const loaded = await server.loadedModels(config);
    for (const entry of loaded) {
      await server.loadModel(config, entry.name, { unload: true });
    }
    logger.info(`Unloaded ${loaded.length} model(s)`);
    nudgeWidget();
    refreshStatus().catch(() => {});
    return loaded.map((entry) => entry.name);
  }

  gladys.onSceneAction(SCENE_ACTIONS.LOAD_MODEL, async (fields = {}) => {
    const { seconds } = await loadModels(fields.model);
    return { seconds };
  });
  gladys.onSceneAction(SCENE_ACTIONS.UNLOAD_MODELS, async () => {
    const names = await unloadModels();
    return { count: names.length };
  });

  // --- Dashboard widget -----------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.SERVER, async ({ settings, language } = {}) => {
    let info = null;
    let loaded = null;
    try {
      info = await server.detect(config);
      if (info.kind === 'ollama') {
        loaded = await server.loadedModels(config);
      }
    } catch {
      // unreachable: the widget says so
    }
    return buildServerWidget({
      config,
      server: info,
      loaded,
      failing: events.state(),
      lastAnswer: events.lastAnswer(),
      settings,
      language,
    });
  });

  gladys.onWidgetAction(WIDGETS.SERVER, async (actionKey) => {
    logger.info(`Widget action ${actionKey}`);
    if (actionKey === WIDGET_ACTIONS.LOAD) {
      const { models, seconds } = await loadModels('chat');
      return all('modelLoaded', { model: models.join(', '), seconds });
    }
    if (actionKey === WIDGET_ACTIONS.UNLOAD) {
      const names = await unloadModels();
      return all((language) =>
        t('modelsUnloaded', language, { models: names.join(', ') || t('noneListed', language) }),
      );
    }
    throw new Error(`Unknown widget action ${actionKey}`);
  });

  // --- Configuration ------------------------------------------------------------------
  async function applyConfig(raw, { changed = false } = {}) {
    config = normalizeConfig(raw, hostApiUrl);
    server.reset();
    connected = null;
    // A reconnection to Gladys keeps the failure. A new configuration lets
    // the status show the check again, but the failure itself ends with the
    // next answer of the chat, which fires `recovered`.
    if (changed) {
      failureStatus = null;
      routerFailing = false;
    }
    logger.info(
      `Configuration: server ${safeUrl(config.base_url_resolved)}, chat ${config.model || '(none)'}, ` +
        `router ${modelFor(config, 'router') || '(none)'}, context ${config.context_window}, ` +
        `keep_alive ${config.keep_alive}, thinking ${config.thinking ? 'on' : 'off'}, ` +
        `timeout ${config.timeout_seconds} s, API key ${config.api_key ? 'set' : 'none'}`,
    );
    await refreshStatus();
    nudgeWidget();
  }

  gladys.onConfigUpdated(async (raw) => {
    await applyConfig(raw, { changed: true });
  });

  // Each (re)connection re-reads the configuration, which may have changed
  // while the integration was away. The promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await applyConfig(await gladys.getConfig());
    })().catch(async (err) => {
      logger.error('Post-connection initialization failed', err);
      await setStatus(false, all('statusInitFailed'));
    });
  });

  let timer = null;
  if (statusIntervalMs > 0) {
    timer = setInterval(() => {
      if (gladys.connected) {
        refreshStatus().catch(() => {});
      }
    }, statusIntervalMs);
    timer.unref?.();
  }

  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearInterval(timer);
  });

  return {
    getConfig,
    events,
    server,
    whenReady: () => startup,
    stop: () => clearInterval(timer),
  };
}
