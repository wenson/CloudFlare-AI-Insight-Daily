import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function createDb() {
  const state = {
    batches: [],
    runs: [],
  };

  return {
    state,
    prepare(sql) {
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

          return {
            ...statement,
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

test('handleWriteData stores fetched category items through a D1 batch upsert and does not write content to KV', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'news-1',
          url: 'https://example.com/news/1',
          title: 'D1 test item',
          content: '<p>d1 content</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'author-1',
        },
        feeds: {
          title: 'Feed-1',
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const putCalls = [];
  const env = {
    DATA_KV: {
      async put(key, value, options) {
        putCalls.push({ key, value, options });
      },
    },
    DB: createDb(),
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'news', foloCookie: 'valid-cookie', date: '2026-04-08' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.newsItemCount, 1);
    assert.equal(putCalls.length, 0);
    assert.equal(env.DB.state.runs.length, 0);
    assert.equal(env.DB.state.batches.length, 1);
    assert.equal(env.DB.state.batches[0].length, 1);
    assert.match(env.DB.state.batches[0][0].sql, /INSERT INTO source_items/);
    assert.equal(env.DB.state.batches[0][0].args[2], 'news-1');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWriteData returns a clear 500 when D1 DB binding is missing for known categories', async () => {
  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'news', foloCookie: 'valid-cookie' }),
  });

  const response = await handleWriteData(request, {
    DATA_KV: {
      async put() {},
    },
  });
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.match(body.message, /DB/i);
  assert.match(body.message, /required/i);
});

test('handleWriteData uses request body date instead of shared helper state', async () => {
  const originalFetch = global.fetch;
  const previousFetchDate = getFetchDate();
  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'news-dated-1',
          url: 'https://example.com/news/date/1',
          title: 'Dated item',
          content: '<p>dated content</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'author-1',
        },
        feeds: {
          title: 'Feed-1',
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const env = {
    DATA_KV: {
      async put() {},
    },
    DB: createDb(),
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'news', foloCookie: 'valid-cookie', date: '2026-04-08' }),
  });

  try {
    setFetchDate('2026-04-01');
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(env.DB.state.batches.length, 1);
    assert.equal(env.DB.state.batches[0][0].args[20], '2026-04-08');
    assert.equal(env.DB.state.batches[0][0].args[21], '2026-04-08');
  } finally {
    setFetchDate(previousFetchDate);
    global.fetch = originalFetch;
  }
});

test('handleWriteData all-category path writes one flattened D1 batch and keeps per-category counts', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (_url, init = {}) => {
    const parsedBody = JSON.parse(init.body ?? '{}');
    const { listId } = parsedBody;

    const entryByListId = {
      newsList: {
        entries: {
          id: 'news-1',
          url: 'https://example.com/news/1',
          title: 'News item',
          content: '<p>news</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'news-author',
        },
        feeds: { title: 'News Feed' },
      },
      papersList: {
        entries: {
          id: 'paper-1',
          url: 'https://example.com/paper/1',
          title: 'Paper item',
          content: '<p>paper</p>',
          publishedAt: '2026-04-08T09:00:00.000Z',
          author: 'paper-author',
        },
        feeds: { title: 'Paper Feed' },
      },
      twitterList: {
        entries: {
          id: 'tweet-1',
          url: 'https://x.com/test/status/1',
          title: 'Tweet item',
          content: '<p>tweet</p>',
          publishedAt: '2026-04-08T10:00:00.000Z',
          author: 'tweet-author',
        },
        feeds: { title: 'Twitter Timeline' },
      },
      redditList: {
        entries: {
          id: 'reddit-1',
          url: 'https://reddit.com/r/test/comments/1',
          title: 'Reddit item',
          content: '<p>reddit</p>',
          publishedAt: '2026-04-08T11:00:00.000Z',
          author: 'reddit-author',
        },
        feeds: { title: 'Reddit Feed' },
      },
    };

    return new Response(JSON.stringify({
      data: entryByListId[listId] ? [entryByListId[listId]] : [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const env = {
    DATA_KV: {
      async put() {
        throw new Error('content KV should not be used');
      },
    },
    DB: createDb(),
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
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foloCookie: 'valid-cookie', date: '2026-04-08' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.newsItemCount, 1);
    assert.equal(body.paperItemCount, 1);
    assert.equal(body.socialMediaItemCount, 2);
    assert.equal(env.DB.state.batches.length, 1);
    assert.equal(env.DB.state.batches[0].length, 4);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWriteData surfaces unexpected ingestion failures as 500', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'news-1',
          url: 'https://example.com/news/1',
          title: 'D1 test item',
          content: '<p>d1 content</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'author-1',
        },
        feeds: {
          title: 'Feed-1',
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const env = {
    DATA_KV: {
      async put() {},
    },
    DB: {
      ...createDb(),
      async batch() {
        throw new Error('db batch boom');
      },
    },
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foloCookie: 'valid-cookie', date: '2026-04-08' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.success, false);
    assert.equal(body.message, 'An unhandled error occurred during data processing.');
    assert.match(body.error, /db batch boom/);
    assert.match(body.details, /db batch boom/);
    assert.equal(body.newsItemCount, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWriteData all-category missing DB keeps original 500 shape', async () => {
  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ foloCookie: 'valid-cookie' }),
  });

  const response = await handleWriteData(request, {
    DATA_KV: {
      async put() {},
    },
  });

  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.match(body.message, /D1 database binding 'DB' with batch support is required/i);
  assert.equal(body.newsItemCount, undefined);
  assert.equal(body.paperItemCount, undefined);
  assert.equal(body.socialMediaItemCount, undefined);
});
