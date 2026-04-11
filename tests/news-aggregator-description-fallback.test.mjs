import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function createDb() {
  const state = {
    batches: [],
  };

  return {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,
            args,
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
  const db = createDb();
  const env = {
    DATA_KV: {
      async put(key, value, options) {
        putCalls.push({ key, value: JSON.parse(value), options });
      },
    },
    DB: db,
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
    assert.equal(db.state.batches.length, 1);
    assert.equal(db.state.batches[0].length, 1);
    assert.match(db.state.batches[0][0].sql, /INSERT INTO source_items/);
    assert.equal(db.state.batches[0][0].args[9], 'Summary from upstream description.');
    assert.equal(db.state.batches[0][0].args[10], '<p>Summary from upstream description.</p>');
  } finally {
    global.fetch = originalFetch;
  }
});

test('handleWriteData normalizes dirty upstream descriptions before storing source items', async () => {
  const originalFetch = global.fetch;
  const dirtyContent = '<![CDATA[ 鹭羽 2026-04-11 10:07:08 来源：量子位 10万小时数据集，00后创业灵初智能一战成名 鹭羽 发自 凹非寺 量子位 | 公众号 QbitAI 还得是这届00后，强得可怕！一出手，具身智能就被“整顿”得底朝天。 当别人还在Sim2Real打转… ]]>';

  global.fetch = async () => new Response(JSON.stringify({
    data: [
      {
        entries: {
          id: 'dirty-description-item',
          url: 'https://example.com/news/dirty-description',
          title: '10万小时数据集，00后创业灵初智能一战成名',
          content: dirtyContent,
          publishedAt: '2026-04-11T08:00:00.000Z',
          author: '量子位',
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

  const db = createDb();
  const env = {
    DATA_KV: {
      async put() {},
    },
    DB: db,
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'news', foloCookie: 'valid-cookie', date: '2026-04-11' }),
  });

  try {
    const response = await handleWriteData(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.newsItemCount, 1);
    assert.equal(db.state.batches.length, 1);
    assert.equal(
      db.state.batches[0][0].args[9],
      '10万小时数据集，00后创业灵初智能一战成名 还得是这届00后，强得可怕！一出手，具身智能就被“整顿”得底朝天。 当别人还在Sim2Real打转…',
    );
    assert.equal(db.state.batches[0][0].args[10], dirtyContent);
  } finally {
    global.fetch = originalFetch;
  }
});
