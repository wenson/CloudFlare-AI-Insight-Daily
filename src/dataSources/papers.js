import { getRandomUserAgent, sleep, isDateWithinLastDays, stripHtml, formatDateToChineseWithTime, escapeHtml, buildCurlCommand, getSourceItemFetchDate } from '../helpers';

function buildSourceMeta(entry) {
    const source = entry?.entries || {};
    const feed = entry?.feeds || {};
    return {
        guid: source.guid || source.url || null,
        author_name: source.author || null,
        author_url: source.authorUrl || source.author_url || null,
        author_avatar: source.authorAvatar || source.author_avatar || null,
        inserted_at: source.insertedAt || source.inserted_at || null,
        language: source.language || null,
        summary: source.summary || null,
        categories: source.categories || null,
        media: source.media || null,
        attachments: source.attachments || null,
        extra: {
            ...(source.extra || {}),
            folo_feed: {
                feed_id: feed.id || null,
                feed_url: feed.url || null,
                site_url: feed.siteUrl || null,
                feed_title: feed.title || null,
            },
        },
        feed_id: feed.id || null,
        feed_url: feed.url || null,
        site_url: feed.siteUrl || null,
        raw_json: source,
    };
}

const PapersDataSource = {
    type: 'papers',
    async fetch(env, foloCookie) {
        const hgPapersListId = env.HGPAPERS_LIST_ID;
        const fetchPages = parseInt(env.HGPAPERS_FETCH_PAGES || '1', 10);
        const allPaperItems = [];
        const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);

        if (!hgPapersListId) {
            console.warn('HGPAPERS_LIST_ID is not set in environment variables. Skipping papers fetch.');
            return {
                version: "https://jsonfeed.org/version/1.1",
                title: "Aggregated Papers",
                home_page_url: "https://example.com/papers",
                description: "Aggregated papers from various sources",
                language: "zh-cn",
                items: []
            };
        }

        let publishedAfter = null;
        for (let i = 0; i < fetchPages; i++) {
            const userAgent = getRandomUserAgent();
            const headers = {
                'User-Agent': userAgent,
                'Content-Type': 'application/json',
                'accept': 'application/json',
                'accept-language': 'zh-CN,zh;q=0.9',
                'baggage': 'sentry-environment=stable,sentry-release=5251fa921ef6cbb6df0ac4271c41c2b4a0ce7c50,sentry-public_key=e5bccf7428aa4e881ed5cb713fdff181,sentry-trace_id=2da50ca5ad944cb794670097d876ada8,sentry-sampled=true,sentry-sample_rand=0.06211835167903246,sentry-sample_rate=1',
                'origin': 'https://app.follow.is',
                'priority': 'u=1, i',
                'sec-ch-ua': '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
                'sec-ch-ua-mobile': '?1',
                'sec-ch-ua-platform': '"Android"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'x-app-name': 'Folo Web',
                'x-app-version': '1.50',
            };

            if (foloCookie) {
                headers['Cookie'] = foloCookie;
            }

            const body = {
                listId: hgPapersListId,
                view: 1,
                withContent: false,
            };

            if (publishedAfter) {
                body.publishedAfter = publishedAfter;
            }

            try {
                console.log(`Fetching Papers data, page ${i + 1}...`);
                console.log(`Debug curl for Papers page ${i + 1}:\n${buildCurlCommand(env.FOLO_DATA_API, headers, body)}`);
                const response = await fetch(env.FOLO_DATA_API, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(body),
                });

                if (!response.ok) {
                    console.error(`Failed to fetch Papers data, page ${i + 1}: ${response.statusText}`);
                    throw new Error(`Papers request failed: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                if (data && data.data && data.data.length > 0) {
        const referenceDate = getSourceItemFetchDate(env);
        const filteredItems = data.data.filter(entry => isDateWithinLastDays(entry.entries.publishedAt, filterDays, referenceDate));
                    allPaperItems.push(...filteredItems.map(entry => ({
                        id: entry.entries.id,
                        url: entry.entries.url,
                        title: entry.entries.title,
                        content_html: entry.entries.content,
                        date_published: entry.entries.publishedAt,
                        authors: [{ name: entry.entries.author }],
                        source: entry.feeds.title,
                        source_meta: buildSourceMeta(entry),
                    })));
                    publishedAfter = data.data[data.data.length - 1].entries.publishedAt;
                } else {
                    console.log(`No more data for Papers, page ${i + 1}.`);
                    break;
                }
            } catch (error) {
                console.error(`Error fetching Papers data, page ${i + 1}:`, error);
                throw error;
            }

            await sleep(Math.random() * 5000);
        }

        return {
            version: "https://jsonfeed.org/version/1.1",
            title: "Aggregated Papers",
            home_page_url: "https://example.com/papers",
            description: "Aggregated papers from various sources",
            language: "zh-cn",
            items: allPaperItems
        };
    },

    transform(rawData, sourceType) {
        if (!rawData || !rawData.items) {
            return [];
        }

        return rawData.items.map(item => ({
            id: item.id,
            type: sourceType,
            url: item.url,
            title: item.title,
            description: stripHtml(item.content_html || ""),
            published_date: item.date_published,
            authors: item.authors ? item.authors.map(author => author.name).join(', ') : 'Unknown',
            source: item.source || 'Aggregated Papers',
            details: {
                content_html: item.content_html || ""
            },
            source_meta: item.source_meta || null,
        }));
    },

    generateHtml: (item) => {
        return `
            <strong>${escapeHtml(item.title)}</strong><br>
            <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${formatDateToChineseWithTime(item.published_date)}</small>
            <div class="content-html">
                 ${item.details.content_html || '无内容。'}<hr>
            </div>
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">在 ArXiv/来源 阅读</a>
        `;
    }
};

export default PapersDataSource;
