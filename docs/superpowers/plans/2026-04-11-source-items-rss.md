# Source-Items RSS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `/rss` so it emits recent `source_items` entries directly instead of relying on `daily_reports`.

**Architecture:** Keep `/rss` on the same route, but move its data dependency from `daily_reports` to `source_items`. Split responsibilities so D1 handles date-window queries, `sourceItems` handles row-to-RSS mapping, and the handler only assembles RSS XML.

**Tech Stack:** Cloudflare Workers, D1, plain JavaScript ES modules, Node test runner.

---

## File Map

- Modify: `src/d1.js`
  - Add a D1 query for recent `source_items` rows in a real day window.
- Modify: `src/sourceItems.js`
  - Add row -> RSS payload mapping helpers and safe field fallbacks.
- Modify: `src/handlers/getRss.js`
  - Switch `/rss` from `daily_reports` to `source_items`.
- Modify: `tests/rss-d1.test.mjs`
  - Replace D1 RSS expectations so tests assert `source_items`-based feed behavior.
- Modify: `docs/DATA_FLOW.md`
  - Update RSS data source description.
- Modify: `docs/API_ROUTES.md`
  - Update `/rss` route semantics.
- Modify: `docs/DEPLOYMENT.md`
  - Update RSS expectations for local debugging and production.

### Task 1: Lock In Source-Items RSS Behavior With Failing Tests

**Files:**
- Modify: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Write the failing tests**

Append coverage for:

```js
test('worker serves rss items directly from source_items within the recent day window', async () => {
  const env = createEnv({
    rssSourceItemResults: [
      {
        source_type: 'news',
        source_name: 'AI News',
        source_item_id: 'news-1',
        title: 'News title',
        url: 'https://example.com/news-1',
        guid: 'guid-news-1',
        description_text: 'Short summary',
        content_html: '<p>Full content</p>',
        published_at: '2026-04-10T08:00:00.000Z',
      },
    ],
  });

  const response = await worker.fetch(new Request('https://example.com/rss?days=7'), env);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(body, /News title/);
  assert.match(body, /https:\/\/example.com\/news-1/);
  assert.match(body, /Full content/);
  assert.match(body, /Short summary/);
});

test('source-items rss falls back when guid, title, description, or content are missing', async () => {
  const env = createEnv({
    rssSourceItemResults: [
      {
        source_type: 'socialMedia',
        source_name: 'X Feed',
        source_item_id: 'tweet-1',
        title: '',
        url: '',
        guid: '',
        description_text: '',
        content_html: '<p>Hello RSS</p>',
        published_at: '2026-04-10T08:00:00.000Z',
        report_date: '2026-04-10',
      },
    ],
  });

  const response = await worker.fetch(new Request('https://example.com/rss?days=7'), env);
  const body = await response.text();

  assert.match(body, /X Feed/);
  assert.match(body, /socialMedia:tweet-1/);
  assert.match(body, /Hello RSS/);
  assert.match(body, /getContentHtml\?date=2026-04-10/);
});
```

- [ ] **Step 2: Run the RSS tests to verify they fail**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs`

Expected: FAIL because `/rss` still reads `daily_reports`.

- [ ] **Step 3: Commit the failing tests only if your workflow requires it**

```bash
git add tests/rss-d1.test.mjs
git commit -m "test: cover source-items rss behavior"
```

### Task 2: Add Source-Items RSS Query And Mapping

**Files:**
- Modify: `src/d1.js`
- Modify: `src/sourceItems.js`

- [ ] **Step 1: Add a D1 query for recent source items**

Add a query shaped like:

```js
export async function listSourceItemsForRss(db, { startAt, endAt, limit }) {
  const safeLimit = Math.max(1, Number(limit) || 200);
  const result = await db.prepare(`
    SELECT
      source_type,
      source_name,
      source_item_id,
      title,
      url,
      guid,
      description_text,
      content_html,
      published_at
    FROM source_items
    WHERE published_at IS NOT NULL
      AND published_at != ''
      AND published_at >= ?
      AND published_at <= ?
    ORDER BY published_at DESC
    LIMIT ?
  `).bind(startAt, endAt, safeLimit).all();

  return result.results || [];
}
```

- [ ] **Step 2: Add row -> RSS payload mapping helpers**

Add helpers shaped like:

```js
export function getSourceItemReportDate(row) {
  if (!row?.published_at) return '';
  return formatDateToGMT8WithTime(row.published_at).replace(/\//g, '-').split(' ')[0];
}

export function mapSourceItemRowToRssItem(row, origin) {
  const title = row.title || row.source_name || row.source_type || 'Untitled';
  const reportDate = getSourceItemReportDate(row);
  const link = row.url || `${origin}/getContentHtml?date=${encodeURIComponent(reportDate)}`;
  const guid = row.guid || `${row.source_type}:${row.source_item_id}`;
  const description = row.description_text || stripHtml(row.content_html || '').slice(0, 200);
  const contentHtml = row.content_html || escapeHtml(row.description_text || '');

  return {
    title,
    link,
    guid,
    description,
    contentHtml,
    publishedAt: row.published_at,
  };
}
```

- [ ] **Step 3: Run focused tests to keep existing source-item helpers green**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-items.test.mjs tests/rss-d1.test.mjs`

Expected: RSS tests still fail only at handler wiring, while source-items tests stay green.

- [ ] **Step 4: Commit**

```bash
git add src/d1.js src/sourceItems.js tests/source-items.test.mjs tests/rss-d1.test.mjs
git commit -m "feat: add source-items rss query and mapping"
```

### Task 3: Switch `/rss` To Source Items

**Files:**
- Modify: `src/handlers/getRss.js`
- Modify: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Update `/rss` to use recent `source_items`**

Implement this shape:

```js
import { formatRssDate, getISODate } from '../utils/date.js';
import { listSourceItemsForRss } from '../d1.js';
import { getPublishedWindowBounds, mapSourceItemRowToRssItem } from '../sourceItems.js';

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
  ...
}
```

- [ ] **Step 2: Run the RSS tests to verify they pass**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs`

Expected: PASS with source-items-based feed behavior.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/getRss.js tests/rss-d1.test.mjs
git commit -m "feat: serve rss from source items"
```

### Task 4: Update Docs And Re-Verify

**Files:**
- Modify: `docs/DATA_FLOW.md`
- Modify: `docs/API_ROUTES.md`
- Modify: `docs/DEPLOYMENT.md`

- [ ] **Step 1: Update docs**

Required doc changes:

- In `docs/DATA_FLOW.md`, change RSS source from `daily_reports` to `source_items`.
- In `docs/API_ROUTES.md`, describe `/rss` as recent source-items feed, not generated daily-report feed.
- In `docs/DEPLOYMENT.md`, explain that `/rss` now works as soon as `source_items` exist; `/genAIContent` is no longer required for RSS.

- [ ] **Step 2: Run adjacent and full verification**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs tests/source-item-ingestion.test.mjs tests/writeData-d1-source-items.test.mjs tests/get-content-d1.test.mjs
```

Then run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add docs/DATA_FLOW.md docs/API_ROUTES.md docs/DEPLOYMENT.md
git commit -m "docs: update rss source-items flow"
```
