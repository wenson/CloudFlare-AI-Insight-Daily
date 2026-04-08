import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function createEnv() {
  return {
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async all() {
                return { results: [] };
              },
            };
          },
        };
      },
    },
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_API_URL: 'https://example.com/gemini',
    DEFAULT_GEMINI_MODEL: 'gemini-model',
    OPEN_TRANSLATE: 'true',
    USE_MODEL_PLATFORM: 'GEMINI',
    LOGIN_USERNAME: 'root',
    LOGIN_PASSWORD: 'toor',
    PODCAST_TITLE: 'podcast',
    PODCAST_BEGIN: 'begin',
    PODCAST_END: 'end',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    FOLO_DATA_API: 'https://example.com/folo',
    FOLO_FILTER_DAYS: '1',
  };
}

test('worker serves getContent without requiring GitHub env vars', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/getContent'),
    createEnv(),
  );

  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.date, '2026-04-08');
  assert.deepEqual(body.news, []);
  assert.deepEqual(body.paper, []);
  assert.deepEqual(body.socialMedia, []);
});
