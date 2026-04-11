import { escapeHtml } from '../utils/html.js';
import { listSourceItemArchiveDays } from '../d1.js';
import { generateContentArchivePageHtml } from '../ui/contentArchivePage.js';

export async function handleGetContentArchive(_request, env) {
  try {
    if (!env?.DB || typeof env.DB.prepare !== 'function') {
      throw new Error("D1 database binding 'DB' is required for /contentArchive.");
    }

    const rows = await listSourceItemArchiveDays(env.DB);
    const html = generateContentArchivePageHtml(rows);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error) {
    console.error('Error in /contentArchive:', error);
    return new Response(`<h1>Error generating content archive</h1><p>${escapeHtml(error.message)}</p><pre>${escapeHtml(error.stack)}</pre>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}
