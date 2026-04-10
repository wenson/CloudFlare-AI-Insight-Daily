// src/handlers/getContent.js
import { getISODate } from '../helpers.js';
import { listSourceItemsByPublishedWindow } from '../d1.js';
import { getPublishedDayBounds, mapSourceItemRowToUnifiedItem, groupSourceItemsByType } from '../sourceItems.js';

export async function handleGetContent(request, env) {
    const url = new URL(request.url);
    const dateParam = url.searchParams.get('date');
    const dateStr = dateParam ? dateParam : getISODate();
    console.log(`Getting content for date: ${dateStr}`);
    try {
        const responseData = {
            date: dateStr,
            message: `Successfully retrieved data for ${dateStr}.`
        };

        if (!env?.DB || typeof env.DB.prepare !== 'function') {
            throw new Error("D1 database binding 'DB' is required for /getContent.");
        }

        const bounds = getPublishedDayBounds(dateStr);
        const rows = await listSourceItemsByPublishedWindow(env.DB, bounds);
        const grouped = groupSourceItemsByType(rows.map(mapSourceItemRowToUnifiedItem));
        Object.assign(responseData, grouped);

        return new Response(JSON.stringify(responseData), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error("Error in /getContent:", error);
        return new Response(JSON.stringify({ success: false, message: "Failed to get content.", error: error.message, date: dateStr }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
}
