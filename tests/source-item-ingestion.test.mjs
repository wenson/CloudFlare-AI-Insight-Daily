import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enumerateDateRange,
  runSourceItemIngestion,
} from '../src/services/sourceItemIngestion.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function createDb() {
  const state = {
    batches: [],
    runs: [],
    sql: [],
  };

  return {
    state,
    prepare(sql) {
      state.sql.push(sql);
      return {
        bind(...args) {
          const statement = {
            sql,
            args,
            async run() {
              state.runs.push({ sql, args });
              return { success: true };
            },
          };

          return statement;
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
    DB: createDb(),
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'newsList',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: 'papersList',
    HGPAPERS_FETCH_PAGES: '1',
    TWITTER_LIST_ID: 'twitterList',
    TWITTER_FETCH_PAGES: '1',
    REDDIT_LIST_ID: 'redditList',
    REDDIT_FETCH_PAGES: '1',
    ...overrides,
  };
}

function createEntry(id, publishedAt, title = id) {
  return {
    entries: {
      id,
      url: `https://example.com/${id}`,
      title,
      content: `<p>${title}</p>`,
      publishedAt,
      author: `${id}-author`,
    },
    feeds: {
      title: `${id}-feed`,
    },
  };
}

test('enumerateDateRange returns inclusive YYYY-MM-DD dates', () => {
  assert.deepEqual(enumerateDateRange('2026-04-08', '2026-04-10'), [
    '2026-04-08',
    '2026-04-09',
    '2026-04-10',
  ]);
});

test('enumerateDateRange rejects invalid and reversed ranges', () => {
  assert.throws(() => enumerateDateRange('2026-04-31', '2026-05-01'), /Invalid startDate/);
  assert.throws(() => enumerateDateRange('2026-04-10', '2026-04-08'), /startDate must be before or equal to endDate/);
});

test('runSourceItemIngestion requires foloCookie when requireFoloCookie is true', async () => {
  const env = createEnv();
  const result = await runSourceItemIngestion(env, {
    date: '2026-04-10',
    mode: 'scheduled',
    foloCookie: '',
    requireFoloCookie: true,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 500);
  assert.match(result.message, /FOLO_COOKIE/);
  assert.equal(env.DB.state.batches.length, 0);
});

test('runSourceItemIngestion stores successful categories and reports failed categories when partial success is enabled', async () => {
  const originalFetch = global.fetch;
  const previousFetchDate = getFetchDate();
  const env = createEnv();
  const calls = [];

  global.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    calls.push({ headers: init.headers, body });

    if (body.listId === 'redditList') {
      return new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const entryByListId = {
      newsList: createEntry('news-1', '2026-04-10T08:00:00.000Z', 'News item'),
      papersList: createEntry('paper-1', '2026-04-10T09:00:00.000Z', 'Paper item'),
      twitterList: createEntry('tweet-1', '2026-04-10T10:00:00.000Z', 'Tweet item'),
    };

    return new Response(JSON.stringify({
      data: entryByListId[body.listId] ? [entryByListId[body.listId]] : [],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    setFetchDate('2026-04-01');
    const result = await runSourceItemIngestion(env, {
      date: '2026-04-10',
      mode: 'scheduled',
      foloCookie: 'secret-cookie',
      requireFoloCookie: true,
      allowPartialSuccess: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.date, '2026-04-10');
    assert.equal(result.mode, 'scheduled');
    assert.equal(result.counts.news, 1);
    assert.equal(result.counts.paper, 1);
    assert.equal(result.counts.socialMedia, 1);
    assert.match(result.errors.join('\n'), /reddit/i);
    assert.equal(env.DB.state.batches.length, 3);
    assert.equal(calls.every((call) => call.headers.Cookie === 'secret-cookie'), true);
    assert.equal(getFetchDate(), '2026-04-01');
  } finally {
    global.fetch = originalFetch;
    setFetchDate(previousFetchDate);
  }
});

test('enumerateDateRange rejects non-YYYY-MM-DD format', () => {
  assert.throws(() => enumerateDateRange('2026/04/08', '2026-04-10'), /Invalid startDate/);
});

test('enumerateDateRange rejects ranges longer than 31 days', () => {
  assert.throws(() => enumerateDateRange('2026-01-01', '2026-02-05'), /cannot exceed/);
});

test('runSourceItemIngestion all-category failure without partial success still reports fetched counts', async () => {
  const originalFetch = global.fetch;
  const previousFetchDate = getFetchDate();
  const env = createEnv();

  global.fetch = async (_url, init = {}) => {
    const { listId } = JSON.parse(init.body || '{}');

    if (listId === 'redditList') {
      return new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const entryByListId = {
      newsList: createEntry('news-1', '2026-04-10T08:00:00.000Z', 'News item'),
      papersList: createEntry('paper-1', '2026-04-10T09:00:00.000Z', 'Paper item'),
      twitterList: createEntry('tweet-1', '2026-04-10T10:00:00.000Z', 'Tweet item'),
    };

    return new Response(JSON.stringify({
      data: entryByListId[listId] ? [entryByListId[listId]] : [],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    setFetchDate('2026-04-01');
    const result = await runSourceItemIngestion(env, {
      date: '2026-04-10',
      mode: 'scheduled',
      foloCookie: 'secret-cookie',
      allowPartialSuccess: false,
    });

    assert.equal(result.success, false);
    assert.equal(result.status, 502);
    assert.equal(result.counts.news, 1);
    assert.equal(result.counts.paper, 1);
    assert.equal(result.counts.socialMedia, 1);
    assert.match(result.errors.join('\n'), /Unauthorized/);
    assert.equal(env.DB.state.batches.length, 0);
  } finally {
    global.fetch = originalFetch;
    setFetchDate(previousFetchDate);
  }
});
