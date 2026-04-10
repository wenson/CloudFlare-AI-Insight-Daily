import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleBackfillData } from '../src/handlers/backfillData.js';
import { SESSION_COOKIE_NAME } from '../src/auth.js';

function createKv(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
  };
}

function createDb() {
  const state = {
    batches: [],
    sql: [],
  };

  return {
    state,
    prepare(sql) {
      state.sql.push(sql);
      return {
        bind(...args) {
          return {
            sql,
            args,
            async run() {
              return { success: true };
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
    async batch(statements) {
      state.batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function createRequest(body, method = 'POST') {
  return new Request('https://example.com/backfillData', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createEnv(overrides = {}) {
  return {
    DATA_KV: overrides.DATA_KV ?? createKv(overrides.initialKvEntries),
    DB: overrides.DB ?? createDb(),
    OPEN_TRANSLATE: 'true',
    USE_MODEL_PLATFORM: 'GEMINI',
    GEMINI_API_KEY: 'gemini',
    GEMINI_API_URL: 'https://example.com/gemini',
    DEFAULT_GEMINI_MODEL: 'gemini-model',
    LOGIN_USERNAME: 'root',
    LOGIN_PASSWORD: 'toor',
    PODCAST_TITLE: 'podcast',
    PODCAST_BEGIN: 'begin',
    PODCAST_END: 'end',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: '',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: '',
    HGPAPERS_FETCH_PAGES: '1',
    TWITTER_LIST_ID: '',
    TWITTER_FETCH_PAGES: '1',
    REDDIT_LIST_ID: '',
    REDDIT_FETCH_PAGES: '1',
    FOLO_COOKIE: 'secret-cookie',
    ...overrides,
  };
}

test('handleBackfillData rejects non-POST methods', async () => {
  const response = await handleBackfillData(
    new Request('https://example.com/backfillData', { method: 'GET' }),
    createEnv(),
  );

  assert.equal(response.status, 405);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.message, /POST/);
});

test('handleBackfillData rejects invalid JSON bodies', async () => {
  const response = await handleBackfillData(
    new Request('https://example.com/backfillData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    }),
    createEnv(),
  );

  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
  assert.match(body.message, /JSON/i);
});

test('handleBackfillData rejects reversed or invalid date ranges', async () => {
  const env = createEnv();

  const reversedResponse = await handleBackfillData(
    createRequest({ startDate: '2026-04-10', endDate: '2026-04-08' }),
    env,
  );
  assert.equal(reversedResponse.status, 400);
  const reversedBody = await reversedResponse.json();
  assert.equal(reversedBody.success, false);

  const badFormatResponse = await handleBackfillData(
    createRequest({ startDate: 'invalid', endDate: '2026/04/10' }),
    env,
  );
  assert.equal(badFormatResponse.status, 400);
  const badFormatBody = await badFormatResponse.json();
  assert.equal(badFormatBody.success, false);
});

test('handleBackfillData returns a summary per range with per-date results', async () => {
  const env = createEnv({
    FOLO_COOKIE: 'secret-cookie',
  });

  const response = await handleBackfillData(
    createRequest({ startDate: '2026-04-08', endDate: '2026-04-08' }),
    env,
  );
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.summary.totalDays, 1);
  assert.equal(body.summary.successDays, 1);
  assert.equal(body.summary.partialFailureDays, 0);
  assert.equal(body.summary.failedDays, 0);
  assert.equal(body.results.length, 1);
  assert.equal(body.results[0].date, '2026-04-08');
  assert.equal(body.results[0].success, true);
  assert.deepEqual(body.results[0].errors, []);
});

test('worker rejects unauthenticated POST /backfillData with login redirect', async () => {
  const env = createEnv({
    DATA_KV: createKv(),
    FOLO_COOKIE: 'secret-cookie',
  });

  const response = await worker.fetch(
    new Request('https://example.com/backfillData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate: '2026-04-08', endDate: '2026-04-08' }),
    }),
    env,
  );

  assert.equal(response.status, 302);
  assert.match(response.headers.get('Location') || '', /\/login/);
});

test('authenticated worker POST /backfillData succeeds with summary', async () => {
  const dataKv = createKv({
    'session:valid-session': JSON.stringify('valid'),
  });
  const env = createEnv({
    DATA_KV: dataKv,
    FOLO_COOKIE: 'scheduled-cookie',
  });

  const response = await worker.fetch(
    new Request('https://example.com/backfillData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE_NAME}=valid-session`,
      },
      body: JSON.stringify({ startDate: '2026-04-08', endDate: '2026-04-08' }),
    }),
    env,
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.summary.totalDays, 1);
  assert.equal(body.summary.errorCount, undefined);
  assert.equal(body.summary.failedDays, 0);
  assert.equal(body.success, true);
});
