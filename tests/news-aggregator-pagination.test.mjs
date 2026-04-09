import test from 'node:test';
import assert from 'node:assert/strict';
import NewsAggregatorDataSource from '../src/dataSources/newsAggregator.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function makeEntry(id, publishedAt) {
  return {
    entries: {
      id: `news-${id}`,
      url: `https://example.com/news/${id}`,
      title: `News ${id}`,
      content: `<p>Content ${id}</p>`,
      description: `<p>Description ${id}</p>`,
      publishedAt,
      author: `Author ${id}`,
    },
    feeds: {
      title: 'AI News',
    },
  };
}

test('news aggregator uses a fixed publishedBefore boundary and publishedAfter as the pagination cursor', async () => {
  const originalFetch = global.fetch;
  const originalRandom = Math.random;
  const previousFetchDate = getFetchDate();

  const requestBodies = [];
  const pageOne = Array.from({ length: 100 }, (_, index) => {
    const timestamp = new Date(Date.parse('2026-04-09T15:59:59.000Z') - (index * 60 * 1000)).toISOString();
    return makeEntry(index + 1, timestamp);
  });
  const pageTwo = [
    makeEntry('101', '2026-04-08T02:00:00.000Z'),
  ];

  let fetchCallCount = 0;
  global.fetch = async (_url, options) => {
    requestBodies.push(JSON.parse(options.body));

    const payload = fetchCallCount === 0
      ? { data: pageOne }
      : fetchCallCount === 1
        ? { data: pageTwo }
        : { data: [] };

    fetchCallCount += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  Math.random = () => 0;

  try {
    setFetchDate('2026-04-09');

    const rawData = await NewsAggregatorDataSource.fetch({
      FOLO_DATA_API: 'https://api.follow.is/entries',
      FOLO_FILTER_DAYS: '2',
      NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
      NEWS_AGGREGATOR_FETCH_PAGES: '5',
    }, 'valid-cookie');

    assert.equal(fetchCallCount, 2);
    assert.equal(rawData.items.length, 101);

    assert.deepEqual(requestBodies[0], {
      listId: 'configured-list-id',
      view: 1,
      withContent: false,
      limit: 100,
      publishedBefore: '2026-04-07T16:00:00.000Z',
    });

    assert.deepEqual(requestBodies[1], {
      listId: 'configured-list-id',
      view: 1,
      withContent: false,
      limit: 100,
      publishedBefore: '2026-04-07T16:00:00.000Z',
      publishedAfter: pageOne[pageOne.length - 1].entries.publishedAt,
    });
  } finally {
    global.fetch = originalFetch;
    Math.random = originalRandom;
    setFetchDate(previousFetchDate);
  }
});

test('news aggregator auto-paginates beyond the first page when the upstream still has more items', async () => {
  const originalFetch = global.fetch;
  const originalRandom = Math.random;
  const previousFetchDate = getFetchDate();

  const pageOne = Array.from({ length: 100 }, (_, index) => {
    const timestamp = new Date(Date.parse('2026-04-09T15:59:59.000Z') - (index * 60 * 1000)).toISOString();
    return makeEntry(`auto-${index + 1}`, timestamp);
  });
  const pageTwo = [
    makeEntry('auto-101', '2026-04-08T02:00:00.000Z'),
  ];

  let fetchCallCount = 0;
  global.fetch = async () => {
    const payload = fetchCallCount === 0
      ? { data: pageOne }
      : fetchCallCount === 1
        ? { data: pageTwo }
        : { data: [] };

    fetchCallCount += 1;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  Math.random = () => 0;

  try {
    setFetchDate('2026-04-09');

    const rawData = await NewsAggregatorDataSource.fetch({
      FOLO_DATA_API: 'https://api.follow.is/entries',
      FOLO_FILTER_DAYS: '2',
      NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    }, 'valid-cookie');

    assert.equal(fetchCallCount, 2);
    assert.equal(rawData.items.length, 101);
  } finally {
    global.fetch = originalFetch;
    Math.random = originalRandom;
    setFetchDate(previousFetchDate);
  }
});
