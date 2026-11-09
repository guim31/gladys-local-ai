// A fake model server for the tests: a `fetch` that answers from routes
// (`'GET /api/version'` -> handler), records every request and can be told
// to be down. Tests never touch the network.

import { readFileSync } from 'node:fs';

export const FIXTURES = JSON.parse(
  readFileSync(new URL('../fixtures/ollama.json', import.meta.url), 'utf8'),
);

/**
 * @description A JSON answer.
 * @param {unknown} body - The body.
 * @param {number} [status] - The status.
 * @returns {{ status: number, body: unknown }} The answer.
 */
export const json = (body, status = 200) => ({ status, body });

/**
 * @description Routes of a healthy Ollama with the recorded answers.
 * @param {object} [overrides] - Routes to replace.
 * @returns {object} The routes.
 */
export function ollamaRoutes(overrides = {}) {
  return {
    'GET /api/version': () => json(FIXTURES.version),
    'GET /v1/models': () => json(FIXTURES.models),
    'POST /api/show': () => json(FIXTURES.show_tools),
    'GET /api/ps': () => json(FIXTURES.ps),
    'POST /api/chat': () => json(FIXTURES.chat_answer),
    'POST /api/generate': () => json({ done: true }),
    ...overrides,
  };
}

/**
 * @description Routes of an OpenAI-compatible server that is not Ollama.
 * @param {object} [overrides] - Routes to replace.
 * @returns {object} The routes.
 */
export function openaiRoutes(overrides = {}) {
  return {
    'GET /v1/models': () => json({ object: 'list', data: [{ id: 'local-model' }] }),
    'POST /v1/chat/completions': () => json(FIXTURES.openai_tool_call),
    ...overrides,
  };
}

/**
 * @description Create the fake server.
 * @param {object} routes - `'METHOD /path'` -> `(request) => { status, body }`.
 * @returns {{ fetch: typeof fetch, requests: Array<object>, routes: object, down: boolean }} The server.
 */
export function createFakeServer(routes) {
  const server = {
    routes,
    requests: [],
    down: false,
    async fetch(url, init = {}) {
      if (server.down) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      const { pathname, host } = new URL(url);
      const method = init.method ?? 'GET';
      const body = init.body ? JSON.parse(init.body) : undefined;
      const request = { method, path: pathname, host, body, headers: init.headers ?? {} };
      server.requests.push(request);
      const handler = server.routes[`${method} ${pathname}`];
      const answer = handler ? await handler(request) : json({ error: '404 page not found' }, 404);
      const text = typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body);
      return new Response(text, { status: answer.status });
    },
  };
  server.fetch = server.fetch.bind(server);
  return server;
}
