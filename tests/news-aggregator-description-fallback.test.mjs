import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';

test('handleWriteData falls back to upstream description when news content is missing', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'description-only-item',
          url: 'https://example.com/news/description-only',
          title: 'Description only item',
          description: '<p>Summary from upstream description.</p>',
          publishedAt: '2026-04-08T08:00:00.000Z',
          author: 'AI Base',
        },
        feeds: {
          title: 'AI新闻资讯',
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
    assert.equal(putCalls[0].value[0].description, 'Summary from upstream description.');
    assert.equal(putCalls[0].value[0].details.content_html, '<p>Summary from upstream description.</p>');
  } finally {
    global.fetch = originalFetch;
  }
});
