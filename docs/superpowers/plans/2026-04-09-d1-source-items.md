# D1 Source Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move fetched source content from KV to D1-only storage while keeping `/getContentHtml`, `/getContent`, `/genAIContent`, and `/rss` behavior stable for users under a deliberate `latest-view` model.

**Architecture:** Thread richer source metadata through the active Folo-backed data sources, persist unified source items into a new D1 table `source_items`, and switch all content readers from KV to D1 queries. `source_items` is the current canonical content table, so `/getContentHtml?date=...`, `/getContent`, and `/genAIContent` all rebuild their content window from the latest rows instead of frozen historical snapshots. Keep `daily_reports` as the generated-output table and keep KV only for login/session concerns.

**Tech Stack:** Cloudflare Workers, Cloudflare D1, Cloudflare KV for session storage only, plain JavaScript ES modules, Node test runner with `tests/extension-loader.mjs`

---

## File Map

- Modify: `schema.sql`
  - Add the new `source_items` table and its indexes next to the existing `daily_reports` schema.
- Modify: `src/d1.js`
  - Keep `daily_reports` helpers and add `source_items` upsert/query helpers.
- Create: `src/sourceItems.js`
  - Centralize source-item record building, published-window calculation, row-to-unified-item mapping, and category grouping helpers.
- Modify: `src/dataSources/newsAggregator.js`
  - Preserve richer source payload fields on fetched items so D1 persistence can store them.
- Modify: `src/dataSources/papers.js`
  - Preserve richer source payload fields on fetched items so D1 persistence can store them.
- Modify: `src/dataSources/twitter.js`
  - Preserve richer source payload fields on fetched items so D1 persistence can store them.
- Modify: `src/dataSources/reddit.js`
  - Preserve richer source payload fields on fetched items so D1 persistence can store them.
- Modify: `src/handlers/writeData.js`
  - Stop writing content arrays to KV and upsert fetched unified items into `source_items`.
- Modify: `src/handlers/getContent.js`
  - Read content from D1 by published window and return grouped category payloads.
- Modify: `src/handlers/getContentHtml.js`
  - Read content from D1 by published window and keep the same UI data shape.
- Modify: `src/handlers/genAIContent.js`
  - Resolve `selectedItems` directly from D1 instead of reading per-day KV blobs.
- Modify: `docs/DATA_FLOW.md`
  - Update the architecture description from `KV + D1` content storage to `D1-only` content storage with KV sessions.
- Modify: `docs/KV_KEYS.md`
  - Remove content KV keys and document session-only KV usage.
- Modify: `docs/API_ROUTES.md`
  - Update route data sources for `/writeData`, `/getContent`, `/getContentHtml`, and `/genAIContent`.
- Modify: `docs/DEPLOYMENT.md`
  - Document D1 schema initialization for `source_items` and remove content-KV assumptions.
- Create: `tests/source-items.test.mjs`
  - Cover record building, published window bounds, grouping, and D1 helper SQL.
- Create: `tests/writeData-d1-source-items.test.mjs`
  - Cover D1 upserts and verify content is no longer written to KV.
- Create: `tests/get-content-d1.test.mjs`
  - Cover D1-backed `/getContent` and `/getContentHtml`.
- Modify: `tests/rss-d1.test.mjs`
  - Update `genAIContent` coverage to read selected source items from D1 instead of KV.

## Product Semantics

- `/rss` always reflects the latest generated content in `daily_reports`.
- `/getContentHtml?date=YYYY-MM-DD` and `/getContent?date=YYYY-MM-DD` rebuild the requested published window from the current `source_items` table.
- `/genAIContent` also resolves selected source items from the current `source_items` rows in the requested published window.
- Historical `date=` views and old-report regeneration are intentionally not immutable snapshots. Later backfills or content edits may change what appears for an older date.

## Task 1: Preserve Source Metadata and Add Source Item Mappers

**Files:**
- Create: `src/sourceItems.js`
- Modify: `src/dataSources/newsAggregator.js`
- Modify: `src/dataSources/papers.js`
- Modify: `src/dataSources/twitter.js`
- Modify: `src/dataSources/reddit.js`
- Test: `tests/source-items.test.mjs`

- [ ] **Step 1: Write the failing tests for source item record building and window math**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceItemRecord,
  getPublishedWindowBounds,
  mapSourceItemRowToUnifiedItem,
  groupSourceItemsByType,
} from '../src/sourceItems.js';

test('buildSourceItemRecord preserves rich source payload fields', () => {
  const record = buildSourceItemRecord({
    id: '264914242829813760',
    type: 'news',
    title: '马斯克死磕奥特曼：赔款我不要，但他必须离开OpenAI董事会',
    url: 'https://www.qbitai.com/2026/04/398071.html',
    source: '量子位',
    published_date: '2026-04-09T03:41:25.334Z',
    details: {
      content_html: '<p>西风 发自 凹非寺</p>',
    },
    source_meta: {
      guid: 'https://www.qbitai.com/2026/04/398071.html',
      author_name: '量子位',
      inserted_at: '2026-04-09T03:58:11.139Z',
      categories: ['资讯', '山姆·奥特曼', '马斯克'],
      media: [{ url: 'https://i.qbitai.com/a.webp', type: 'photo' }],
      raw_json: { foo: 'bar' },
    },
  }, '2026-04-09');

  assert.equal(record.source_type, 'news');
  assert.equal(record.source_name, '量子位');
  assert.equal(record.source_item_id, '264914242829813760');
  assert.equal(record.guid, 'https://www.qbitai.com/2026/04/398071.html');
  assert.equal(record.author_name, '量子位');
  assert.equal(record.inserted_at, '2026-04-09T03:58:11.139Z');
  assert.equal(record.first_seen_date, '2026-04-09');
  assert.equal(record.last_seen_date, '2026-04-09');
  assert.equal(record.categories_json, JSON.stringify(['资讯', '山姆·奥特曼', '马斯克']));
  assert.equal(record.media_json, JSON.stringify([{ url: 'https://i.qbitai.com/a.webp', type: 'photo' }]));
  assert.equal(record.raw_json, JSON.stringify({ foo: 'bar' }));
});

test('getPublishedWindowBounds returns the shanghai day window for FOLO_FILTER_DAYS', () => {
  const bounds = getPublishedWindowBounds('2026-04-09', 2);

  assert.deepEqual(bounds, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
  });
});

test('mapSourceItemRowToUnifiedItem and groupSourceItemsByType rebuild handler payloads', () => {
  const grouped = groupSourceItemsByType([
    mapSourceItemRowToUnifiedItem({
      source_type: 'news',
      source_name: '量子位',
      source_item_id: '264914242829813760',
      title: '量子位新闻',
      url: 'https://example.com/news/1',
      author_name: '量子位',
      description_text: '新闻摘要',
      content_html: '<p>新闻正文</p>',
      published_at: '2026-04-09T03:41:25.334Z',
    }),
  ]);

  assert.equal(grouped.news.length, 1);
  assert.equal(grouped.paper.length, 0);
  assert.equal(grouped.socialMedia.length, 0);
  assert.equal(grouped.news[0].id, '264914242829813760');
  assert.equal(grouped.news[0].details.content_html, '<p>新闻正文</p>');
});
```

- [ ] **Step 2: Run the test to verify it fails because the helper module does not exist yet**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `../src/sourceItems.js`

- [ ] **Step 3: Implement the source item helper module and thread `source_meta` through active sources**

```js
// src/sourceItems.js
export function getPublishedWindowBounds(dateStr, filterDays) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - (filterDays - 1), -8, 0, 0, 0));
  const end = new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999));
  return {
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  };
}

export function buildSourceItemRecord(item, fetchDate, now = new Date().toISOString()) {
  const meta = item.source_meta || {};
  return {
    source_type: item.type,
    source_name: item.source || 'Unknown source',
    source_item_id: String(item.id),
    title: item.title || '',
    url: item.url || '',
    guid: meta.guid || item.url || null,
    author_name: meta.author_name || (Array.isArray(item.authors) ? item.authors[0]?.name ?? null : null),
    author_url: meta.author_url || null,
    author_avatar: meta.author_avatar || null,
    description_text: item.description || '',
    content_html: item.details?.content_html || '',
    published_at: item.published_date,
    inserted_at: meta.inserted_at || null,
    language: meta.language || null,
    summary: meta.summary || null,
    categories_json: meta.categories ? JSON.stringify(meta.categories) : null,
    media_json: meta.media ? JSON.stringify(meta.media) : null,
    attachments_json: meta.attachments ? JSON.stringify(meta.attachments) : null,
    extra_json: meta.extra ? JSON.stringify(meta.extra) : null,
    raw_json: JSON.stringify(meta.raw_json || item),
    first_seen_date: fetchDate,
    last_seen_date: fetchDate,
    created_at: now,
    updated_at: now,
  };
}

export function mapSourceItemRowToUnifiedItem(row) {
  return {
    id: row.source_item_id,
    type: row.source_type,
    url: row.url,
    title: row.title,
    description: row.description_text || '',
    published_date: row.published_at,
    authors: row.author_name ? [{ name: row.author_name }] : [],
    source: row.source_name,
    details: {
      content_html: row.content_html || '',
    },
  };
}

export function groupSourceItemsByType(items) {
  return {
    news: items.filter((item) => item.type === 'news'),
    paper: items.filter((item) => item.type === 'paper'),
    socialMedia: items.filter((item) => item.type === 'socialMedia'),
  };
}
```

```js
// src/dataSources/newsAggregator.js, papers.js, twitter.js, reddit.js
source_meta: {
  guid: entry.entries.guid || entry.entries.url || null,
  author_name: entry.entries.author || null,
  author_url: entry.entries.authorUrl || null,
  author_avatar: entry.entries.authorAvatar || null,
  inserted_at: entry.entries.insertedAt || null,
  language: entry.entries.language || null,
  summary: entry.entries.summary || null,
  categories: entry.entries.categories || null,
  media: entry.entries.media || null,
  attachments: entry.entries.attachments || null,
  extra: entry.entries.extra || null,
  raw_json: entry.entries,
},
```

- [ ] **Step 4: Run the focused helper test to verify it passes**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs`

Expected: PASS with 3 tests passing and no `ERR_MODULE_NOT_FOUND`

- [ ] **Step 5: Commit the helper and source metadata threading**

```bash
git add tests/source-items.test.mjs src/sourceItems.js src/dataSources/newsAggregator.js src/dataSources/papers.js src/dataSources/twitter.js src/dataSources/reddit.js
git commit -m "feat: preserve source metadata for D1 storage"
```

## Task 2: Add `source_items` Schema and D1 Query Helpers

**Files:**
- Modify: `schema.sql`
- Modify: `src/d1.js`
- Test: `tests/source-items.test.mjs`

- [ ] **Step 1: Extend the failing D1 helper test with schema and SQL expectations**

```js
import { upsertSourceItem, listSourceItemsByPublishedWindow, getSourceItemsBySelections } from '../src/d1.js';

function createDb(results = []) {
  const state = { sql: '', args: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...args) {
          state.args = args;
          return {
            async run() { return { success: true }; },
            async all() { return { results }; },
          };
        },
      };
    },
  };
}

test('upsertSourceItem uses unique source_type and source_item_id conflict handling', async () => {
  const db = createDb();
  await upsertSourceItem(db, {
    source_type: 'news',
    source_name: '量子位',
    source_item_id: '264914242829813760',
    title: '量子位新闻',
    url: 'https://example.com/news/1',
    guid: 'https://example.com/news/1',
    author_name: '量子位',
    author_url: null,
    author_avatar: null,
    description_text: '新闻摘要',
    content_html: '<p>新闻正文</p>',
    published_at: '2026-04-09T03:41:25.334Z',
    inserted_at: '2026-04-09T03:58:11.139Z',
    language: null,
    summary: null,
    categories_json: '["资讯"]',
    media_json: '[]',
    attachments_json: null,
    extra_json: null,
    raw_json: '{"foo":"bar"}',
    first_seen_date: '2026-04-09',
    last_seen_date: '2026-04-09',
    created_at: '2026-04-09T04:00:00.000Z',
    updated_at: '2026-04-09T04:00:00.000Z',
  });

  assert.match(db.state.sql, /INSERT INTO source_items/);
  assert.match(db.state.sql, /ON CONFLICT\(source_type, source_item_id\)/);
  assert.equal(db.state.args[0], 'news');
  assert.equal(db.state.args[2], '264914242829813760');
});

test('listSourceItemsByPublishedWindow queries the published_at range in descending order', async () => {
  const db = createDb([{ source_item_id: '264914242829813760' }]);
  const results = await listSourceItemsByPublishedWindow(db, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
  });

  assert.match(db.state.sql, /WHERE published_at >= \? AND published_at <= \?/);
  assert.match(db.state.sql, /ORDER BY published_at DESC/);
  assert.equal(results.length, 1);
});

test('getSourceItemsBySelections fetches exact type and id pairs', async () => {
  const db = createDb([{ source_type: 'news', source_item_id: '1' }]);
  const rows = await getSourceItemsBySelections(db, [
    { sourceType: 'news', sourceItemId: '1' },
    { sourceType: 'paper', sourceItemId: '2' },
  ]);

  assert.match(db.state.sql, /\(source_type = \? AND source_item_id = \?\) OR \(source_type = \? AND source_item_id = \?\)/);
  assert.deepEqual(db.state.args, ['news', '1', 'paper', '2']);
  assert.equal(rows.length, 1);
});
```

- [ ] **Step 2: Run the test to verify the new helper expectations fail**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs`

Expected: FAIL with missing exports from `src/d1.js` and missing `source_items` SQL references

- [ ] **Step 3: Add the `source_items` table to `schema.sql` and implement the D1 helpers**

```sql
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
```

```js
export async function upsertSourceItem(db, item) {
  return db.prepare(`
    INSERT INTO source_items (
      source_type, source_name, source_item_id, title, url, guid,
      author_name, author_url, author_avatar, description_text, content_html,
      published_at, inserted_at, language, summary, categories_json, media_json,
      attachments_json, extra_json, raw_json, first_seen_date, last_seen_date,
      created_at, updated_at
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
  `).bind(
    item.source_type, item.source_name, item.source_item_id, item.title, item.url, item.guid,
    item.author_name, item.author_url, item.author_avatar, item.description_text, item.content_html,
    item.published_at, item.inserted_at, item.language, item.summary, item.categories_json, item.media_json,
    item.attachments_json, item.extra_json, item.raw_json, item.first_seen_date, item.last_seen_date,
    item.created_at, item.updated_at,
  ).run();
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

export async function getSourceItemsBySelections(db, selections) {
  const clauses = selections.map(() => '(source_type = ? AND source_item_id = ?)').join(' OR ');
  const args = selections.flatMap(({ sourceType, sourceItemId }) => [sourceType, sourceItemId]);
  const result = await db.prepare(`
    SELECT *
    FROM source_items
    WHERE ${clauses}
  `).bind(...args).all();
  return result.results || [];
}
```

- [ ] **Step 4: Run the helper test again to verify schema and SQL helpers pass**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs`

Expected: PASS with the helper SQL assertions green

- [ ] **Step 5: Commit the schema and D1 helper layer**

```bash
git add schema.sql src/d1.js tests/source-items.test.mjs
git commit -m "feat: add D1 source item storage helpers"
```

## Task 3: Migrate `/writeData` from Content KV Writes to D1 Upserts

**Files:**
- Modify: `src/handlers/writeData.js`
- Modify: `src/sourceItems.js`
- Test: `tests/writeData-d1-source-items.test.mjs`

- [ ] **Step 1: Write the failing `/writeData` migration test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function createDb() {
  const runs = [];
  return {
    runs,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              runs.push({ sql, args });
              return { success: true };
            },
          };
        },
      };
    },
  };
}

test('handleWriteData stores fetched items in D1 and does not write content KV', async () => {
  const previousFetchDate = getFetchDate();
  const originalFetch = global.fetch;
  const db = createDb();

  global.fetch = async () => new Response(JSON.stringify({
    data: [{
      entries: {
        id: '264914242829813760',
        url: 'https://www.qbitai.com/2026/04/398071.html',
        title: '量子位新闻',
        description: '新闻摘要',
        content: '<p>新闻正文</p>',
        publishedAt: '2026-04-09T03:41:25.334Z',
        insertedAt: '2026-04-09T03:58:11.139Z',
        author: '量子位',
        media: [{ url: 'https://i.qbitai.com/a.webp', type: 'photo' }],
        categories: ['资讯'],
      },
      feeds: { title: '量子位' },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  const env = {
    DB: db,
    DATA_KV: {
      async put() {
        throw new Error('content KV write should not happen');
      },
    },
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'configured-list-id',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
  };

  try {
    setFetchDate('2026-04-09');
    const response = await handleWriteData(new Request('https://example.com/writeData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: 'news', foloCookie: 'cookie' }),
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.newsItemCount, 1);
    assert.equal(db.runs.length, 1);
    assert.match(db.runs[0].sql, /INSERT INTO source_items/);
  } finally {
    setFetchDate(previousFetchDate);
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the test to verify the existing handler still tries to write KV**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/writeData-d1-source-items.test.mjs`

Expected: FAIL with `content KV write should not happen`

- [ ] **Step 3: Replace content KV writes with D1 upserts inside `/writeData`**

```js
import { upsertSourceItem } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';

async function persistItemsToD1(db, items, fetchDate) {
  const writes = items.map((item) => {
    const record = buildSourceItemRecord(item, fetchDate);
    return upsertSourceItem(db, record);
  });
  await Promise.all(writes);
}

if (category) {
  // ...
  await persistItemsToD1(env.DB, fetchedData, dateStr);
  successMessage = `Data for category '${category}' fetched and stored in D1.`;
} else {
  for (const sourceType in dataSources) {
    if (Object.hasOwnProperty.call(dataSources, sourceType)) {
      dataToStore[sourceType] = allUnifiedData[sourceType] || [];
      await persistItemsToD1(env.DB, dataToStore[sourceType], dateStr);
      console.log(`Stored ${dataToStore[sourceType].length} ${sourceType} items in D1.`);
    }
  }
}
```

- [ ] **Step 4: Run the focused `/writeData` migration test and the existing unknown-category suite**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs`

Expected: PASS with the new D1 write assertion green and the unknown-category protections unchanged

- [ ] **Step 5: Commit the `/writeData` D1 migration**

```bash
git add src/handlers/writeData.js src/sourceItems.js tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs
git commit -m "feat: store fetched source items in D1"
```

## Task 4: Switch `/getContent` and `/getContentHtml` to D1 Reads

**Files:**
- Modify: `src/handlers/getContent.js`
- Modify: `src/handlers/getContentHtml.js`
- Modify: `src/sourceItems.js`
- Test: `tests/get-content-d1.test.mjs`

- [ ] **Step 1: Write the failing D1-backed content read tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGetContent } from '../src/handlers/getContent.js';
import { handleGetContentHtml } from '../src/handlers/getContentHtml.js';

function createDb(results) {
  return {
    prepare() {
      return {
        bind() {
          return {
            async all() {
              return { results };
            },
          };
        },
      };
    },
  };
}

test('handleGetContent reads grouped source items from D1 instead of KV', async () => {
  const env = {
    DB: createDb([{
      source_type: 'news',
      source_name: '量子位',
      source_item_id: '264914242829813760',
      title: '量子位新闻',
      url: 'https://example.com/news/1',
      author_name: '量子位',
      description_text: '新闻摘要',
      content_html: '<p>新闻正文</p>',
      published_at: '2026-04-09T03:41:25.334Z',
    }]),
    DATA_KV: {
      async get() {
        throw new Error('content KV read should not happen');
      },
    },
  };

  const response = await handleGetContent(new Request('https://example.com/getContent?date=2026-04-09'), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.news.length, 1);
  assert.equal(body.news[0].title, '量子位新闻');
});

test('handleGetContentHtml renders D1-backed source items into the workspace page', async () => {
  const env = {
    DB: createDb([{
      source_type: 'news',
      source_name: '量子位',
      source_item_id: '264914242829813760',
      title: '量子位新闻',
      url: 'https://example.com/news/1',
      author_name: '量子位',
      description_text: '新闻摘要',
      content_html: '<p>新闻正文</p>',
      published_at: '2026-04-09T03:41:25.334Z',
    }]),
    DATA_KV: {
      async get() {
        throw new Error('content KV read should not happen');
      },
    },
    FOLO_FILTER_DAYS: '1',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
  };

  const response = await handleGetContentHtml(
    new Request('https://example.com/getContentHtml?date=2026-04-09'),
    env,
    [{ id: 'news', name: '新闻' }, { id: 'paper', name: '论文' }, { id: 'socialMedia', name: '社交平台' }],
  );

  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /量子位新闻/);
  assert.match(html, /共 1 条候选内容/);
});
```

- [ ] **Step 2: Run the new handler tests to verify the current KV readers fail**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/get-content-d1.test.mjs`

Expected: FAIL with `content KV read should not happen`

- [ ] **Step 3: Replace KV reads with D1 window queries and grouping**

```js
import { listSourceItemsByPublishedWindow } from '../d1.js';
import { getPublishedWindowBounds, groupSourceItemsByType, mapSourceItemRowToUnifiedItem } from '../sourceItems.js';

const filterDays = parseInt(env.FOLO_FILTER_DAYS || '3', 10);
const bounds = getPublishedWindowBounds(dateStr, filterDays);
const rows = await listSourceItemsByPublishedWindow(env.DB, bounds);
const groupedData = groupSourceItemsByType(rows.map(mapSourceItemRowToUnifiedItem));

return new Response(JSON.stringify({
  date: dateStr,
  message: `Successfully retrieved data for ${dateStr}.`,
  ...groupedData,
}), {
  headers: { 'Content-Type': 'application/json' },
});
```

```js
const rows = await listSourceItemsByPublishedWindow(env.DB, bounds);
const allData = groupSourceItemsByType(rows.map(mapSourceItemRowToUnifiedItem));
const html = generateContentSelectionPageHtml(env, dateStr, allData, dataCategories);
```

- [ ] **Step 4: Run the D1 handler tests and the existing content selection page UI tests**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/get-content-d1.test.mjs tests/content-selection-page-ui.test.mjs`

Expected: PASS with D1 handler coverage green and the UI shell tests still green

- [ ] **Step 5: Commit the D1 read-side migration**

```bash
git add src/handlers/getContent.js src/handlers/getContentHtml.js src/sourceItems.js tests/get-content-d1.test.mjs tests/content-selection-page-ui.test.mjs
git commit -m "feat: read source content from D1"
```

## Task 5: Switch `/genAIContent` Source Resolution to D1

**Files:**
- Modify: `src/handlers/genAIContent.js`
- Modify: `src/d1.js`
- Modify: `src/sourceItems.js`
- Modify: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Rewrite the failing `genAIContent` test to read selected items from D1**

```js
test('genAIContent reads selected source items from D1 and still stores daily_reports output', async () => {
  const env = createEnv();
  env.DATA_KV.get = async () => {
    throw new Error('content KV read should not happen');
  };

  env.DB = {
    state: { sqlLog: [], argsLog: [] },
    prepare(sql) {
      env.DB.state.sqlLog.push(sql);
      return {
        bind(...args) {
          env.DB.state.argsLog.push(args);
          return {
            async first() {
              return null;
            },
            async all() {
              if (/FROM source_items/.test(sql)) {
                return {
                  results: [{
                    source_type: 'news',
                    source_name: '量子位',
                    source_item_id: '1',
                    title: 'Test title',
                    url: 'https://example.com/news/1',
                    author_name: '量子位',
                    description_text: 'Test summary',
                    content_html: '<p>Test content</p>',
                    published_at: '2026-04-08T08:00:00.000Z',
                  }],
                };
              }
              return { results: [] };
            },
            async run() {
              return { success: true };
            },
          };
        },
      };
    },
  };

  const formBody = new URLSearchParams();
  formBody.set('date', '2026-04-08');
  formBody.append('selectedItems', 'news:1');

  const response = await handleGenAIContent(new Request('https://example.com/genAIContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody,
  }), env);

  assert.equal(response.status, 200);
  assert.ok(env.DB.state.sqlLog.some((sql) => /FROM source_items/.test(sql)));
  assert.ok(env.DB.state.sqlLog.some((sql) => /INSERT INTO daily_reports/.test(sql)));
});
```

- [ ] **Step 2: Run the RSS/D1 test file to verify the current KV-based implementation fails**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs`

Expected: FAIL with `content KV read should not happen`

- [ ] **Step 3: Replace the per-day KV blob lookup with exact D1 selection queries**

```js
import { getSourceItemsBySelections } from '../d1.js';
import { mapSourceItemRowToUnifiedItem } from '../sourceItems.js';

const selections = selectedItemsParams.map((selection) => {
  const [sourceType, sourceItemId] = selection.split(':');
  return { sourceType, sourceItemId };
});

const rows = await getSourceItemsBySelections(env.DB, selections);
const itemsBySelection = new Map(
  rows.map((row) => {
    const item = mapSourceItemRowToUnifiedItem(row);
    return [`${item.type}:${item.id}`, item];
  }),
);

for (const selection of selectedItemsParams) {
  const item = itemsBySelection.get(selection);
  if (!item) {
    console.warn(`Could not find item for selection: ${selection} in D1.`);
    continue;
  }
  // existing itemText switch remains unchanged
}
```

- [ ] **Step 4: Run the updated D1 generation tests**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs`

Expected: PASS with the selected-item lookup happening through `source_items` and `daily_reports` writes still green

- [ ] **Step 5: Commit the D1-backed generation path**

```bash
git add src/handlers/genAIContent.js src/d1.js src/sourceItems.js tests/rss-d1.test.mjs
git commit -m "feat: resolve AI source selections from D1"
```

## Task 6: Update Docs and Run the D1-Only Regression Suite

**Files:**
- Modify: `docs/DATA_FLOW.md`
- Modify: `docs/KV_KEYS.md`
- Modify: `docs/API_ROUTES.md`
- Modify: `docs/DEPLOYMENT.md`
- Test: `tests/source-items.test.mjs`
- Test: `tests/writeData-d1-source-items.test.mjs`
- Test: `tests/get-content-d1.test.mjs`
- Test: `tests/rss-d1.test.mjs`
- Test: `tests/writeData-unknown-category.test.mjs`
- Test: `tests/content-selection-page-ui.test.mjs`

- [ ] **Step 1: Update the docs to describe D1-only content storage and session-only KV**

```md
<!-- docs/DATA_FLOW.md -->
- 浏览器 → Cloudflare Worker → Folo → Cloudflare D1(source_items) → 内容筛选 / AI 生成 → Cloudflare D1(daily_reports) → 浏览器结果页 / RSS
- KV 仅用于登录 session 与认证 cookie 相关数据，不再保存抓取内容。
```

```md
<!-- docs/KV_KEYS.md -->
- 删除 `YYYY-MM-DD-news`
- 删除 `YYYY-MM-DD-paper`
- 删除 `YYYY-MM-DD-socialMedia`
- 保留 `session:*` 和认证相关 KV key 说明
```

```md
<!-- docs/API_ROUTES.md -->
| `/writeData` | `POST` | 抓取并写入 `source_items` | 写 D1 |
| `/getContent` | `GET` | 读取发布时间窗口内的原始内容 | 读 D1 |
| `/getContentHtml` | `GET` | 渲染基于 D1 的内容工作台 | 读 D1 |
| `/genAIContent` | `POST` | 根据勾选 source item 生成日报并写 `daily_reports` | 读 D1 / 写 D1 |
```

- [ ] **Step 2: Run the full focused regression suite before any final cleanup**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs tests/writeData-d1-source-items.test.mjs tests/get-content-d1.test.mjs tests/rss-d1.test.mjs tests/writeData-unknown-category.test.mjs tests/content-selection-page-ui.test.mjs`

Expected: PASS with all targeted D1 migration tests green

- [ ] **Step 3: Remove any leftover content-KV wording or helper imports discovered by search**

```bash
rg -n "YYYY-MM-DD-news|YYYY-MM-DD-paper|YYYY-MM-DD-socialMedia|getFromKV\\(|storeInKV\\(" src docs
```

Expected: Only session-related KV usage remains, and no handler still references content KV persistence.

- [ ] **Step 4: Re-run the focused regression suite after the cleanup**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs tests/writeData-d1-source-items.test.mjs tests/get-content-d1.test.mjs tests/rss-d1.test.mjs tests/writeData-unknown-category.test.mjs tests/content-selection-page-ui.test.mjs`

Expected: PASS again with no regressions introduced by the cleanup or doc updates

- [ ] **Step 5: Commit the docs and final cleanup**

```bash
git add docs/DATA_FLOW.md docs/KV_KEYS.md docs/API_ROUTES.md docs/DEPLOYMENT.md
git add tests/source-items.test.mjs tests/writeData-d1-source-items.test.mjs tests/get-content-d1.test.mjs tests/rss-d1.test.mjs
git add schema.sql src/d1.js src/sourceItems.js src/handlers/writeData.js src/handlers/getContent.js src/handlers/getContentHtml.js src/handlers/genAIContent.js
git commit -m "docs: document D1-only source item storage"
```
