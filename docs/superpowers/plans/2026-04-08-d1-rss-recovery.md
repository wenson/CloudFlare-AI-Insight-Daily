# D1 RSS Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore RSS output without GitHub by persisting generated daily reports and RSS summaries in Cloudflare D1, then serving `/rss` directly from D1.

**Architecture:** Keep KV for fetched source data and auth sessions, add D1 as the storage layer for generated report artifacts, and make `/genAIContent` auto-publish by upserting the same-day record after both daily markdown and RSS summary generation succeed. Reintroduce `/rss` as a read-only route backed by D1, with no GitHub runtime dependencies.

**Tech Stack:** Cloudflare Workers, Cloudflare KV, Cloudflare D1, plain JavaScript modules, Node test runner, Wrangler TOML

---

## File map

- Create: `src/d1.js`
- Create: `src/handlers/getRss.js`
- Create: `schema.sql`
- Create: `tests/rss-d1.test.mjs`
- Modify: `src/index.js`
- Modify: `src/handlers/genAIContent.js`
- Modify: `wrangler.toml`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DATA_FLOW.md`
- Modify: `docs/KV_KEYS.md`
- Modify: `docs/API_ROUTES.md`

### Task 1: Lock in D1-backed RSS behavior with failing tests

**Files:**
- Create: `tests/rss-d1.test.mjs`
- Test: `tests/index-no-github-runtime.test.mjs`

- [ ] **Step 1: Write the failing tests**

Add tests covering:

```js
test('worker exposes rss when D1 is configured', async () => {
  const env = createEnvWithDb();
  const response = await worker.fetch(new Request('https://example.com/rss'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<rss version="2.0"/);
});

test('genAIContent upserts daily report and rss summary into D1', async () => {
  // Mock D1 prepare/bind/run chain and Chat API outputs
  // Assert INSERT/UPSERT receives daily_markdown, rss_markdown, rss_html
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs tests/index-no-github-runtime.test.mjs
```

Expected: failures because `/rss` is not yet wired back and no D1 persistence exists.

### Task 2: Add D1 helper and schema

**Files:**
- Create: `src/d1.js`
- Create: `schema.sql`
- Test: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Add the D1 helper**

Create `src/d1.js` with helpers for reading and upserting report records:

```js
export async function upsertDailyReport(db, report) {
  return db.prepare(`
    INSERT INTO daily_reports (
      report_date, title, daily_markdown, rss_markdown, rss_html,
      source_item_count, created_at, updated_at, published_at
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
```

- [ ] **Step 2: Add the schema file**

Create `schema.sql`:

```sql
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
```

- [ ] **Step 3: Run targeted tests**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs
```

Expected: helper-level tests still fail only on route/persistence integration, not missing modules.

### Task 3: Reintroduce `/rss` backed by D1

**Files:**
- Create: `src/handlers/getRss.js`
- Modify: `src/index.js`
- Test: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Add the RSS handler**

Create `src/handlers/getRss.js`:

```js
import { formatRssDate, stripHtml } from '../helpers.js';
import { listDailyReports } from '../d1.js';

export async function handleRss(request, env) {
  const url = new URL(request.url);
  const days = parseInt(url.searchParams.get('days') || '7', 10);
  const reports = await listDailyReports(env.DB, days);

  const items = reports.map((item) => `
    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${url.origin}/getContentHtml?date=${item.report_date}</link>
      <guid>${item.report_date}</guid>
      <pubDate>${formatRssDate(new Date(item.published_at))}</pubDate>
      <content:encoded><![CDATA[${item.rss_html}]]></content:encoded>
      <description><![CDATA[${stripHtml(item.rss_html).substring(0, 200)}]]></description>
    </item>
  `).join('');

  return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>AI洞察日报 RSS Feed</title>
    <link>${url.origin}</link>
    <description>最近 ${days} 天的 AI 日报摘要</description>
    <language>zh-cn</language>
    <lastBuildDate>${formatRssDate(new Date())}</lastBuildDate>
    ${items}
  </channel>
</rss>`, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
```

- [ ] **Step 2: Wire the route and required binding**

Update `src/index.js` so that:

```js
import { handleRss } from './handlers/getRss.js';
```

`getRequiredEnvVars(env)` includes `DB`, and the public route block restores:

```js
} else if (path.startsWith('/rss') && request.method === 'GET') {
  return await handleRss(request, env);
}
```

- [ ] **Step 3: Run route tests**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs tests/index-no-github-runtime.test.mjs
```

Expected: `/rss` tests pass; any remaining failures are about missing D1 persistence from `/genAIContent`.

### Task 4: Persist daily and RSS content after generation

**Files:**
- Modify: `src/handlers/genAIContent.js`
- Modify: `tests/rss-d1.test.mjs`

- [ ] **Step 1: Add RSS summary generation helper logic**

In `src/handlers/genAIContent.js`, import:

```js
import { marked } from '../marked.esm.js';
import { getSummarizationSimplifyPrompt } from '../prompt/summarizationSimplifyPrompt.js';
import { upsertDailyReport } from '../d1.js';
import { formatMarkdownText, getISODate, escapeHtml, stripHtml, removeMarkdownCodeBlock, formatDateToChinese, convertEnglishQuotesToChinese } from '../helpers.js';
import { getAppUrl } from '../appUrl.js';
import { callChatAPI, callChatAPIStream } from '../chatapi.js';
```

Then add a helper:

```js
async function generateRssSummary(env, dailyMarkdownContent) {
  let summary = await callChatAPI(env, dailyMarkdownContent, getSummarizationSimplifyPrompt());
  summary = removeMarkdownCodeBlock(summary);
  summary += `\n\n</br>${getAppUrl()}`;
  return {
    rssMarkdown: summary,
    rssHtml: marked.parse(formatMarkdownText(summary)),
  };
}
```

- [ ] **Step 2: Upsert D1 after both outputs are ready**

After `dailySummaryMarkdownContent` is finalized, add:

```js
const now = new Date().toISOString();
const { rssMarkdown, rssHtml } = await generateRssSummary(env, dailySummaryMarkdownContent);

await upsertDailyReport(env.DB, {
  report_date: dateStr,
  title: `${dateStr}日刊`,
  daily_markdown: convertEnglishQuotesToChinese(dailySummaryMarkdownContent),
  rss_markdown: convertEnglishQuotesToChinese(rssMarkdown),
  rss_html: rssHtml,
  source_item_count: selectedItemsParams.length,
  created_at: now,
  updated_at: now,
  published_at: now,
});
```

Keep the write after generation success and before returning HTML.

- [ ] **Step 3: Run tests**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/rss-d1.test.mjs
```

Expected: D1 upsert test passes.

### Task 5: Add deployment config and docs

**Files:**
- Modify: `wrangler.toml`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/DATA_FLOW.md`
- Modify: `docs/KV_KEYS.md`
- Modify: `docs/API_ROUTES.md`

- [ ] **Step 1: Add D1 binding to Wrangler config**

Update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-daily"
database_id = "replace-with-your-d1-database-id"
```

- [ ] **Step 2: Update deployment docs**

Document:

- D1 creation
- applying `schema.sql`
- `DB` binding requirement
- `/genAIContent` auto-publishes to D1
- `/rss` now reads D1

- [ ] **Step 3: Update data flow and storage docs**

Adjust docs to reflect:

- KV stores fetched source data and sessions
- D1 stores generated report outputs
- `/rss` is sourced from D1, not KV report keys or GitHub

### Task 6: Final verification

**Files:**
- Verify entire working tree

- [ ] **Step 1: Run all targeted tests**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/index-no-github-runtime.test.mjs tests/writeData-unknown-category.test.mjs tests/rss-d1.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run Wrangler dry-run**

Run:

```bash
npx --yes wrangler@4.11.1 deploy --dry-run
```

Expected: build succeeds and output shows both `DATA_KV` and `DB` bindings.

- [ ] **Step 3: Check for forbidden GitHub runtime references**

Run:

```bash
find README.md wrangler.toml src docs \( -path 'docs/superpowers' -o -path 'docs/superpowers/*' \) -prune -o -type f -print0 | xargs -0 grep -nE "GITHUB_TOKEN|GITHUB_REPO_OWNER|GITHUB_REPO_NAME|GITHUB_BRANCH|commitToGitHub|generateRssContent|writeRssData|GitHub Pages" || true
```

Expected: no runtime/config references remain; only design-history docs under `docs/superpowers` may still mention them.
