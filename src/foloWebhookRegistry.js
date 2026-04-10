const VALID_SOURCE_TYPES = new Set(['news', 'paper', 'socialMedia']);

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Invalid entry provided');
  }

  const sourceKey = normalizeOptionalString(entry.sourceKey);
  if (!sourceKey) {
    throw new Error('Entry must include a valid sourceKey');
  }

  const sourceType = normalizeOptionalString(entry.sourceType);
  if (!VALID_SOURCE_TYPES.has(sourceType)) {
    throw new Error('Invalid sourceType');
  }

  const feedId = normalizeOptionalString(entry.feedId);
  const feedUrl = normalizeOptionalString(entry.feedUrl);
  const siteUrl = normalizeOptionalString(entry.siteUrl);

  if (!feedId && !feedUrl && !siteUrl) {
    throw new Error('Entry must include feedId, feedUrl, or siteUrl');
  }

  return {
    sourceKey,
    sourceType,
    feedId,
    feedUrl,
    siteUrl,
  };
}

export function getFoloWebhookFeedRegistry(env = process.env) {
  const rawMap = env?.FOLO_WEBHOOK_FEED_MAP ?? '';
  if (!rawMap) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(rawMap);
  } catch (error) {
    throw new Error('FOLO_WEBHOOK_FEED_MAP must be valid JSON');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('FOLO_WEBHOOK_FEED_MAP must be an array');
  }

  return parsed.map(normalizeEntry);
}

export function extractWebhookFeedIdentity(payload = {}) {
  const entry = payload.entry ?? {};
  const feed = payload.feed ?? {};

  const entryFeedId = normalizeOptionalString(entry.feedId);
  const feedIdFromFeed = normalizeOptionalString(feed.id);
  const feedUrl = normalizeOptionalString(feed.url);
  const siteUrl = normalizeOptionalString(feed.siteUrl);

  const finalFeedId = entryFeedId || feedIdFromFeed;

  let matchKey = '';
  let matchValue = '';

  if (entryFeedId) {
    matchKey = 'feedId';
    matchValue = entryFeedId;
  } else if (feedIdFromFeed) {
    matchKey = 'feedId';
    matchValue = feedIdFromFeed;
  } else if (feedUrl) {
    matchKey = 'feedUrl';
    matchValue = feedUrl;
  } else if (siteUrl) {
    matchKey = 'siteUrl';
    matchValue = siteUrl;
  }

  return {
    matchKey,
    matchValue,
    feedId: finalFeedId,
    feedUrl,
    siteUrl,
  };
}

export function matchFoloWebhookFeed(registry, identity = {}) {
  const feedId = normalizeOptionalString(identity.feedId);
  const feedUrl = normalizeOptionalString(identity.feedUrl);
  const siteUrl = normalizeOptionalString(identity.siteUrl);

  if (feedId) {
    const match = registry.find((record) => record.feedId && record.feedId === feedId);
    if (match) {
      return match;
    }
  }

  if (feedUrl) {
    const match = registry.find((record) => record.feedUrl && record.feedUrl === feedUrl);
    if (match) {
      return match;
    }
  }

  if (siteUrl) {
    const match = registry.find((record) => record.siteUrl && record.siteUrl === siteUrl);
    if (match) {
      return match;
    }
  }

  return undefined;
}
