import { formatRssDate } from '../utils/date.js';
import { stripHtml } from '../utils/html.js';
import { listDailyReports } from '../d1.js';

export async function handleRss(request, env) {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7', 10);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 7;
    const reports = await listDailyReports(env.DB, safeDays);

    const rssItems = reports.map((item) => `
        <item>
          <title><![CDATA[${item.title}]]></title>
          <link>${url.origin}/getContentHtml?date=${item.report_date}</link>
          <guid>${item.report_date}</guid>
          <pubDate>${formatRssDate(new Date(item.published_at))}</pubDate>
          <content:encoded><![CDATA[${item.rss_html}]]></content:encoded>
          <description><![CDATA[${stripHtml(item.rss_html).substring(0, 200)}]]></description>
        </item>
      `).join('');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>AI洞察日报 RSS Feed</title>
    <link>${url.origin}</link>
    <description>最近 ${safeDays} 天的 AI 日报摘要</description>
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
