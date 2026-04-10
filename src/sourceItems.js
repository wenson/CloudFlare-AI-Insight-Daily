function toJsonOrNull(value) {
  return value == null ? null : JSON.stringify(value);
}

function parseJsonOrNull(value) {
  if (value == null || value === '') {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getFirstAuthorName(authors) {
  if (typeof authors === 'string') {
    return authors;
  }
  if (!Array.isArray(authors) || authors.length === 0) {
    return null;
  }
  const [first] = authors;
  if (typeof first === 'string') {
    return first;
  }
  if (first && typeof first === 'object') {
    return first.name || null;
  }
  return null;
}

export function getPublishedWindowBounds(dateStr, filterDays) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const days = Number(filterDays) || 1;
  const start = new Date(Date.UTC(year, month - 1, day - (days - 1), -8, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function getPublishedDayBounds(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));

  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function buildSourceItemRecord(item, fetchDate, now = new Date().toISOString()) {
  const meta = item?.source_meta || {};
  const hasRawJson = Object.prototype.hasOwnProperty.call(meta, 'raw_json');

  return {
    source_type: item?.type || '',
    source_name: item?.source || 'Unknown source',
    source_item_id: String(item?.id ?? ''),
    title: item?.title || '',
    url: item?.url || '',
    guid: meta.guid || item?.url || null,
    author_name: meta.author_name || getFirstAuthorName(item?.authors),
    author_url: meta.author_url || null,
    author_avatar: meta.author_avatar || null,
    description_text: item?.description || '',
    content_html: item?.details?.content_html || '',
    published_at: item?.published_date || null,
    inserted_at: meta.inserted_at || null,
    language: meta.language || null,
    summary: meta.summary || null,
    categories_json: toJsonOrNull(meta.categories),
    media_json: toJsonOrNull(meta.media),
    attachments_json: toJsonOrNull(meta.attachments),
    extra_json: toJsonOrNull(meta.extra),
    raw_json: JSON.stringify(hasRawJson ? meta.raw_json : item),
    first_seen_date: fetchDate,
    last_seen_date: fetchDate,
    created_at: now,
    updated_at: now,
  };
}

export function mapSourceItemRowToUnifiedItem(row) {
  const categories = parseJsonOrNull(row.categories_json);
  const media = parseJsonOrNull(row.media_json);
  const attachments = parseJsonOrNull(row.attachments_json);
  const extra = parseJsonOrNull(row.extra_json);
  const rawJson = parseJsonOrNull(row.raw_json);

  return {
    id: row.source_item_id,
    type: row.source_type,
    url: row.url,
    title: row.title,
    description: row.description_text || '',
    published_date: row.published_at,
    authors: row.author_name || 'Unknown',
    source: row.source_name || 'Unknown source',
    details: {
      content_html: row.content_html || '',
    },
    source_meta: {
      guid: row.guid || row.url || null,
      author_name: row.author_name || null,
      author_url: row.author_url || null,
      author_avatar: row.author_avatar || null,
      inserted_at: row.inserted_at || null,
      language: row.language || null,
      summary: row.summary || null,
      categories,
      media,
      attachments,
      extra,
      raw_json: rawJson,
    },
  };
}

export function groupSourceItemsByType(items) {
  const grouped = { news: [], paper: [], socialMedia: [] };
  for (const item of items) {
    const type = item?.type;
    if (!type) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(grouped, type)) {
      grouped[type] = [];
    }
    grouped[type].push(item);
  }
  return grouped;
}
