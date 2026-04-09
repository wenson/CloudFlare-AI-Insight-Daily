// src/handlers/getContentHtml.js
import { getISODate, escapeHtml, setFetchDate } from '../helpers.js';
import { listSourceItemsByPublishedWindow } from '../d1.js';
import { getPublishedWindowBounds, mapSourceItemRowToUnifiedItem, groupSourceItemsByType } from '../sourceItems.js';
import { generateContentSelectionPageHtml } from '../ui/contentSelectionPage.js';

export async function handleGetContentHtml(request, env, dataCategories) {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const dateStr = dateParam ? dateParam : getISODate();
    setFetchDate(dateStr);
    console.log(`Getting HTML content for date: ${dateStr}`);

    try {
        if (!env?.DB || typeof env.DB.prepare !== 'function') {
            throw new Error("D1 database binding 'DB' is required for /getContentHtml.");
        }

        const bounds = getPublishedWindowBounds(dateStr, env?.FOLO_FILTER_DAYS);
        const rows = await listSourceItemsByPublishedWindow(env.DB, bounds);
        const grouped = groupSourceItemsByType(rows.map(mapSourceItemRowToUnifiedItem));

        const allData = {};
        for (const category of dataCategories || []) {
            allData[category.id] = grouped[category.id] || [];
        }
        
        const html = generateContentSelectionPageHtml(env, dateStr, allData, dataCategories);

        return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    } catch (error) {
        console.error("Error in /getContentHtml:", error);
        // Ensure escapeHtml is used for error messages displayed in HTML
        return new Response(`<h1>Error generating HTML content</h1><p>${escapeHtml(error.message)}</p><pre>${escapeHtml(error.stack)}</pre>`, {
            status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
    }
}
