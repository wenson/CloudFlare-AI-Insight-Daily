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

test('getFoloWebhookFeedRegistry rejects non-array JSON', () => {
  assert.throws(
    () => getFoloWebhookFeedRegistry(createEnv({ FOLO_WEBHOOK_FEED_MAP: JSON.stringify({ foo: 'bar' }) })),
    /FOLO_WEBHOOK_FEED_MAP must be an array/,
  );
});

test('getFoloWebhookFeedRegistry rejects entries missing feed identifiers with context', () => {
  assert.throws(
    () => getFoloWebhookFeedRegistry(createEnv({
      FOLO_WEBHOOK_FEED_MAP: JSON.stringify([{ sourceKey: 'bad', sourceType: 'news' }]),
    })),
    /entry 0/,
  );
});

test('getFoloWebhookFeedRegistry treats whitespace-only config as empty', () => {
  const registry = getFoloWebhookFeedRegistry({ FOLO_WEBHOOK_FEED_MAP: '   ' });
  assert.deepEqual(registry, []);
});

test('matchFoloWebhookFeed matches by siteUrl and tolerates undefined registry', () => {
  const registry = getFoloWebhookFeedRegistry(createEnv());
  const match = matchFoloWebhookFeed(registry, {
    feedId: '',
    feedUrl: '',
    siteUrl: 'https://huggingface.co/papers',
  });

  assert.equal(match.sourceKey, 'paper-hf');
  assert.equal(match.sourceType, 'paper');
  assert.equal(matchFoloWebhookFeed(undefined, { feedId: 'feed-hf' }), undefined);
});

test('extractWebhookFeedIdentity falls back to feedUrl then siteUrl when ids missing', () => {
  const fromUrl = extractWebhookFeedIdentity({
    entry: {},
    feed: {
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
    },
  });

  assert.deepEqual(fromUrl, {
    matchKey: 'feedUrl',
    matchValue: 'https://example.com/feed.xml',
    feedId: '',
    feedUrl: 'https://example.com/feed.xml',
    siteUrl: 'https://example.com',
  });

  const fromSite = extractWebhookFeedIdentity({
    entry: {},
    feed: {
      siteUrl: 'https://example.com',
    },
  });

  assert.deepEqual(fromSite, {
    matchKey: 'siteUrl',
    matchValue: 'https://example.com',
    feedId: '',
    feedUrl: '',
    siteUrl: 'https://example.com',
  });
});
