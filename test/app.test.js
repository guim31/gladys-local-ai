import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiCompletion, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../src/app.js';
import {
  FIXTURES,
  createFakeServer,
  json,
  ollamaRoutes,
  openaiRoutes,
} from './helpers/fake-server.js';

const HOST = 'http://172.30.0.1:1443';
const CONFIG = { model: 'qwen2.5:1.5b', fast_model: 'qwen2.5:0.5b' };
const TOOLS = [
  {
    type: 'function',
    function: { name: 'get_temperature', parameters: { type: 'object', properties: {} } },
  },
];

async function start({ routes = ollamaRoutes(), config = CONFIG } = {}) {
  const fake = createFakeServer(routes);
  const gladys = createFakeGladys({ config });
  let clock = Date.UTC(2026, 10, 9, 12, 0, 0);
  const app = createApp(gladys, {
    fetchImpl: fake.fetch,
    hostApiUrl: HOST,
    now: () => clock,
    statusIntervalMs: 0,
  });
  await gladys.connect();
  await app.whenReady();
  return { gladys, fake, app, tick: (ms) => (clock += ms) };
}

/** Lines the SDK logger writes at info level while `run` runs. */
async function infoLines(run) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await run();
  } finally {
    console.log = original;
  }
  return lines.filter((line) => line.includes('[INFO]'));
}

test('on connection, the status names the server, the models and what is in memory', async () => {
  const { gladys } = await start();
  const status = gladys.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.equal(
    status.message.en,
    'Ollama 0.40.15: chat qwen2.5:1.5b, router qwen2.5:0.5b. In memory: qwen2.5:1.5b (1.4 GB).',
  );
  assert.deepEqual(Object.keys(status.message).sort(), ['de', 'en', 'es', 'fr']);
});

test('the chat goes to the chat model, the router to the fast one without thinking', async () => {
  const { gladys, fake } = await start({
    routes: ollamaRoutes({
      'POST /api/show': () => json({ capabilities: ['completion', 'tools', 'thinking'] }),
      'POST /api/chat': () => json(FIXTURES.chat_tool_call),
    }),
  });
  const chat = await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'Temperature in the kitchen?' }],
    tools: TOOLS,
    purpose: 'chat',
  });
  assert.equal(chat.success, true);
  assert.deepEqual(validateAiCompletion(chat.data), []);
  assert.equal(chat.data.choices[0].message.tool_calls[0].function.name, 'get_temperature');

  const router = await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'Classify' }],
    purpose: 'intent-classification',
  });
  assert.equal(router.success, true);
  const [first, second] = fake.requests.filter((request) => request.path === '/api/chat');
  assert.equal(first.body.model, 'qwen2.5:1.5b');
  assert.equal(first.body.think, false, 'thinking off by default');
  assert.deepEqual(first.body.tools, TOOLS);
  assert.equal(second.body.model, 'qwen2.5:0.5b');
  assert.equal(second.body.think, false);
});

test('a model without tool calling fails at once with a clear reason, once', async () => {
  const { gladys, fake } = await start({
    routes: ollamaRoutes({ 'POST /api/show': () => json({ capabilities: ['completion'] }) }),
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /cannot call tools/);
  const request = { messages: [{ role: 'user', content: 'Hi' }], tools: TOOLS, purpose: 'chat' };
  const first = await gladys.fake.aiChat(request);
  const second = await gladys.fake.aiChat(request);
  assert.equal(first.success, false);
  assert.equal(second.success, false);
  assert.equal(fake.requests.filter((r) => r.path === '/api/chat').length, 0, 'never asked');
  const errors = gladys.fake.sceneEvents.filter((event) => event.key === 'error');
  assert.equal(errors.length, 1, 'one trigger per failure, not per message');
  assert.equal(errors[0].data.kind, 'tools');
  assert.equal(errors[0].data.model, 'qwen2.5:1.5b');
  // Without tools (the router), the same model answers.
  const plain = await gladys.fake.aiChat({ messages: [{ role: 'user', content: 'Hi' }] });
  assert.equal(plain.success, true);
});

test('server down: error trigger and status once, then recovered', async () => {
  const { gladys, fake, tick } = await start();
  fake.down = true;
  const request = { messages: [{ role: 'user', content: 'Hi' }], purpose: 'chat' };
  assert.equal((await gladys.fake.aiChat(request)).success, false);
  assert.equal((await gladys.fake.aiChat(request)).success, false);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Cannot reach the model server at http:\/\/172\.30\.0\.1:11434\/v1/,
  );
  tick(4 * 60_000);
  fake.down = false;
  assert.equal((await gladys.fake.aiChat(request)).success, true);
  const keys = gladys.fake.sceneEvents.map((event) => event.key);
  assert.deepEqual(keys, ['error', 'recovered']);
  assert.deepEqual(gladys.fake.sceneEvents[1].data, { down_minutes: 4 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a model absent from Ollama: status lists the models of the server', async () => {
  const { gladys } = await start({ config: { model: 'llama3.1:8b' } });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'llama3.1:8b is not on the server (ollama pull llama3.1:8b). On the server: qwen2.5:0.5b, qwen2.5:1.5b.',
  );
});

test('no model chosen: the status asks for one; images go to a model without vision as a note', async () => {
  const empty = await start({ config: {} });
  assert.match(empty.gladys.fake.connectionStatus.message.en, /^Type the name of the chat model/);
  const failed = await empty.gladys.fake.aiChat({ messages: [{ role: 'user', content: 'Hi' }] });
  assert.equal(failed.success, false);

  const { gladys, fake } = await start();
  const answer = await gladys.fake.aiChat({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is it?' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA' } },
        ],
      },
    ],
  });
  assert.equal(answer.success, true);
  const chat = fake.requests.find((request) => request.path === '/api/chat');
  assert.equal(chat.body.messages[0].images, undefined);
  assert.match(chat.body.messages[0].content, /cannot see images/);
});

test('an OpenAI-compatible server: passthrough, a model missing from its list is only a note', async () => {
  const { gladys, fake } = await start({
    routes: openaiRoutes(),
    config: { base_url: 'http://192.0.2.10:1234/v1', model: 'other-model' },
  });
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    'OpenAI-compatible server: chat other-model, router other-model. other-model is not in the list of the server: check its name.',
  );
  const answer = await gladys.fake.aiChat({
    messages: [{ role: 'user', content: 'Hi' }],
    tools: TOOLS,
  });
  assert.equal(answer.success, true);
  assert.deepEqual(validateAiCompletion(answer.data), []);
  assert.ok(fake.requests.some((request) => request.path === '/v1/chat/completions'));
  // Load and unload are Ollama-only.
  const load = await gladys.fake.sceneAction('load_model', {});
  assert.equal(load.success, false);
});

test('a normal cycle writes nothing at info level', async () => {
  const { gladys } = await start();
  const lines = await infoLines(async () => {
    await gladys.fake.aiChat({ messages: [{ role: 'user', content: 'Secret question' }] });
    await gladys.fake.widgetGet('server', { settings: {}, language: 'fr' });
  });
  assert.deepEqual(lines, []);
});

test('the widget shows the server, the models in memory and the buttons', async () => {
  const { gladys } = await start();
  await gladys.fake.aiChat({ messages: [{ role: 'user', content: 'Hi' }] });
  const ack = await gladys.fake.widgetGet('server', { settings: {}, language: 'fr' });
  assert.equal(ack.success, true);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => [item.label, item.value]),
    [
      ['Serveur', 'Ollama 0.40.15'],
      ['Modèle du chat', 'qwen2.5:1.5b · 1.4 GB'],
      ['Modèle du routeur', 'qwen2.5:0.5b'],
    ],
  );
  assert.equal(content.components.filter((component) => component.type === 'button').length, 2);
  const hidden = await gladys.fake.widgetGet('server', { settings: { show_buttons: false } });
  assert.equal(
    hidden.data.content.components.filter((component) => component.type === 'button').length,
    0,
  );
  assert.deepEqual(validateWidgetContent(hidden.data.content), []);
});

test('widget buttons and scene actions load and unload the models', async () => {
  const { gladys, fake } = await start();
  const load = await gladys.fake.widgetAction('server', 'load_model', {}, { settings: {} });
  assert.equal(load.success, true);
  assert.match(load.data.message.en, /^qwen2\.5:1\.5b is in memory/);
  const both = await gladys.fake.sceneAction('load_model', { model: 'both' });
  assert.equal(both.success, true);
  const unload = await gladys.fake.sceneAction('unload_models', {});
  assert.deepEqual(unload.data.outputs, { count: 1 });
  const generated = fake.requests.filter((request) => request.path === '/api/generate');
  assert.deepEqual(
    generated.map((request) => [request.body.model, request.body.keep_alive]),
    [
      ['qwen2.5:1.5b', '30m'],
      ['qwen2.5:1.5b', '30m'],
      ['qwen2.5:0.5b', '30m'],
      ['qwen2.5:1.5b', 0],
    ],
  );
});

test('configuration buttons: test the models, list the models', async () => {
  const { gladys } = await start();
  const tested = await gladys.fake.action('test_connection', {});
  assert.equal(tested.success, true);
  const lines = tested.data.message.en.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^Chat — qwen2\.5:1\.5b answered in \d+(\.\d)? s\.$/);
  assert.match(lines[2], /^Router — qwen2\.5:0\.5b answered in/);
  const listed = await gladys.fake.action('list_models', {});
  assert.equal(listed.data.message.fr, 'Modèles sur le serveur (2) : qwen2.5:0.5b, qwen2.5:1.5b');
});

test('a new configuration re-detects the server and logs no secret', async () => {
  const { gladys, fake } = await start();
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await gladys.fake.configUpdated({ ...CONFIG, api_key: 'sk-very-secret' });
  } finally {
    console.log = original;
  }
  assert.ok(lines.some((line) => line.includes('API key set')));
  assert.ok(lines.every((line) => !line.includes('sk-very-secret')));
  assert.equal(fake.requests.filter((request) => request.path === '/api/version').length, 2);
  assert.equal(fake.requests.at(-1).headers.authorization, 'Bearer sk-very-secret');
});
