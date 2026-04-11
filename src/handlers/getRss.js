import { formatRssDate, getISODate } from '../utils/date.js';
import { getPublishedWindowBounds, mapSourceItemRowToRssItem } from '../sourceItems.js';
import { listSourceItemsForRss } from '../d1.js';

export async function handleRss(request, env) {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
    const bounds = getPublishedWindowBounds(getISODate(), safeDays);
    const rows = await listSourceItemsForRss(env.DB, {
        ...bounds,
        limit: 500,
    });
    const items = rows.map((row) => mapSourceItemRowToRssItem(row, url.origin));

    const rssItems = items.map((item) => `
        <item>
          <title><![CDATA[${item.title}]]></title>
          <link>${item.link}</link>
          <guid>${item.guid}</guid>
          <pubDate>${formatRssDate(new Date(item.publishedAt))}</pubDate>
          <content:encoded><![CDATA[${item.contentHtml}]]></content:encoded>
          <description><![CDATA[${item.description}]]></description>
        </item>
      `).join('');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>AI洞察日报 RSS Feed</title>
    <link>${url.origin}</link>
    <description>最近 ${safeDays} 天抓取内容</description>
    <language>zh-cn</language>
    <lastBuildDate>${formatRssDate(new Date())}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;

    return new Response(rssFeed, {
        headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
