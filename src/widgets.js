// -----------------------------------------------------------------------------
// Dashboard widget `server`: the model server at a glance.
//
//   tiles   models in memory, memory they take (Ollama), time of the last
//           answer;
//   status  server, chat model, router model, the current failure;
//   buttons load the chat model / free the memory (Ollama only), hidden by
//           the `show_buttons` setting.
// The texts are pre-localized: the core caches the content per language.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { modelFor } from './config.js';
import { gigabytes, sameModel } from './connection.js';
import { languageOf, t } from './i18n.js';

/** Keys of the manifest `widgets` and of their buttons: forever. */
export const WIDGETS = { SERVER: 'server' };
export const WIDGET_ACTIONS = { LOAD: 'load_model', UNLOAD: 'unload_models' };

const MAX_VALUE = 40;

/**
 * @description A status value within the 40 characters of the core.
 * @param {string} value - The value.
 * @returns {string} The value, cut with an ellipsis.
 */
function short(value) {
  return value.length > MAX_VALUE ? `${value.slice(0, MAX_VALUE - 1)}…` : value;
}

/**
 * @description Build the widget content.
 * @param {object} input - What the widget shows.
 * @param {object} input.config - The normalized configuration.
 * @param {object|null} input.server - `{ kind, version }`, null when unreachable.
 * @param {Array<object>|null} input.loaded - Models in memory (Ollama), null otherwise.
 * @param {object|null} input.failing - The current failure.
 * @param {object|null} input.lastAnswer - `{ ms }` of the last answer.
 * @param {object} [input.settings] - The widget settings.
 * @param {string} [input.language] - The language of the user.
 * @returns {object} The widget content.
 */
export function buildServerWidget({
  config,
  server,
  loaded,
  failing,
  lastAnswer,
  settings = {},
  language,
}) {
  const lang = languageOf(language);
  const components = [];
  const ollama = server?.kind === 'ollama';

  if (ollama && loaded) {
    components.push({
      type: 'value',
      value: loaded.length,
      label: t('tileLoaded', lang),
      icon: 'cpu',
    });
    const bytes = loaded.reduce((sum, entry) => sum + entry.size, 0);
    components.push({
      type: 'value',
      value: Number((bytes / 1e9).toFixed(1)),
      unit: 'GB',
      label: t('tileMemory', lang),
      icon: 'hard-drive',
    });
  }
  if (lastAnswer) {
    components.push({
      type: 'value',
      value: Number((lastAnswer.ms / 1000).toFixed(1)),
      unit: 's',
      label: t('tileLastAnswer', lang),
      icon: 'clock',
    });
  }

  const inMemory = (model) => (loaded ?? []).find((entry) => sameModel(entry.name, model));
  const modelRow = (label, model) => {
    if (!model) {
      return { label, value: t('valueNone', lang), color: WIDGET_COLORS.WARNING };
    }
    const entry = inMemory(model);
    return {
      label,
      value: short(entry ? `${model} · ${gigabytes(entry.size)}` : model),
      color: entry ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    };
  };
  let serverValue = t('valueUnreachable', lang);
  if (server) {
    serverValue = ollama
      ? t('serverOllama', lang, { version: server.version })
      : t('serverOpenai', lang);
  }
  const items = [
    {
      label: t('rowServer', lang),
      value: short(serverValue),
      color: server ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
    modelRow(t('rowChat', lang), modelFor(config, 'chat')),
  ];
  if (config.fast_model && config.fast_model !== config.model) {
    items.push(modelRow(t('rowRouter', lang), config.fast_model));
  }
  if (failing) {
    items.push({
      label: t('rowError', lang),
      value: t(`kind_${failing.kind}`, lang),
      color: WIDGET_COLORS.DANGER,
    });
  }
  components.push({ type: 'status', items });

  if (ollama && settings.show_buttons !== false && config.model) {
    components.push({
      type: 'button',
      label: t('buttonLoad', lang),
      icon: 'play',
      action: { key: WIDGET_ACTIONS.LOAD },
    });
    if (loaded && loaded.length > 0) {
      components.push({
        type: 'button',
        label: t('buttonUnload', lang),
        icon: 'power',
        action: { key: WIDGET_ACTIONS.UNLOAD },
      });
    }
  }
  return { ttl_seconds: 30, components };
}
