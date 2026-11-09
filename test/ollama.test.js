import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiCompletion } from '@gladysassistant/integration-sdk';
import {
  IMAGE_OMITTED,
  fromOllamaResponse,
  hasImages,
  toOllamaMessages,
  toOllamaRequest,
  withoutImages,
} from '../src/ollama.js';
import { FIXTURES } from './helpers/fake-server.js';

const now = () => Date.UTC(2026, 10, 9, 12, 0, 0);
const IMAGE = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

test('messages: roles, text parts, images, tool calls and their results', () => {
  const messages = toOllamaMessages([
    { role: 'developer', content: 'You are Gladys.' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is on this picture?' },
        { type: 'image_url', image_url: { url: IMAGE } },
      ],
    },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'get_temperature', arguments: '{"room":"kitchen"}' },
        },
        { id: 'call_2', type: 'function', function: { name: 'get_time', arguments: 'not json' } },
      ],
    },
    { role: 'tool', tool_call_id: 'call_1', content: '{"temperature":21.5}' },
    { role: 'tool', tool_call_id: 'call_2', content: '12:00' },
    { role: 'function', content: 'legacy role, dropped' },
  ]);
  assert.deepEqual(messages, [
    { role: 'system', content: 'You are Gladys.' },
    { role: 'user', content: 'What is on this picture?', images: ['/9j/4AAQSkZJRg=='] },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', function: { name: 'get_temperature', arguments: { room: 'kitchen' } } },
        { id: 'call_2', function: { name: 'get_time', arguments: {} } },
      ],
    },
    {
      role: 'tool',
      content: '{"temperature":21.5}',
      tool_call_id: 'call_1',
      tool_name: 'get_temperature',
    },
    { role: 'tool', content: '12:00', tool_call_id: 'call_2', tool_name: 'get_time' },
  ]);
});

test('request: context window, keep_alive, max_tokens, tools, think', () => {
  const tools = [
    { type: 'function', function: { name: 'get_time', parameters: { type: 'object' } } },
  ];
  const body = toOllamaRequest(
    { messages: [{ role: 'user', content: 'Hi' }], tools, max_tokens: 800 },
    { model: 'qwen3:8b', contextWindow: 16384, keepAlive: '30m', think: false },
  );
  assert.deepEqual(body, {
    model: 'qwen3:8b',
    messages: [{ role: 'user', content: 'Hi' }],
    stream: false,
    keep_alive: '30m',
    options: { num_ctx: 16384, num_predict: 800 },
    tools,
    think: false,
  });
  // "Always" is the number -1 for Ollama; tool_choice none drops the tools;
  // `think` is never sent to a model that cannot think.
  const other = toOllamaRequest(
    { messages: [], tools, tool_choice: 'none' },
    { model: 'm', contextWindow: 8192, keepAlive: '-1' },
  );
  assert.equal(other.keep_alive, -1);
  assert.equal(other.tools, undefined);
  assert.equal('think' in other, false);
  assert.equal(other.options.num_predict, undefined);
});

test('answer: a recorded tool call becomes a completion Gladys accepts', () => {
  const completion = fromOllamaResponse(FIXTURES.chat_tool_call, { now });
  assert.deepEqual(validateAiCompletion(completion), []);
  assert.deepEqual(completion.choices[0], {
    index: 0,
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_fkt5eji1',
          type: 'function',
          function: { name: 'get_temperature', arguments: '{"room":"kitchen"}' },
        },
      ],
    },
    finish_reason: 'tool_calls',
  });
  assert.deepEqual(completion.usage, {
    prompt_tokens: 156,
    completion_tokens: 21,
    total_tokens: 177,
  });
});

test('answer: a recorded text answer, and a call without id gets one', () => {
  const completion = fromOllamaResponse(FIXTURES.chat_answer, { now });
  assert.deepEqual(validateAiCompletion(completion), []);
  assert.equal(
    completion.choices[0].message.content,
    'The temperature in the kitchen is 21.5 degrees Celsius.',
  );
  assert.equal(completion.choices[0].finish_reason, 'stop');

  const noId = fromOllamaResponse(
    {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [{ function: { name: 'x', arguments: {} } }],
      },
      done_reason: 'stop',
    },
    { now },
  );
  assert.match(noId.choices[0].message.tool_calls[0].id, /^call_/);
  assert.deepEqual(validateAiCompletion(noId), []);
  const cut = fromOllamaResponse({ message: { content: 'abc' }, done_reason: 'length' }, { now });
  assert.equal(cut.choices[0].finish_reason, 'length');
});

test('images: detected, and replaced by a note for a model without vision', () => {
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Look' },
        { type: 'image_url', image_url: IMAGE },
      ],
    },
  ];
  assert.equal(hasImages(messages), true);
  const text = withoutImages(messages);
  assert.equal(hasImages(text), false);
  assert.equal(text[0].content, `Look\n${IMAGE_OMITTED}`);
  assert.equal(hasImages([{ role: 'user', content: 'plain' }]), false);
});
