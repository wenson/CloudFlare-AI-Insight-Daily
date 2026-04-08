import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { upsertDailyReport } from '../src/d1.js';
import { handleGenAIContent } from '../src/handlers/genAIContent.js';

function createDb(results = []) {
  const state = {
    sql: '',
    args: [],
  };

  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...args) {
          state.args = args;
          return {
            async run() {
              return { success: true };
            },
            async all() {
              return { results };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
  };
}

function createEnv(results = []) {
  return {
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    DB: createDb(results),
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

test('worker serves rss from D1 without GitHub config', async () => {
  const env = createEnv([
    {
      report_date: '2026-04-08',
      title: '2026-04-08日刊',
      rss_html: '<p>RSS summary</p>',
      published_at: '2026-04-08T08:00:00.000Z',
    },
  ]);

  const response = await worker.fetch(
    new Request('https://example.com/rss?days=7'),
    env,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/xml/);

  const body = await response.text();
  assert.match(body, /<rss version="2.0"/);
  assert.match(body, /2026-04-08日刊/);
  assert.match(body, /RSS summary/);
});

test('upsertDailyReport prepares an upsert keyed by report_date', async () => {
  const db = createDb();
  const report = {
    report_date: '2026-04-08',
    title: '2026-04-08日刊',
    daily_markdown: 'daily',
    rss_markdown: 'rss',
    rss_html: '<p>rss</p>',
    source_item_count: 3,
    created_at: '2026-04-08T08:00:00.000Z',
    updated_at: '2026-04-08T08:00:00.000Z',
    published_at: '2026-04-08T08:00:00.000Z',
  };

  await upsertDailyReport(db, report);

  assert.match(db.state.sql, /INSERT INTO daily_reports/);
  assert.match(db.state.sql, /ON CONFLICT\(report_date\)/);
  assert.deepEqual(db.state.args, [
    report.report_date,
    report.title,
    report.daily_markdown,
    report.rss_markdown,
    report.rss_html,
    report.source_item_count,
    report.created_at,
    report.updated_at,
    report.published_at,
  ]);
});

function createSseResponse(text) {
  const body = `data: ${JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }],
  })}\n\n` + `data: ${JSON.stringify({
    candidates: [{ finishReason: 'STOP' }],
  })}\n\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function createGeminiJsonResponse(text) {
  return new Response(JSON.stringify({
    candidates: [{
      finishReason: 'STOP',
      content: {
        parts: [{ text }],
      },
    }],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

test('genAIContent stores daily and rss outputs in D1 after generation succeeds', async () => {
  const env = createEnv();
  env.DATA_KV.get = async (key) => {
    if (key === '2026-04-08-news') {
      return JSON.stringify([{
        id: '1',
        type: 'news',
        title: 'Test title',
        url: 'https://example.com/news/1',
        published_date: '2026-04-08T08:00:00.000Z',
        details: {
          content_html: '<p>Test content</p>',
        },
      }]);
    }

    return JSON.stringify([]);
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      return createSseResponse('Formatted daily body');
    }
    if (fetchCalls === 2) {
      return createSseResponse('Short daily summary');
    }
    if (fetchCalls === 3) {
      return createGeminiJsonResponse('RSS summary line');
    }
    throw new Error(`Unexpected fetch call ${fetchCalls}`);
  };

  try {
    const formBody = new URLSearchParams();
    formBody.set('date', '2026-04-08');
    formBody.append('selectedItems', 'news:1');

    const response = await handleGenAIContent(new Request('https://example.com/genAIContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formBody,
    }), env);

    assert.equal(response.status, 200);
    assert.match(env.DB.state.sql, /INSERT INTO daily_reports/);
    assert.equal(env.DB.state.args[0], '2026-04-08');
    assert.equal(env.DB.state.args[1], '2026-04-08日刊');
    assert.match(env.DB.state.args[2], /Formatted daily body/);
    assert.match(env.DB.state.args[3], /RSS summary line/);
    assert.match(env.DB.state.args[4], /<p>RSS summary line<\/p>/);
  } finally {
    global.fetch = originalFetch;
  }
});
