import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';

async function runUnknownCategoryRequest(category) {
  const putCalls = [];
  const env = {
    DATA_KV: {
      async put(key, value, options) {
        putCalls.push({ key, value, options });
      },
    },
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, foloCookie: 'cookie' }),
  });

  const response = await handleWriteData(request, env);
  const body = await response.json();
  return { response, body, putCalls };
}

test('handleWriteData rejects unknown category and does not write KV', async () => {
  const { response, body, putCalls } = await runUnknownCategoryRequest('project');

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /Unknown category/i);
  assert.equal(putCalls.length, 0);
});

test('handleWriteData rejects prototype-chain category names and does not write KV', async () => {
  const { response, body, putCalls } = await runUnknownCategoryRequest('__proto__');

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /Unknown category/i);
  assert.equal(putCalls.length, 0);
});

test('handleWriteData reports upstream unauthorized fetch failures instead of silent success', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('Unauthorized', {
    status: 401,
    statusText: 'Unauthorized',
  });

  const putCalls = [];
  const env = {
    DATA_KV: {
      async put(key, value, options) {
        putCalls.push({ key, value, options });
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
    body: JSON.stringify({ category: 'news', foloCookie: 'expired-cookie' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.success, false);
    assert.match(body.message, /Failed to fetch data for category 'news'/i);
    assert.match(body.errors[0], /Unauthorized/i);
    assert.equal(putCalls.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWriteData skips entries with invalid publishedAt instead of failing the whole category', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'bad-item',
          url: 'https://example.com/bad',
          title: 'Bad date item',
          content: '<p>bad</p>',
          publishedAt: 'invalid-date',
          author: 'bad-author',
        },
        feeds: {
          title: 'Bad Feed',
        },
      },
      {
        entries: {
          id: 'good-item',
          url: 'https://example.com/good',
          title: 'Good date item',
          content: '<p>good</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'good-author',
        },
        feeds: {
          title: 'Good Feed',
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
        putCalls.push({ key, value: JSON.parse(value), options });
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
    body: JSON.stringify({ category: 'news', foloCookie: 'valid-cookie' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.newsItemCount, 1);
    assert.equal(putCalls.length, 1);
    assert.equal(putCalls[0].value.length, 1);
    assert.equal(putCalls[0].value[0].id, 'good-item');
  } finally {
    global.fetch = originalFetch;
  }
});
