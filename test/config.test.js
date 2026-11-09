import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  defaultBaseUrl,
  modelFor,
  normalizeBaseUrl,
  normalizeConfig,
  safeUrl,
} from '../src/config.js';

test('the default address is Ollama on the host of Gladys', () => {
  assert.equal(defaultBaseUrl('http://172.30.0.1:1443'), 'http://172.30.0.1:11434/v1');
  assert.equal(defaultBaseUrl('http://172.31.5.1:1443'), 'http://172.31.5.1:11434/v1');
  assert.equal(defaultBaseUrl(undefined), 'http://172.30.0.1:11434/v1');
  assert.equal(
    normalizeConfig({}, 'http://host.docker.internal:1443').base_url_resolved,
    'http://host.docker.internal:11434/v1',
  );
});

test('typed addresses: scheme and /v1 added, trailing slash removed, junk refused', () => {
  const host = 'http://172.30.0.1:1443';
  assert.equal(normalizeBaseUrl('192.0.2.5:1234', host), 'http://192.0.2.5:1234/v1');
  assert.equal(normalizeBaseUrl('http://192.0.2.5:8080/', host), 'http://192.0.2.5:8080/v1');
  assert.equal(normalizeBaseUrl('https://ai.example.org/v1/', host), 'https://ai.example.org/v1');
  assert.equal(normalizeBaseUrl('http://192.0.2.5/proxy/v1', host), 'http://192.0.2.5/proxy/v1');
  assert.equal(normalizeBaseUrl('ftp://192.0.2.5', host), null);
  assert.equal(normalizeBaseUrl('http://', host), null);
  assert.equal(normalizeBaseUrl('http://user:pass@192.0.2.5:8080/v1', host), null);
  assert.equal(normalizeBaseUrl('  ', host), 'http://172.30.0.1:11434/v1');
});

test('numbers are clamped, unknown values fall back to the defaults', () => {
  const config = normalizeConfig({
    context_window: '999999',
    timeout_seconds: '5',
    keep_alive: 'forever',
    thinking: 'true',
    model: ' qwen3:8b ',
  });
  assert.equal(config.context_window, 262144);
  assert.equal(config.timeout_seconds, 20);
  assert.equal(config.keep_alive, DEFAULT_CONFIG.keep_alive);
  assert.equal(config.thinking, true);
  assert.equal(config.model, 'qwen3:8b');
  const defaults = normalizeConfig(null);
  assert.equal(defaults.context_window, 16384);
  assert.equal(defaults.timeout_seconds, 110);
  assert.equal(defaults.thinking, false);
});

test('the router falls back to the chat model', () => {
  assert.equal(modelFor({ model: 'a', fast_model: '' }, 'router'), 'a');
  assert.equal(modelFor({ model: 'a', fast_model: 'b' }, 'router'), 'b');
  assert.equal(modelFor({ model: 'a', fast_model: 'b' }, 'chat'), 'a');
});

test('addresses are logged without credentials', () => {
  assert.equal(safeUrl('http://user:pass@192.0.2.5:8080/v1'), 'http://192.0.2.5:8080/v1');
  assert.equal(safeUrl(null), '(invalid address)');
});
