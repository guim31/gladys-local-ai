import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiCompletion } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from '../src/config.js';
import { ERROR_KINDS, createServerClient, kindOf, normalizeCompletion } from '../src/server.js';
import {
  FIXTURES,
  createFakeServer,
  json,
  ollamaRoutes,
  openaiRoutes,
} from './helpers/fake-server.js';

const HOST = 'http://172.30.0.1:1443';
const config = (raw = {}) => normalizeConfig({ model: 'qwen2.5:1.5b', ...raw }, HOST);
const ask = { messages: [{ role: 'user', content: 'Hi' }] };

test('Ollama is detected and answered through its native API, with num_ctx and keep_alive', async () => {
  const fake = createFakeServer(ollamaRoutes());
  const server = createServerClient({ fetchImpl: fake.fetch });
  assert.deepEqual(await server.detect(config()), { kind: 'ollama', version: '0.40.15' });
  const completion = await server.chat(config({ context_window: 32768, keep_alive: '2h' }), ask, {
    model: 'qwen2.5:1.5b',
    timeoutMs: 5000,
  });
  assert.deepEqual(validateAiCompletion(completion), []);
  const chat = fake.requests.find((request) => request.path === '/api/chat');
  assert.equal(chat.host, '172.30.0.1:11434', 'the default address is the host of Gladys');
  assert.equal(chat.body.options.num_ctx, 32768);
  assert.equal(chat.body.keep_alive, '2h');
  assert.equal(chat.body.stream, false);
  assert.equal(
    fake.requests.filter((request) => request.path === '/api/version').length,
    1,
    'detection cached',
  );
});

test('another server gets the OpenAI API, the API key as a Bearer token', async () => {
  const fake = createFakeServer(openaiRoutes());
  const server = createServerClient({ fetchImpl: fake.fetch });
  const cfg = config({ base_url: 'http://192.0.2.10:1234', api_key: 'sk-local' });
  assert.deepEqual(await server.detect(cfg), { kind: 'openai' });
  assert.equal(await server.modelCapabilities(cfg, 'local-model'), null);
  const tools = [{ type: 'function', function: { name: 'get_temperature' } }];
  const completion = await server.chat(
    cfg,
    { ...ask, tools, tool_choice: 'auto', max_tokens: 500 },
    { model: 'local-model', timeoutMs: 5000 },
  );
  assert.deepEqual(validateAiCompletion(completion), []);
  const chat = fake.requests.find((request) => request.path === '/v1/chat/completions');
  assert.deepEqual(chat.body, {
    model: 'local-model',
    messages: ask.messages,
    stream: false,
    tools,
    tool_choice: 'auto',
    max_tokens: 500,
  });
  assert.equal(chat.headers.authorization, 'Bearer sk-local');
  assert.deepEqual(await server.listModels(cfg), ['local-model']);
});

test('a server down is not cached as "not Ollama"', async () => {
  const fake = createFakeServer(ollamaRoutes());
  const server = createServerClient({ fetchImpl: fake.fetch });
  fake.down = true;
  await assert.rejects(server.detect(config()), { kind: ERROR_KINDS.UNREACHABLE });
  fake.down = false;
  assert.equal((await server.detect(config())).kind, 'ollama');
});

test('errors are sorted into kinds, with the recorded messages', async () => {
  const fake = createFakeServer(
    ollamaRoutes({ 'POST /api/chat': () => json(FIXTURES.native_model_not_found, 404) }),
  );
  const server = createServerClient({ fetchImpl: fake.fetch });
  await assert.rejects(server.chat(config(), ask, { model: 'nope', timeoutMs: 5000 }), {
    kind: ERROR_KINDS.MODEL,
    message: "HTTP 404: model 'nope' not found",
  });
  assert.equal(kindOf(404, FIXTURES.openai_model_not_found.error.message), ERROR_KINDS.MODEL);
  assert.equal(
    kindOf(400, 'registry.ollama.ai/library/gemma3:270m does not support tools'),
    ERROR_KINDS.TOOLS,
  );
  assert.equal(
    kindOf(500, 'model requires more system memory (9.1 GiB) than is available (3.2 GiB)'),
    ERROR_KINDS.MEMORY,
  );
  assert.equal(kindOf(401, 'Unauthorized'), ERROR_KINDS.AUTH);
  assert.equal(kindOf(400, 'the request exceeds the available context size'), ERROR_KINDS.REQUEST);
  assert.equal(kindOf(503, 'Loading model'), ERROR_KINDS.SERVER);
});

test('a wrong path says to check the address, an invalid address never calls', async () => {
  const fake = createFakeServer({});
  const server = createServerClient({ fetchImpl: fake.fetch });
  const cfg = config({ base_url: 'http://192.0.2.10:8080/api' });
  await assert.rejects(server.listModels(cfg), (err) => {
    assert.equal(err.kind, ERROR_KINDS.SERVER);
    assert.match(err.message, /check the address/);
    return true;
  });
  await assert.rejects(server.detect(config({ base_url: 'ftp://x' })), {
    kind: ERROR_KINDS.CONFIG,
  });
});

test('a server that does not answer in time is a timeout', async () => {
  const fake = createFakeServer(ollamaRoutes({ 'POST /api/chat': () => new Promise(() => {}) }));
  const slow = async (url, init) => {
    const pending = fake.fetch(url, init);
    return Promise.race([
      pending,
      new Promise((_, reject) =>
        init.signal.addEventListener('abort', () => reject(init.signal.reason)),
      ),
    ]);
  };
  const server = createServerClient({ fetchImpl: slow });
  await assert.rejects(server.chat(config(), ask, { model: 'qwen2.5:1.5b', timeoutMs: 50 }), {
    kind: ERROR_KINDS.TIMEOUT,
  });
});

test('load and unload, loaded models and capabilities (Ollama)', async () => {
  const fake = createFakeServer(ollamaRoutes());
  const server = createServerClient({ fetchImpl: fake.fetch });
  await server.loadModel(config({ keep_alive: '-1' }), 'qwen2.5:1.5b');
  await server.loadModel(config(), 'qwen2.5:1.5b', { unload: true });
  const [load, unload] = fake.requests.filter((request) => request.path === '/api/generate');
  assert.deepEqual(load.body, {
    model: 'qwen2.5:1.5b',
    keep_alive: -1,
    options: { num_ctx: 16384 },
  });
  assert.deepEqual(unload.body, { model: 'qwen2.5:1.5b', keep_alive: 0 });
  assert.deepEqual(await server.loadedModels(config()), [
    {
      name: 'qwen2.5:1.5b',
      size: 1373959618,
      context: 8192,
      expiresAt: '2026-11-09T11:37:03.631482139Z',
    },
  ]);
  assert.deepEqual(await server.modelCapabilities(config(), 'qwen2.5:1.5b'), [
    'completion',
    'tools',
  ]);
});

test('OpenAI-compatible answers are tidied: object arguments, missing ids, reasoning dropped', () => {
  const completion = normalizeCompletion(
    {
      choices: [
        {
          message: {
            role: 'assistant',
            content: null,
            reasoning_content: 'thinking...',
            tool_calls: [{ type: 'function', function: { name: 'turn_on', arguments: { id: 2 } } }],
          },
        },
      ],
    },
    { now: () => 0 },
  );
  assert.deepEqual(validateAiCompletion(completion), []);
  const call = completion.choices[0].message.tool_calls[0];
  assert.equal(call.function.arguments, '{"id":2}');
  assert.match(call.id, /^call_/);
  assert.equal('reasoning_content' in completion.choices[0].message, false);
  assert.throws(() => normalizeCompletion({ choices: [] }), { kind: ERROR_KINDS.SERVER });
});
