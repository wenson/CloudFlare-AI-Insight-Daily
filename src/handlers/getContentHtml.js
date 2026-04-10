// src/handlers/getContentHtml.js
import { getISODate, escapeHtml, setFetchDate } from '../helpers.js';
import {
  countSourceItemsByPublishedWindowGroupedByType,
  listSourceItemsByPublishedWindowAndType,
  listSourceItemArchiveDays,
} from '../d1.js';
import { getPublishedDayBounds, mapSourceItemRowToUnifiedItem } from '../sourceItems.js';
import { generateContentSelectionPageHtml } from '../ui/contentSelectionPage.js';
import {
  buildContentCountsByType,
  buildContentSliceMeta,
  normalizeActiveCategory,
  normalizeContentBatchSize,
} from '../contentSelection.js';

export async function handleGetContentHtml(request, env, dataCategories) {
  const url = new URL(request.url);
  const dateParam = url.searchParams.get('date');
  const dateStr = dateParam ? dateParam : getISODate();
  const activeCategory = normalizeActiveCategory(url.searchParams.get('category'), dataCategories);
  const pageSize = normalizeContentBatchSize(url.searchParams.get('pageSize'));
  setFetchDate(dateStr);
  console.log(`Getting HTML content for date: ${dateStr}`);

  try {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      throw new Error("D1 database binding 'DB' is required for /getContentHtml.");
    }

    const bounds = getPublishedDayBounds(dateStr);
    const countRows = await countSourceItemsByPublishedWindowGroupedByType(env.DB, bounds);
    const countsByType = buildContentCountsByType(countRows);
    const archiveDays = await listSourceItemArchiveDays(env.DB);
    const categoryState = {};
    let totalItems = 0;

    for (const category of dataCategories || []) {
      const categoryTotal = countsByType[category.id] || 0;
      totalItems += categoryTotal;
      categoryState[category.id] = buildContentSliceMeta(categoryTotal, 0, 0, pageSize);
      categoryState[category.id].loaded = false;
    }

    const initialRows = activeCategory && (countsByType[activeCategory] || 0) > 0
      ? await listSourceItemsByPublishedWindowAndType(env.DB, {
        ...bounds,
        sourceType: activeCategory,
        limit: pageSize,
        offset: 0,
      })
      : [];
    const initialItems = initialRows.map(mapSourceItemRowToUnifiedItem);

    if (activeCategory) {
      categoryState[activeCategory] = {
        ...buildContentSliceMeta(countsByType[activeCategory] || 0, 0, initialItems.length, pageSize),
        loaded: true,
      };
    }

    const allData = {};
    for (const category of dataCategories || []) {
      allData[category.id] = category.id === activeCategory ? initialItems : [];
    }

    const html = generateContentSelectionPageHtml(env, dateStr, allData, dataCategories, {
      activeCategory,
      pageSize,
      totalItems,
      categoryState,
      archiveDays,
      todayDate: getISODate(),
    });

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error) {
    console.error('Error in /getContentHtml:', error);
    return new Response(`<h1>Error generating HTML content</h1><p>${escapeHtml(error.message)}</p><pre>${escapeHtml(error.stack)}</pre>`, {
      status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}
