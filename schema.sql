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

CREATE TABLE IF NOT EXISTS source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_item_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  guid TEXT,
  author_name TEXT,
  author_url TEXT,
  author_avatar TEXT,
  description_text TEXT,
  content_html TEXT,
  published_at TEXT NOT NULL,
  inserted_at TEXT,
  language TEXT,
  summary TEXT,
  categories_json TEXT,
  media_json TEXT,
  attachments_json TEXT,
  extra_json TEXT,
  raw_json TEXT NOT NULL,
  first_seen_date TEXT NOT NULL,
  last_seen_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_type, source_item_id)
);

CREATE INDEX IF NOT EXISTS idx_source_items_published_type
ON source_items (published_at, source_type);

CREATE INDEX IF NOT EXISTS idx_source_items_last_seen
ON source_items (last_seen_date);
