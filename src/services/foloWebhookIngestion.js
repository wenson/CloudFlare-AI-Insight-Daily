import { fetchDataByCategory } from '../dataFetchers.js';
import { upsertSourceItems } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';
import {
  extractWebhookFeedIdentity,
  getFoloWebhookFeedRegistry,
  matchFoloWebhookFeed,
} from '../foloWebhookRegistry.js';

let fetchCategoryData = fetchDataByCategory;
let upsertItems = upsertSourceItems;

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function hasAnyFeedIdentity(identity) {
  return Boolean(
    normalizeOptionalString(identity?.feedId) ||
      normalizeOptionalString(identity?.feedUrl) ||
      normalizeOptionalString(identity?.siteUrl),
  );
}

export function matchesTargetFeed(item, identity = {}) {
  const meta = item?.source_meta ?? {};
  const feedMeta = meta?.extra?.folo_feed ?? {};
  const targetFeedId = normalizeOptionalString(identity.feedId);
  const targetFeedUrl = normalizeOptionalString(identity.feedUrl);
  const targetSiteUrl = normalizeOptionalString(identity.siteUrl);

  const itemFeedId = normalizeOptionalString(meta.feed_id) || normalizeOptionalString(feedMeta.feed_id);
  const itemFeedUrl = normalizeOptionalString(meta.feed_url) || normalizeOptionalString(feedMeta.feed_url);
  const itemSiteUrl = normalizeOptionalString(meta.site_url) || normalizeOptionalString(feedMeta.site_url);

  if (targetFeedId && itemFeedId && itemFeedId === targetFeedId) {
    return true;
  }

  if (targetFeedUrl && itemFeedUrl && itemFeedUrl === targetFeedUrl) {
    return true;
  }

  if (targetSiteUrl && itemSiteUrl && itemSiteUrl === targetSiteUrl) {
    return true;
  }

  return false;
}

export function __setFoloWebhookDependencies(overrides = {}) {
  if (typeof overrides.fetchCategoryData === 'function') {
    fetchCategoryData = overrides.fetchCategoryData;
  } else if (typeof overrides.fetchDataByCategory === 'function') {
    fetchCategoryData = overrides.fetchDataByCategory;
  }
  if (typeof overrides.upsertItems === 'function') {
    upsertItems = overrides.upsertItems;
  } else if (typeof overrides.upsertSourceItems === 'function') {
    upsertItems = overrides.upsertSourceItems;
  }
}

export function __resetFoloWebhookDependencies() {
  fetchCategoryData = fetchDataByCategory;
  upsertItems = upsertSourceItems;
}

export async function runFoloWebhookIngestion(env, payload = {}) {
  let accepted = false;
  let matched = false;
  let category = '';
  let sourceKey = '';

  try {
    const identity = extractWebhookFeedIdentity(payload);
    if (!identity || !hasAnyFeedIdentity(identity)) {
      return {
        status: 400,
        success: false,
        accepted: false,
        matched: false,
        message: 'Webhook payload must include at least one feed identity field: feedId, feedUrl, or siteUrl.',
        errors: ['Missing required feed identity fields.'],
      };
    }

    accepted = true;
    const registry = getFoloWebhookFeedRegistry(env);
    const match = matchFoloWebhookFeed(registry, identity);

    if (!match) {
      return {
        status: 202,
        success: true,
        accepted: true,
        matched: false,
        matchKey: identity.matchKey,
        matchValue: identity.matchValue,
        message: 'Webhook accepted but no configured feed matched this event.',
        errors: [],
      };
    }

    matched = true;
    category = match.sourceType;
    sourceKey = match.sourceKey;

    const fetchResult = await fetchCategoryData(env, match.sourceType, env?.FOLO_COOKIE);
    const fetchErrors = Array.isArray(fetchResult?.errors) ? fetchResult.errors : [];
    if (fetchErrors.length > 0) {
      return {
        status: 502,
        success: false,
        accepted: true,
        matched: true,
        category: match.sourceType,
        sourceKey: match.sourceKey,
        message: 'Webhook matched a configured feed, but upstream category ingestion failed.',
        errors: fetchErrors,
      };
    }

    const items = Array.isArray(fetchResult?.data) ? fetchResult.data : [];
    const matchedItems = items.filter((item) => matchesTargetFeed(item, identity));

    if (matchedItems.length === 0) {
      return {
        status: 202,
        success: true,
        accepted: true,
        matched: true,
        category: match.sourceType,
        sourceKey: match.sourceKey,
        upsertedCount: 0,
        message: 'Webhook accepted but no source items matched the target feed.',
        errors: [],
      };
    }

    const fetchDate = new Date().toISOString().slice(0, 10);
    const records = matchedItems.map((item) => buildSourceItemRecord(item, fetchDate));
    await upsertItems(env.DB, records);

    return {
      status: 200,
      success: true,
      accepted: true,
      matched: true,
      category: match.sourceType,
      sourceKey: match.sourceKey,
      upsertedCount: records.length,
      message: 'Webhook source items fetched and stored.',
      errors: [],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const details = errorMessage || 'Unknown ingestion error.';
    return {
      status: 500,
      success: false,
      accepted,
      matched,
      category: matched ? category : undefined,
      sourceKey: matched ? sourceKey : undefined,
      message: 'Webhook ingestion failed unexpectedly.',
      errors: [details],
    };
  }
}
