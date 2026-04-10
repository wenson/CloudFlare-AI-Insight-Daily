import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __resetFoloWebhookDependencies,
  __setFoloWebhookDependencies,
  runFoloWebhookIngestion,
} from '../src/services/foloWebhookIngestion.js';

function createDb() {
  const state = { batches: [] };
  return {
    state,
    prepare(sql) {
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
    DB: createDb(),
    FOLO_COOKIE: 'secret-cookie',
    FOLO_WEBHOOK_FEED_MAP: JSON.stringify([
      {
        sourceKey: 'news-openai-blog',
        sourceType: 'news',
        feedId: 'feed-openai',
        feedUrl: 'https://openai.com/blog/rss.xml',
        siteUrl: 'https://openai.com/blog',
      },
    ]),
    ...overrides,
  };
}

function createUnifiedItem(overrides = {}) {
  return {
    id: 'item-1',
    type: 'news',
    url: 'https://openai.com/blog/item-1',
    title: 'Item 1',
    description: 'Body',
    published_date: '2026-04-10T08:00:00.000Z',
    authors: 'OpenAI',
    source: 'OpenAI Blog',
    details: {
      content_html: '<p>Item 1</p>',
    },
    source_meta: {
      feed_id: 'feed-openai',
      feed_url: 'https://openai.com/blog/rss.xml',
      site_url: 'https://openai.com/blog',
      raw_json: { id: 'item-1' },
    },
    ...overrides,
  };
}

test('runFoloWebhookIngestion returns 202 when no configured feed matches', async () => {
  const env = createEnv();

  const result = await runFoloWebhookIngestion(env, {
    entry: { feedId: 'feed-missing' },
  });

  assert.equal(result.status, 202);
  assert.equal(result.accepted, true);
  assert.equal(result.matched, false);
  assert.equal(env.DB.state.batches.length, 0);
});

test('runFoloWebhookIngestion fetches one category and stores only matching feed items', async () => {
  const env = createEnv();
  const calls = [];

  __setFoloWebhookDependencies({
    fetchDataByCategory: async (_env, category, foloCookie) => {
      calls.push({ category, foloCookie });
      return {
        data: [
          createUnifiedItem(),
          createUnifiedItem({
            id: 'item-2',
            source_meta: {
              feed_id: 'feed-other',
              feed_url: 'https://example.com/other.xml',
              site_url: 'https://example.com/other',
              raw_json: { id: 'item-2' },
            },
          }),
        ],
        errors: [],
      };
    },
  });

  try {
    const result = await runFoloWebhookIngestion(env, {
      entry: { feedId: 'feed-openai' },
      feed: { url: 'https://openai.com/blog/rss.xml', siteUrl: 'https://openai.com/blog' },
    });

    assert.equal(result.status, 200);
    assert.equal(result.accepted, true);
    assert.equal(result.matched, true);
    assert.equal(result.category, 'news');
    assert.equal(result.sourceKey, 'news-openai-blog');
    assert.equal(result.upsertedCount, 1);
    assert.deepEqual(calls, [{ category: 'news', foloCookie: 'secret-cookie' }]);
    assert.equal(env.DB.state.batches.length, 1);
  } finally {
    __resetFoloWebhookDependencies();
  }
});

test('runFoloWebhookIngestion returns 202 when category fetch succeeds but target feed yields no rows', async () => {
  const env = createEnv();

  __setFoloWebhookDependencies({
    fetchDataByCategory: async () => ({
      data: [
        createUnifiedItem({
          source_meta: {
            feed_id: 'feed-other',
            feed_url: 'https://example.com/other.xml',
            site_url: 'https://example.com/other',
            raw_json: { id: 'other' },
          },
        }),
      ],
      errors: [],
    }),
  });

  try {
    const result = await runFoloWebhookIngestion(env, {
      entry: { feedId: 'feed-openai' },
    });

    assert.equal(result.status, 202);
    assert.equal(result.matched, true);
    assert.equal(result.upsertedCount, 0);
  } finally {
    __resetFoloWebhookDependencies();
  }
});

test('runFoloWebhookIngestion returns 502 when category fetch reports upstream errors', async () => {
  const env = createEnv();

  __setFoloWebhookDependencies({
    fetchDataByCategory: async () => ({
      data: [],
      errors: ['news: Unauthorized'],
    }),
  });

  try {
    const result = await runFoloWebhookIngestion(env, {
      entry: { feedId: 'feed-openai' },
    });

    assert.equal(result.status, 502);
    assert.equal(result.success, false);
    assert.match(result.errors.join('\n'), /Unauthorized/);
  } finally {
    __resetFoloWebhookDependencies();
  }
});
