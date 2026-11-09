// -----------------------------------------------------------------------------
// Failure tracking and the scene triggers of the manifest.
//
//   - `error`: the assistant stopped answering (server down, model missing,
//     too slow...): once per failure, not once per message. A request the
//     server refused on its own (`request` kind) says nothing about the
//     server: no trigger.
//   - `recovered`: the first answer after a failure.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS } from './server.js';

const logger = createLogger({ name: 'events' });

/** Keys of the manifest `scene_triggers`: stored in users' scenes, forever. */
export const SCENE_TRIGGERS = { ERROR: 'error', RECOVERED: 'recovered' };

/**
 * @description Create the failure tracker.
 * @param {object} options - Options.
 * @param {(key: string, data: object) => Promise<void>} options.publish - `publishSceneEvent`.
 * @param {() => number} [options.now] - Clock.
 * @returns {object} The tracker.
 */
export function createEvents({ publish, now = Date.now }) {
  // null while the assistant answers, else `{ kind, message, since }`.
  let failing = null;
  let lastAnswer = null;

  const fire = (key, data) =>
    Promise.resolve()
      .then(() => publish(key, data))
      .catch((err) => logger.warn(`Scene trigger ${key} not published: ${err?.message ?? err}`));

  return {
    /**
     * @param {import('./server.js').LocalAiError} error - The failure.
     * @param {object} context - `{ use, model }`.
     * @returns {boolean} True when it starts a failure (or changes its kind).
     */
    failure(error, { use, model } = {}) {
      if (error.kind === ERROR_KINDS.REQUEST) {
        return false;
      }
      const changed = !failing || failing.kind !== error.kind;
      if (!failing) {
        fire(SCENE_TRIGGERS.ERROR, {
          kind: error.kind,
          message: String(error.message).slice(0, 300),
          use: use ?? null,
          model: model ?? null,
        });
      }
      failing = { kind: error.kind, message: error.message, since: failing?.since ?? now() };
      return changed;
    },
    /**
     * @param {object} answer - `{ use, model, ms }`.
     * @returns {boolean} True when it ends a failure.
     */
    success({ use, model, ms } = {}) {
      lastAnswer = { use, model, ms, at: now() };
      if (!failing) {
        return false;
      }
      const downMinutes = Math.max(0, Math.round((now() - failing.since) / 60_000));
      failing = null;
      fire(SCENE_TRIGGERS.RECOVERED, { down_minutes: downMinutes });
      return true;
    },
    /** Forget the current failure, without trigger (a new configuration). */
    clear() {
      failing = null;
    },
    /** @returns {object|null} The current failure. */
    state() {
      return failing;
    },
    /** @returns {object|null} The last answer. */
    lastAnswer() {
      return lastAnswer;
    },
  };
}
