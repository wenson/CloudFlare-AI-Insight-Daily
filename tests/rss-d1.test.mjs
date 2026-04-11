import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { listDailyReports, upsertDailyReport } from '../src/d1.js';
import { handleGenAIContent } from '../src/handlers/genAIContent.js';

function createDb(options = []) {
  const config = Array.isArray(options)
    ? { allResults: options }
    : (options || {});
  const state = {
    sql: '',
    args: [],
    calls: [],
  };

  return {
    state,
    prepare(sql) {
      const call = { sql, args: [] };
      state.calls.push(call);
      state.sql = sql;
      return {
        bind(...args) {
          call.args = args;
          state.args = args;
          return {
            async run() {
              return { success: true };
            },
            async all() {
              if (/FROM source_items/i.test(sql) && /source_type = \? AND source_item_id = \?/i.test(sql)) {
                if (/published_at\s*>=\s*\?\s*AND\s*published_at\s*<=\s*\?/i.test(sql)) {
                  const startAt = args[args.length - 2];
                  const endAt = args[args.length - 1];
                  const filtered = (config.selectionResults || []).filter((row) => (
                    row.published_at >= startAt && row.published_at <= endAt
                  ));
                  return { results: filtered };
                }
                return { results: config.selectionResults || [] };
              }
              if (/FROM source_items/i.test(sql)) {
                if (/published_at\s*>=\s*\?\s*AND\s*published_at\s*<=\s*\?/i.test(sql)) {
                  const [startAt, endAt, limit] = args;
                  const filtered = (config.rssSourceItemResults || config.publishedWindowResults || config.allResults || [])
                    .filter((row) => (
                      row.published_at >= startAt
                      && row.published_at <= endAt
                      && row.published_at != null
                      && row.published_at !== ''
                    ))
                    .slice(0, limit);
                  return { results: filtered };
                }
                return { results: config.rssSourceItemResults || config.publishedWindowResults || config.allResults || [] };
              }
              if (/FROM daily_reports/i.test(sql)) {
                if (/report_date >= \? AND report_date <= \?/i.test(sql)) {
                  const [startDate, endDate, limit] = args;
                  const filtered = (config.dailyReportResults || config.allResults || [])
                    .filter((row) => (
                      row.report_date >= startDate
                      && row.report_date <= endDate
                      && row.rss_html != null
                      && row.rss_html !== ''
                    ))
                    .slice(0, limit);
                  return { results: filtered };
                }
                return { results: config.dailyReportResults || config.allResults || [] };
              }
              return { results: config.allResults || [] };
            },
            async first() {
              if (/FROM daily_reports/i.test(sql)) {
                return config.dailyReportMetadata || null;
              }
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

test('worker serves rss items directly from source_items within the recent day window', async () => {
  const env = createEnv({
    rssSourceItemResults: [
      {
        source_type: 'news',
        source_name: 'AI News',
        source_item_id: 'news-1',
        title: 'News title',
        url: 'https://example.com/news-1',
        guid: 'guid-news-1',
        description_text: 'Short summary',
        content_html: '<p>Full content</p>',
        published_at: '2026-04-10T08:00:00.000Z',
      },
      {
        source_type: 'news',
        source_name: 'AI News',
        source_item_id: 'news-old',
        title: 'Old news title',
        url: 'https://example.com/news-old',
        guid: 'guid-news-old',
        description_text: 'Old summary',
        content_html: '<p>Old content</p>',
        published_at: '2026-04-01T08:00:00.000Z',
      },
    ],
  });

  const response = await worker.fetch(
    new Request('https://example.com/rss?days=7'),
    env,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/xml/);

  const body = await response.text();
  assert.match(body, /<rss version="2.0"/);
  assert.match(body, /News title/);
  assert.match(body, /https:\/\/example.com\/news-1/);
  assert.match(body, /Full content/);
  assert.match(body, /Short summary/);
  assert.doesNotMatch(body, /Old news title/);
  const rssSourceCall = env.DB.state.calls.find((call) => (
    /FROM source_items/i.test(call.sql)
    && /published_at/i.test(call.sql)
    && call.args.length === 3
  ));
  assert.ok(rssSourceCall);
});

test('source-items rss falls back when guid, title, description, or content are missing', async () => {
  const env = createEnv({
    rssSourceItemResults: [
      {
        source_type: 'socialMedia',
        source_name: 'X Feed',
        source_item_id: 'tweet-1',
        title: '',
        url: '',
        guid: '',
        description_text: '',
        content_html: '<p>Hello RSS</p>',
        published_at: '2026-04-10T08:00:00.000Z',
      },
    ],
  });

  const response = await worker.fetch(
    new Request('https://example.com/rss?days=7'),
    env,
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /X Feed/);
  assert.match(body, /socialMedia:tweet-1/);
  assert.match(body, /Hello RSS/);
  assert.match(body, /getContentHtml\?date=2026-04-10/);
});

test('source-items rss escapes xml-sensitive characters in link and guid fields', async () => {
  const env = createEnv({
    rssSourceItemResults: [
      {
        source_type: 'news',
        source_name: 'Query Feed',
        source_item_id: 'query-1',
        title: 'Query title',
        url: 'https://example.com/article?foo=1&bar=2',
        guid: 'https://example.com/article?foo=1&bar=2',
        description_text: 'Query summary',
        content_html: '<p>Query content</p>',
        published_at: '2026-04-10T08:00:00.000Z',
      },
    ],
  });

  const response = await worker.fetch(
    new Request('https://example.com/rss?days=7'),
    env,
  );

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /<link>https:\/\/example.com\/article\?foo=1&amp;bar=2<\/link>/);
  assert.match(body, /<guid>https:\/\/example.com\/article\?foo=1&amp;bar=2<\/guid>/);
});

test('listDailyReports filters by the requested recent day window instead of returning any latest N rows', async () => {
  const db = createDb({
    dailyReportResults: [
      {
        report_date: '2026-04-11',
        title: '2026-04-11日刊',
        rss_html: '<p>day 11</p>',
        published_at: '2026-04-11T08:00:00.000Z',
      },
      {
        report_date: '2026-04-10',
        title: '2026-04-10日刊',
        rss_html: '<p>day 10</p>',
        published_at: '2026-04-10T08:00:00.000Z',
      },
      {
        report_date: '2026-04-09',
        title: '2026-04-09日刊',
        rss_html: '<p>day 09</p>',
        published_at: '2026-04-09T08:00:00.000Z',
      },
      {
        report_date: '2026-04-08',
        title: '2026-04-08日刊',
        rss_html: '<p>day 08</p>',
        published_at: '2026-04-08T08:00:00.000Z',
      },
      {
        report_date: '2026-04-07',
        title: '2026-04-07日刊',
        rss_html: '<p>day 07</p>',
        published_at: '2026-04-07T08:00:00.000Z',
      },
      {
        report_date: '2026-04-06',
        title: '2026-04-06日刊',
        rss_html: '<p>day 06</p>',
        published_at: '2026-04-06T08:00:00.000Z',
      },
      {
        report_date: '2026-04-05',
        title: '2026-04-05日刊',
        rss_html: '<p>day 05</p>',
        published_at: '2026-04-05T08:00:00.000Z',
      },
      {
        report_date: '2026-04-01',
        title: '2026-04-01日刊',
        rss_html: '<p>day 01</p>',
        published_at: '2026-04-01T08:00:00.000Z',
      },
    ],
  });

  const rows = await listDailyReports(db, 7, '2026-04-11');

  assert.deepEqual(rows.map((row) => row.report_date), [
    '2026-04-11',
    '2026-04-10',
    '2026-04-09',
    '2026-04-08',
    '2026-04-07',
    '2026-04-06',
    '2026-04-05',
  ]);
  assert.match(db.state.sql, /report_date >= \? AND report_date <= \?/);
  assert.deepEqual(db.state.args, ['2026-04-05', '2026-04-11', 7]);
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
  const env = createEnv({
    selectionResults: [{
      source_type: 'news',
      source_name: 'Source N',
      source_item_id: '1',
      title: 'Test title',
      url: 'https://example.com/news/1',
      author_name: 'Author N',
      description_text: 'News summary',
      content_html: '<p>Test content</p>',
      published_at: '2026-04-08T08:00:00.000Z',
    }],
  });
  let kvGetCalls = 0;
  env.DATA_KV.get = async (key) => {
    kvGetCalls += 1;
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
  const requestBodies = [];
  global.fetch = async (_url, init) => {
    if (init?.body) {
      requestBodies.push(JSON.parse(init.body));
    }
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
    assert.equal(kvGetCalls, 0);
    assert.match(requestBodies[0].contents[0].parts[0].text, /News Title: Test title/);
    const sourceSelectionCall = env.DB.state.calls.find((call) => /FROM source_items/i.test(call.sql) && /source_type = \? AND source_item_id = \?/i.test(call.sql));
    assert.ok(sourceSelectionCall);
    assert.deepEqual(sourceSelectionCall.args, [
      'news',
      '1',
      '2026-04-07T16:00:00.000Z',
      '2026-04-08T15:59:59.999Z',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('genAIContent resolves selected item from D1 same-day selections even when per-day KV is empty', async () => {
  const env = createEnv({
    selectionResults: [{
      source_type: 'socialMedia',
      source_name: 'Source S',
      source_item_id: 'social-window-1',
      title: 'Window social title',
      url: 'https://example.com/social-window-1',
      author_name: 'Author S',
      description_text: 'Social summary',
      content_html: '<p>window content</p>',
      published_at: '2026-04-09T07:00:00.000Z',
    }, {
      source_type: 'socialMedia',
      source_name: 'Source S',
      source_item_id: 'social-old-1',
      title: 'Old social title',
      url: 'https://example.com/social-old-1',
      author_name: 'Author Old',
      description_text: 'Old summary',
      content_html: '<p>old content</p>',
      published_at: '2026-04-08T07:00:00.000Z',
    }],
  });
  env.FOLO_FILTER_DAYS = '2';
  let kvGetCalls = 0;
  env.DATA_KV.get = async () => {
    kvGetCalls += 1;
    return JSON.stringify([]);
  };

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  const requestBodies = [];
  global.fetch = async (_url, init) => {
    if (init?.body) {
      requestBodies.push(JSON.parse(init.body));
    }
    fetchCalls += 1;
    if (fetchCalls === 1) return createSseResponse('Formatted daily body');
    if (fetchCalls === 2) return createSseResponse('Short daily summary');
    if (fetchCalls === 3) return createGeminiJsonResponse('RSS summary line');
    throw new Error(`Unexpected fetch call ${fetchCalls}`);
  };

  try {
    const formBody = new URLSearchParams();
    formBody.set('date', '2026-04-09');
    formBody.append('selectedItems', 'socialMedia:social-window-1');
    formBody.append('selectedItems', 'socialMedia:social-old-1');

    const response = await handleGenAIContent(new Request('https://example.com/genAIContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    }), env);

    assert.equal(response.status, 200);
    assert.equal(kvGetCalls, 0);
    assert.match(requestBodies[0].contents[0].parts[0].text, /https:\/\/example\.com\/social-window-1/);
    assert.doesNotMatch(requestBodies[0].contents[0].parts[0].text, /https:\/\/example\.com\/social-old-1/);
    assert.equal(env.DB.state.args[5], 1);
    const sourceSelectionCall = env.DB.state.calls.find((call) => /FROM source_items/i.test(call.sql) && /source_type = \? AND source_item_id = \?/i.test(call.sql));
    assert.ok(sourceSelectionCall);
    assert.deepEqual(sourceSelectionCall.args, [
      'socialMedia',
      'social-window-1',
      'socialMedia',
      'social-old-1',
      '2026-04-08T16:00:00.000Z',
      '2026-04-09T15:59:59.999Z',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('genAIContent deduplicates duplicate selectedItems for prompt assembly and persisted source count', async () => {
  const env = createEnv({
    selectionResults: [{
      source_type: 'news',
      source_name: 'Source N',
      source_item_id: 'dup-1',
      title: 'Duplicate title',
      url: 'https://example.com/news-dup-1',
      author_name: 'Author N',
      description_text: 'Duplicate summary',
      content_html: '<p>dup content</p>',
      published_at: '2026-04-09T08:00:00.000Z',
    }],
  });
  env.FOLO_FILTER_DAYS = '2';

  const originalFetch = global.fetch;
  let fetchCalls = 0;
  const requestBodies = [];
  global.fetch = async (_url, init) => {
    if (init?.body) {
      requestBodies.push(JSON.parse(init.body));
    }
    fetchCalls += 1;
    if (fetchCalls === 1) return createSseResponse('Formatted daily body');
    if (fetchCalls === 2) return createSseResponse('Short daily summary');
    if (fetchCalls === 3) return createGeminiJsonResponse('RSS summary line');
    throw new Error(`Unexpected fetch call ${fetchCalls}`);
  };

  try {
    const formBody = new URLSearchParams();
    formBody.set('date', '2026-04-09');
    formBody.append('selectedItems', 'news:dup-1');
    formBody.append('selectedItems', 'news:dup-1');

    const response = await handleGenAIContent(new Request('https://example.com/genAIContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody,
    }), env);
    const html = await response.text();

    assert.equal(response.status, 200);
    const firstPromptBody = requestBodies[0].contents[0].parts[0].text;
    assert.equal((firstPromptBody.match(/News Title: Duplicate title/g) || []).length, 1);
    assert.equal(env.DB.state.args[5], 1);
    assert.equal((html.match(/name="selectedItems" value="news:dup-1"/g) || []).length, 2);
    const sourceSelectionCall = env.DB.state.calls.find((call) => /FROM source_items/i.test(call.sql) && /source_type = \? AND source_item_id = \?/i.test(call.sql));
    assert.ok(sourceSelectionCall);
    assert.deepEqual(sourceSelectionCall.args, [
      'news',
      'dup-1',
      '2026-04-08T16:00:00.000Z',
      '2026-04-09T15:59:59.999Z',
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});
