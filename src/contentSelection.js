export const DEFAULT_CONTENT_BATCH_SIZE = 20;
export const ALLOWED_CONTENT_BATCH_SIZES = [20, 50, 100];

export function normalizeActiveCategory(requestedCategory, dataCategories) {
  const categoryIds = Array.isArray(dataCategories)
    ? dataCategories.map((category) => category.id)
    : [];

  if (requestedCategory && categoryIds.includes(requestedCategory)) {
    return requestedCategory;
  }

  return categoryIds[0] || requestedCategory || '';
}

export function normalizeContentBatchSize(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return ALLOWED_CONTENT_BATCH_SIZES.includes(parsed)
    ? parsed
    : DEFAULT_CONTENT_BATCH_SIZE;
}

export function normalizeContentOffset(value) {
  const parsed = Number.parseInt(String(value || '0'), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildContentCountsByType(countRows) {
  return (countRows || []).reduce((accumulator, row) => {
    accumulator[row.source_type] = Number(row.total_count) || 0;
    return accumulator;
  }, {});
}

export function buildContentSliceMeta(totalItems, offset, loadedCount, limit) {
  const safeTotal = Math.max(0, Number(totalItems) || 0);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLoadedCount = Math.max(0, Number(loadedCount) || 0);
  const safeLimit = Math.max(1, Number(limit) || DEFAULT_CONTENT_BATCH_SIZE);
  const nextOffset = safeOffset + safeLoadedCount < safeTotal
    ? safeOffset + safeLimit
    : null;

  return {
    totalItems: safeTotal,
    offset: safeOffset,
    loadedCount: safeLoadedCount,
    nextOffset,
    hasMore: nextOffset != null,
  };
}
