import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LANGUAGES, TEXTS, all, t } from '../src/i18n.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../gladys-assistant-integration.json'));

/**
 * @description Every multi-language object of the manifest, with its path.
 * @param {unknown} node - A manifest node.
 * @param {string} path - Its path.
 * @returns {Array<[string, object]>} The texts.
 */
function texts(node, path = '') {
  if (Array.isArray(node)) {
    return node.flatMap((child, i) => texts(child, `${path}[${i}]`));
  }
  if (node && typeof node === 'object') {
    if (typeof node.en === 'string') {
      return [[path, node]];
    }
    return Object.entries(node).flatMap(([key, child]) => texts(child, `${path}.${key}`));
  }
  return [];
}

// German says "du", never the polite "Sie"/"Ihr".
const POLITE_GERMAN = /\b(Sie|Ihr|Ihre|Ihren|Ihrem|Ihrer|Ihnen)\b/;

test('every manifest text has the 4 languages, and German says "du"', () => {
  const found = texts(manifest);
  assert.ok(found.length > 50);
  for (const [path, text] of found) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), path);
    for (const language of LANGUAGES) {
      assert.ok(text[language]?.trim(), `${path}.${language} is missing`);
    }
    assert.doesNotMatch(text.de, POLITE_GERMAN, `${path}.de`);
  }
});

test('catalog description: 10 to 100 characters; widget label 3 to 30, description 100', () => {
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length}`);
    for (const widget of manifest.widgets) {
      const label = widget.label[language].length;
      assert.ok(label >= 3 && label <= 30, `${widget.key}.label.${language}: ${label}`);
      assert.ok(
        widget.description[language].length <= 100,
        `${widget.key}.description.${language}`,
      );
    }
  }
});

test('every runtime text exists in the four languages, with the same placeholders', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [key, entry] of Object.entries(TEXTS)) {
    for (const language of LANGUAGES) {
      assert.ok(entry[language]?.trim(), `${key}.${language} is missing`);
      assert.deepEqual(placeholders(entry[language]), placeholders(entry.en), `${key}.${language}`);
    }
    assert.doesNotMatch(entry.de, POLITE_GERMAN, `${key}.de`);
  }
  assert.equal(t('rowServer', 'it'), 'Server', 'English fallback');
});

test('widget texts stay within the bounds of the core', () => {
  const bound = (prefix, max, values = {}) => {
    for (const key of Object.keys(TEXTS).filter((name) => name.startsWith(prefix))) {
      for (const [language, text] of Object.entries(all(key, values))) {
        assert.ok(text.length <= max, `${key}.${language}: ${text}`);
      }
    }
  };
  bound('tile', 24);
  bound('button', 24);
  bound('kind_', 40);
  bound('row', 40);
  bound('value', 40);
  bound('server', 40, { version: '0.40.15' });
});

test('docs: the four languages, same structure, more than 300 characters', () => {
  const headings = (text) => text.split('\n').filter((line) => /^#{1,3} /.test(line)).length;
  const tables = (text) => text.split('\n').filter((line) => /^\|\s*-/.test(line)).length;
  const docs = Object.fromEntries(
    LANGUAGES.map((language) => {
      const path = new URL(`../docs/${language}.md`, import.meta.url);
      assert.ok(existsSync(path), `docs/${language}.md is missing`);
      return [language, readFileSync(path, 'utf8')];
    }),
  );
  for (const language of LANGUAGES) {
    assert.ok(docs[language].length > 300, `docs/${language}.md is too short`);
    assert.equal(headings(docs[language]), headings(docs.en), `docs/${language}.md headings`);
    assert.equal(tables(docs[language]), tables(docs.en), `docs/${language}.md tables`);
    for (const [, url] of docs[language].matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      assert.match(url, /^https:\/\/raw\.githubusercontent\.com\//, `docs/${language}.md: ${url}`);
    }
  }
  assert.doesNotMatch(docs.de, POLITE_GERMAN, 'docs/de.md says "du"');
});
