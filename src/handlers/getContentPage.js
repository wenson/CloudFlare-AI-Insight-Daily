import { getISODate } from '../helpers.js';
import {
  countSourceItemsByPublishedWindowGroupedByType,
  listSourceItemsByPublishedWindowAndType,
} from '../d1.js';
import { getPublishedDayBounds, mapSourceItemRowToUnifiedItem } from '../sourceItems.js';
import {
  buildContentCountsByType,
  buildContentSliceMeta,
  normalizeContentBatchSize,
  normalizeContentOffset,
} from '../contentSelection.js';

export async function handleGetContentPage(request, env) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const dateStr = dateParam || getISODate();
  const category = url.searchParams.get('category') || '';
  const limit = normalizeContentBatchSize(url.searchParams.get('limit'));
  const offset = normalizeContentOffset(url.searchParams.get('offset'));

  try {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      throw new Error("D1 database binding 'DB' is required for /getContentPage.");
    }

    if (!category) {
      return new Response(JSON.stringify({
        success: false,
        message: 'category is required',
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const bounds = getPublishedDayBounds(dateStr);
    const countRows = await countSourceItemsByPublishedWindowGroupedByType(env.DB, bounds);
    const countsByType = buildContentCountsByType(countRows);
    const totalItems = countsByType[category] || 0;
    const rows = totalItems > 0
      ? await listSourceItemsByPublishedWindowAndType(env.DB, {
        ...bounds,
        sourceType: category,
        limit,
        offset,
      })
      : [];
    const items = rows.map(mapSourceItemRowToUnifiedItem);
    const sliceMeta = buildContentSliceMeta(totalItems, offset, items.length, limit);

    return new Response(JSON.stringify({
      date: dateStr,
      category,
      items,
      totalItems: sliceMeta.totalItems,
      nextOffset: sliceMeta.nextOffset,
      hasMore: sliceMeta.hasMore,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in /getContentPage:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'Failed to get paged content.',
      error: error.message,
      date: dateStr,
      category,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
