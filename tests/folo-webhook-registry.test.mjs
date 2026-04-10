import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWebhookFeedIdentity,
  getFoloWebhookFeedRegistry,
  matchFoloWebhookFeed,
} from '../src/foloWebhookRegistry.js';

function createEnv(overrides = {}) {
  return {
    FOLO_WEBHOOK_FEED_MAP: JSON.stringify([
      {
        sourceKey: 'news-openai-blog',
        sourceType: 'news',
        feedId: 'feed-openai',
        feedUrl: 'https://openai.com/blog/rss.xml',
        siteUrl: 'https://openai.com/blog',
      },
      {
        sourceKey: 'paper-hf',
        sourceType: 'paper',
        feedId: 'feed-hf',
        feedUrl: 'https://huggingface.co/papers/rss',
        siteUrl: 'https://huggingface.co/papers',
      },
    ]),
    ...overrides,
  };
}

test('getFoloWebhookFeedRegistry parses JSON config into normalized records', () => {
  const registry = getFoloWebhookFeedRegistry(createEnv());

  assert.equal(registry.length, 2);
  assert.deepEqual(registry[0], {
    sourceKey: 'news-openai-blog',
    sourceType: 'news',
    feedId: 'feed-openai',
    feedUrl: 'https://openai.com/blog/rss.xml',
    siteUrl: 'https://openai.com/blog',
  });
});

test('getFoloWebhookFeedRegistry trims and normalizes string fields', () => {
  const registry = getFoloWebhookFeedRegistry({
    FOLO_WEBHOOK_FEED_MAP: JSON.stringify([
      {
        sourceKey: '  spaced-source  ',
        sourceType: ' news ',
        feedId: ' feed-1 ',
        feedUrl: ' https://example.com/feed.xml ',
        siteUrl: ' https://example.com ',
      },
    ]),
  });

  assert.equal(registry.length, 1);
  assert.deepEqual(registry[0], {
    sourceKey: 'spaced-source',
    sourceType: 'news',
    feedId: 'feed-1',
    feedUrl: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
  });
});

test('extractWebhookFeedIdentity prefers entry.feedId then feed.id then urls', () => {
  const preferred = extractWebhookFeedIdentity({
    entry: { feedId: 'entry-feed' },
    feed: {
      id: 'feed-id',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
    },
  });

  assert.deepEqual(preferred, {
    matchKey: 'feedId',
    matchValue: 'entry-feed',
    feedId: 'entry-feed',
    feedUrl: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
  });
});

test('extractWebhookFeedIdentity prefers feed.id when entry.feedId is missing', () => {
  const preferred = extractWebhookFeedIdentity({
    entry: {},
    feed: {
      id: 'feed-id',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
    },
  });

  assert.deepEqual(preferred, {
    matchKey: 'feedId',
    matchValue: 'feed-id',
    feedId: 'feed-id',
    feedUrl: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
  });
});

test('matchFoloWebhookFeed matches by feedId before falling back to URL', () => {
  const registry = getFoloWebhookFeedRegistry(createEnv());

  const byId = matchFoloWebhookFeed(registry, {
    feedId: 'feed-hf',
    feedUrl: 'https://wrong.example.com/rss.xml',
    siteUrl: 'https://wrong.example.com',
  });
  assert.equal(byId.sourceKey, 'paper-hf');
  assert.equal(byId.sourceType, 'paper');

  const byUrl = matchFoloWebhookFeed(registry, {
    feedId: '',
    feedUrl: 'https://openai.com/blog/rss.xml',
    siteUrl: '',
  });
  assert.equal(byUrl.sourceKey, 'news-openai-blog');
});

test('getFoloWebhookFeedRegistry rejects invalid JSON and unknown sourceType', () => {
  assert.throws(
    () => getFoloWebhookFeedRegistry(createEnv({ FOLO_WEBHOOK_FEED_MAP: '{bad-json' })),
    /FOLO_WEBHOOK_FEED_MAP must be valid JSON/,
  );

  assert.throws(
    () => getFoloWebhookFeedRegistry(createEnv({
      FOLO_WEBHOOK_FEED_MAP: JSON.stringify([{ sourceKey: 'bad', sourceType: 'video', feedId: 'feed-1' }]),
    })),
    /Invalid sourceType/,
  );
});
