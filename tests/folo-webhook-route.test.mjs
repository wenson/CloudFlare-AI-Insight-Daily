import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {
  __resetRunFoloWebhookIngestion,
  __setRunFoloWebhookIngestion,
} from '../src/handlers/foloWebhook.js';

function createEnv(overrides = {}) {
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
              async first() {
                return null;
              },
              async run() {
                return { success: true };
              },
            };
          },
        };
      },
      async batch() {
        return [];
      },
    },
    OPEN_TRANSLATE: 'true',
    USE_MODEL_PLATFORM: 'GEMINI',
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_API_URL: 'https://example.com/gemini',
    DEFAULT_GEMINI_MODEL: 'gemini-model',
    LOGIN_USERNAME: 'root',
    LOGIN_PASSWORD: 'toor',
    PODCAST_TITLE: 'podcast',
    PODCAST_BEGIN: 'begin',
    PODCAST_END: 'end',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    FOLO_COOKIE: 'secret-cookie',
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '7',
    FOLO_WEBHOOK_TOKEN: 'webhook-secret',
    FOLO_WEBHOOK_FEED_MAP: '[]',
    NEWS_AGGREGATOR_LIST_ID: '',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: '',
    HGPAPERS_FETCH_PAGES: '1',
    TWITTER_LIST_ID: '',
    TWITTER_FETCH_PAGES: '1',
    REDDIT_LIST_ID: '',
    REDDIT_FETCH_PAGES: '1',
    ...overrides,
  };
}

test('worker serves POST /webhooks/folo without login redirect when token is valid', async () => {
  __setRunFoloWebhookIngestion(async () => ({
    success: true,
    accepted: true,
    matched: false,
    status: 202,
    message: 'Webhook accepted but no configured feed matched this event.',
    errors: [],
  }));

  try {
    const response = await worker.fetch(
      new Request('https://example.com/webhooks/folo?token=webhook-secret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: { feedId: 'feed-1' } }),
      }),
      createEnv(),
    );

    assert.equal(response.status, 202);
    assert.equal(response.headers.get('Location'), null);
  } finally {
    __resetRunFoloWebhookIngestion();
  }
});

test('worker rejects webhook requests with wrong token before hitting ingestion service', async () => {
  let called = false;
  __setRunFoloWebhookIngestion(async () => {
    called = true;
    return { status: 200 };
  });

  try {
    const response = await worker.fetch(
      new Request('https://example.com/webhooks/folo?token=wrong', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry: { feedId: 'feed-1' } }),
      }),
      createEnv(),
    );

    assert.equal(response.status, 401);
    assert.equal(called, false);
  } finally {
    __resetRunFoloWebhookIngestion();
  }
});

test('worker rejects invalid webhook JSON bodies with 400', async () => {
  const response = await worker.fetch(
    new Request('https://example.com/webhooks/folo?token=webhook-secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json',
    }),
    createEnv(),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
});
