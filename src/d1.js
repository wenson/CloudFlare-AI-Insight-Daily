const UPSERT_SOURCE_ITEM_SQL = `
        INSERT INTO source_items (
            source_type,
            source_name,
            source_item_id,
            title,
            url,
            guid,
            author_name,
            author_url,
            author_avatar,
            description_text,
            content_html,
            published_at,
            inserted_at,
            language,
            summary,
            categories_json,
            media_json,
            attachments_json,
            extra_json,
            raw_json,
            first_seen_date,
            last_seen_date,
            created_at,
            updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(source_type, source_item_id) DO UPDATE SET
            source_name = excluded.source_name,
            title = excluded.title,
            url = excluded.url,
            guid = excluded.guid,
            author_name = excluded.author_name,
            author_url = excluded.author_url,
            author_avatar = excluded.author_avatar,
            description_text = excluded.description_text,
            content_html = excluded.content_html,
            published_at = excluded.published_at,
            inserted_at = excluded.inserted_at,
            language = excluded.language,
            summary = excluded.summary,
            categories_json = excluded.categories_json,
            media_json = excluded.media_json,
            attachments_json = excluded.attachments_json,
            extra_json = excluded.extra_json,
            raw_json = excluded.raw_json,
            last_seen_date = excluded.last_seen_date,
            updated_at = excluded.updated_at
    `;

function buildSourceItemBindArgs(item) {
    return [
        item.source_type,
        item.source_name,
        item.source_item_id,
        item.title,
        item.url,
        item.guid,
        item.author_name,
        item.author_url,
        item.author_avatar,
        item.description_text,
        item.content_html,
        item.published_at,
        item.inserted_at,
        item.language,
        item.summary,
        item.categories_json,
        item.media_json,
        item.attachments_json,
        item.extra_json,
        item.raw_json,
        item.first_seen_date,
        item.last_seen_date,
        item.created_at,
        item.updated_at,
    ];
}

function prepareUpsertSourceItem(db, item) {
    return db.prepare(UPSERT_SOURCE_ITEM_SQL).bind(...buildSourceItemBindArgs(item));
}

export async function upsertDailyReport(db, report) {
    return db.prepare(`
        INSERT INTO daily_reports (
            report_date,
            title,
            daily_markdown,
            rss_markdown,
            rss_html,
            source_item_count,
            created_at,
            updated_at,
            published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(report_date) DO UPDATE SET
            title = excluded.title,
            daily_markdown = excluded.daily_markdown,
            rss_markdown = excluded.rss_markdown,
            rss_html = excluded.rss_html,
            source_item_count = excluded.source_item_count,
            updated_at = excluded.updated_at
    `).bind(
        report.report_date,
        report.title,
        report.daily_markdown,
        report.rss_markdown,
        report.rss_html,
        report.source_item_count,
        report.created_at,
        report.updated_at,
        report.published_at,
    ).run();
}

export async function getDailyReportMetadata(db, reportDate) {
    const result = await db.prepare(`
        SELECT created_at, published_at
        FROM daily_reports
        WHERE report_date = ?
        LIMIT 1
    `).bind(reportDate).first();

    return result || null;
}

export async function listDailyReports(db, days) {
    const result = await db.prepare(`
        SELECT report_date, title, rss_html, published_at
        FROM daily_reports
        WHERE rss_html IS NOT NULL AND rss_html != ''
        ORDER BY report_date DESC
        LIMIT ?
    `).bind(days).all();

    return result.results || [];
}

export async function listSourceItemArchiveDays(db) {
    const result = await db.prepare(`
        SELECT
            strftime('%Y-%m-%d', datetime(published_at, '+8 hours')) AS archive_date,
            COUNT(*) AS total_count,
            SUM(CASE WHEN source_type = 'news' THEN 1 ELSE 0 END) AS news_count,
            SUM(CASE WHEN source_type = 'paper' THEN 1 ELSE 0 END) AS paper_count,
            SUM(CASE WHEN source_type = 'socialMedia' THEN 1 ELSE 0 END) AS social_media_count,
            MAX(published_at) AS latest_published_at
        FROM source_items
        WHERE published_at IS NOT NULL AND published_at != ''
        GROUP BY archive_date
        ORDER BY archive_date DESC
    `).bind().all();

    return result.results || [];
}

export async function upsertSourceItem(db, item) {
    return prepareUpsertSourceItem(db, item).run();
}

export async function upsertSourceItems(db, items) {
    if (!Array.isArray(items) || items.length === 0) {
        return [];
    }
    if (typeof db?.batch !== 'function') {
        throw new Error('D1 batch API is required for source item persistence.');
    }

    return db.batch(items.map((item) => prepareUpsertSourceItem(db, item)));
}

export async function listSourceItemsByPublishedWindow(db, bounds) {
    const result = await db.prepare(`
        SELECT *
        FROM source_items
        WHERE published_at >= ? AND published_at <= ?
        ORDER BY published_at DESC
    `).bind(bounds.startAt, bounds.endAt).all();

    return result.results || [];
}

export async function countSourceItemsByPublishedWindowGroupedByType(db, bounds) {
    const result = await db.prepare(`
        SELECT source_type, COUNT(*) AS total_count
        FROM source_items
        WHERE published_at >= ? AND published_at <= ?
        GROUP BY source_type
    `).bind(bounds.startAt, bounds.endAt).all();

    return result.results || [];
}

export async function listSourceItemsByPublishedWindowAndType(db, {
    startAt,
    endAt,
    sourceType,
    limit,
    offset,
}) {
    if (!sourceType) {
        return [];
    }

    const safeLimit = Math.max(1, Number(limit) || 50);
    const safeOffset = Math.max(0, Number(offset) || 0);
    const result = await db.prepare(`
        SELECT *
        FROM source_items
        WHERE published_at >= ? AND published_at <= ?
          AND source_type = ?
        ORDER BY published_at DESC
        LIMIT ? OFFSET ?
    `).bind(startAt, endAt, sourceType, safeLimit, safeOffset).all();

    return result.results || [];
}

export async function getSourceItemsBySelections(db, selections) {
    if (!Array.isArray(selections) || selections.length === 0) {
        return [];
    }

    const clauses = selections
        .map(() => '(source_type = ? AND source_item_id = ?)')
        .join(' OR ');
    const args = selections.flatMap(({ sourceType, sourceItemId }) => [sourceType, sourceItemId]);

    const result = await db.prepare(`
        SELECT *
        FROM source_items
        WHERE ${clauses}
    `).bind(...args).all();

    return result.results || [];
}

export async function getSourceItemsBySelectionsInPublishedWindow(db, selections, bounds) {
    if (!Array.isArray(selections) || selections.length === 0) {
        return [];
    }
    if (!bounds?.startAt || !bounds?.endAt) {
        return [];
    }

    const clauses = selections
        .map(() => '(source_type = ? AND source_item_id = ?)')
        .join(' OR ');
    const args = [
        ...selections.flatMap(({ sourceType, sourceItemId }) => [sourceType, sourceItemId]),
        bounds.startAt,
        bounds.endAt,
    ];

    const result = await db.prepare(`
        SELECT *
        FROM source_items
        WHERE (${clauses})
          AND published_at >= ?
          AND published_at <= ?
    `).bind(...args).all();

    return result.results || [];
}
