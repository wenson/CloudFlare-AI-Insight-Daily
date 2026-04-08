CREATE TABLE IF NOT EXISTS daily_reports (
  report_date TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  daily_markdown TEXT NOT NULL,
  rss_markdown TEXT NOT NULL,
  rss_html TEXT NOT NULL,
  source_item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT NOT NULL
);
