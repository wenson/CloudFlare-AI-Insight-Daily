import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

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

function createEnv(overrides = {}) {
  return {
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    DB: createDb(),
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
    FOLO_COOKIE: 'scheduled-cookie',
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '7',
    NEWS_AGGREGATOR_LIST_ID: 'newsList',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: '',
    TWITTER_LIST_ID: '',
    REDDIT_LIST_ID: '',
    ...overrides,
  };
}

test('scheduled ingestion reads FOLO_COOKIE and writes source_items without writing daily_reports', async () => {
  const originalFetch = global.fetch;
  const env = createEnv();
  const waitUntilPromises = [];
  const fetchCalls = [];

  global.fetch = async (_url, init = {}) => {
    fetchCalls.push(init);
    return new Response(JSON.stringify({
      data: [{
        entries: {
          id: 'news-1',
          url: 'https://example.com/news-1',
          title: 'Scheduled item',
          content: '<p>Scheduled body</p>',
          publishedAt: '2026-04-10T08:00:00.000Z',
          author: 'scheduled-author',
        },
        feeds: {
          title: 'Scheduled Feed',
        },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await worker.scheduled({
      scheduledTime: Date.parse('2026-04-10T00:10:00.000Z'),
      cron: '10 0 * * *',
    }, env, {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    await Promise.all(waitUntilPromises);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].headers.Cookie, 'scheduled-cookie');
    assert.equal(env.DB.state.batches.length, 1);
    assert.match(env.DB.state.batches[0][0].sql, /INSERT INTO source_items/);
    assert.doesNotMatch(env.DB.state.sql.join('\n'), /daily_reports/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('scheduled ingestion reports missing FOLO_COOKIE without fetching upstream', async () => {
  const originalFetch = global.fetch;
  const env = createEnv({ FOLO_COOKIE: '' });
  let fetchCalls = 0;
  const waitUntilPromises = [];

  global.fetch = async () => {
    fetchCalls += 1;
    return new Response('{}');
  };

  try {
    await worker.scheduled({
      scheduledTime: Date.parse('2026-04-10T00:10:00.000Z'),
      cron: '10 0 * * *',
    }, env, {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    await Promise.all(waitUntilPromises);

    assert.equal(fetchCalls, 0);
    assert.equal(env.DB.state.batches.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
