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
