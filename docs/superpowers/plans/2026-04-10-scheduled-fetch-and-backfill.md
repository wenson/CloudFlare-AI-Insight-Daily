# Scheduled Fetch And Backfill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a daily Cloudflare Worker scheduled job that ingests the rolling last 7 days of Folo data, plus a logged-in manual backfill control for date ranges.

**Architecture:** Extract the existing `/writeData` ingestion behavior into a shared service, then reuse that service from the existing manual handler, the new Worker `scheduled()` entrypoint, and a new authenticated `/backfillData` route. Browser-triggered manual fetch keeps using the browser-local Folo cookie, while scheduled and backfill fetches use the `FOLO_COOKIE` Cloudflare secret.

**Tech Stack:** Cloudflare Workers, Wrangler cron triggers, Cloudflare D1, Cloudflare KV for login sessions, plain JavaScript ES modules, Node test runner with `tests/extension-loader.mjs`.

---

## File Structure

- Create: `src/services/sourceItemIngestion.js`
- Create: `src/handlers/backfillData.js`
- Create: `tests/source-item-ingestion.test.mjs`
- Create: `tests/scheduled-ingestion.test.mjs`
- Create: `tests/backfill-data.test.mjs`
- Modify: `src/handlers/writeData.js`
- Modify: `src/index.js`
- Modify: `src/ui/contentSelectionPage.js`
- Modify: `wrangler.toml`
- Modify: `wrangler.local.toml.example`
- Modify: `tests/writeData-d1-source-items.test.mjs`
- Modify: `tests/writeData-unknown-category.test.mjs`
- Modify: `tests/content-selection-page-ui.test.mjs`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/API_ROUTES.md`
- Modify: `docs/DATA_FLOW.md`

## Task 1: Shared Source Item Ingestion Service

**Files:**
- Create: `src/services/sourceItemIngestion.js`
- Create: `tests/source-item-ingestion.test.mjs`
- Modify: `src/handlers/writeData.js`
- Test: `tests/source-item-ingestion.test.mjs`

- [ ] **Step 1: Write failing service tests**

Create `tests/source-item-ingestion.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enumerateDateRange,
  runSourceItemIngestion,
} from '../src/services/sourceItemIngestion.js';
import { getFetchDate, setFetchDate } from '../src/helpers.js';

function createDb() {
  const state = {
    batches: [],
    runs: [],
    sql: [],
  };

  return {
    state,
    prepare(sql) {
      state.sql.push(sql);
      return {
        bind(...args) {
          const statement = {
            sql,
            args,
            async run() {
              state.runs.push({ sql, args });
              return { success: true };
            },
          };

          return statement;
        },
      };
    },
    async batch(statements) {
      state.batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function createEnv(overrides = {}) {
  return {
    DB: createDb(),
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '1',
    NEWS_AGGREGATOR_LIST_ID: 'newsList',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: 'papersList',
    HGPAPERS_FETCH_PAGES: '1',
    TWITTER_LIST_ID: 'twitterList',
    TWITTER_FETCH_PAGES: '1',
    REDDIT_LIST_ID: 'redditList',
    REDDIT_FETCH_PAGES: '1',
    ...overrides,
  };
}

function createEntry(id, publishedAt, title = id) {
  return {
    entries: {
      id,
      url: `https://example.com/${id}`,
      title,
      content: `<p>${title}</p>`,
      publishedAt,
      author: `${id}-author`,
    },
    feeds: {
      title: `${id}-feed`,
    },
  };
}

test('enumerateDateRange returns inclusive YYYY-MM-DD dates', () => {
  assert.deepEqual(enumerateDateRange('2026-04-08', '2026-04-10'), [
    '2026-04-08',
    '2026-04-09',
    '2026-04-10',
  ]);
});

test('enumerateDateRange rejects invalid and reversed ranges', () => {
  assert.throws(() => enumerateDateRange('2026-04-31', '2026-05-01'), /Invalid startDate/);
  assert.throws(() => enumerateDateRange('2026-04-10', '2026-04-08'), /startDate must be before or equal to endDate/);
});

test('runSourceItemIngestion requires foloCookie when requireFoloCookie is true', async () => {
  const env = createEnv();
  const result = await runSourceItemIngestion(env, {
    date: '2026-04-10',
    mode: 'scheduled',
    foloCookie: '',
    requireFoloCookie: true,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, 500);
  assert.match(result.message, /FOLO_COOKIE/);
  assert.equal(env.DB.state.batches.length, 0);
});

test('runSourceItemIngestion stores successful categories and reports failed categories when partial success is enabled', async () => {
  const originalFetch = global.fetch;
  const previousFetchDate = getFetchDate();
  const env = createEnv();
  const calls = [];

  global.fetch = async (_url, init = {}) => {
    const body = JSON.parse(init.body || '{}');
    calls.push({ headers: init.headers, body });

    if (body.listId === 'redditList') {
      return new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    const entryByListId = {
      newsList: createEntry('news-1', '2026-04-10T08:00:00.000Z', 'News item'),
      papersList: createEntry('paper-1', '2026-04-10T09:00:00.000Z', 'Paper item'),
      twitterList: createEntry('tweet-1', '2026-04-10T10:00:00.000Z', 'Tweet item'),
    };

    return new Response(JSON.stringify({
      data: entryByListId[body.listId] ? [entryByListId[body.listId]] : [],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    setFetchDate('2026-04-01');
    const result = await runSourceItemIngestion(env, {
      date: '2026-04-10',
      mode: 'scheduled',
      foloCookie: 'secret-cookie',
      requireFoloCookie: true,
      allowPartialSuccess: true,
    });

    assert.equal(result.success, true);
    assert.equal(result.date, '2026-04-10');
    assert.equal(result.mode, 'scheduled');
    assert.equal(result.counts.news, 1);
    assert.equal(result.counts.paper, 1);
    assert.equal(result.counts.socialMedia, 1);
    assert.match(result.errors.join('\n'), /reddit/i);
    assert.equal(env.DB.state.batches.length, 3);
    assert.equal(calls.every((call) => call.headers.Cookie === 'secret-cookie'), true);
    assert.equal(getFetchDate(), '2026-04-01');
  } finally {
    global.fetch = originalFetch;
    setFetchDate(previousFetchDate);
  }
});
```

- [ ] **Step 2: Run service tests and verify they fail**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-item-ingestion.test.mjs
```

Expected: FAIL with `Cannot find module '../src/services/sourceItemIngestion.js'`.

- [ ] **Step 3: Implement shared ingestion service**

Create `src/services/sourceItemIngestion.js`:

```javascript
import { dataSources, fetchAllData, fetchDataByCategory } from '../dataFetchers.js';
import { upsertSourceItems } from '../d1.js';
import { buildSourceItemRecord } from '../sourceItems.js';
import { getFetchDate, getISODate, setFetchDate } from '../helpers.js';

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_BACKFILL_DAYS = 31;

function isValidDateOnly(value) {
  if (!DATE_ONLY_PATTERN.test(String(value || ''))) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function addUtcDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function assertValidDb(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function' || typeof env.DB.batch !== 'function') {
    throw new Error("D1 database binding 'DB' with batch support is required for source item ingestion.");
  }
}

function createEmptyCounts() {
  return Object.keys(dataSources).reduce((counts, sourceType) => {
    counts[sourceType] = 0;
    return counts;
  }, {});
}

function buildCountFields(counts) {
  return Object.fromEntries(
    Object.entries(counts).map(([key, value]) => [`${key}ItemCount`, value]),
  );
}

function normalizeDate(date) {
  const dateStr = date || getFetchDate() || getISODate();
  if (!isValidDateOnly(dateStr)) {
    throw new Error(`Invalid ingestion date: ${dateStr}`);
  }
  return dateStr;
}

async function persistItems(env, items, dateStr) {
  const records = items.map((item) => buildSourceItemRecord(item, dateStr));
  await upsertSourceItems(env.DB, records);
  return records.length;
}

export function enumerateDateRange(startDate, endDate, maxDays = MAX_BACKFILL_DAYS) {
  if (!isValidDateOnly(startDate)) {
    throw new Error(`Invalid startDate: ${startDate}`);
  }
  if (!isValidDateOnly(endDate)) {
    throw new Error(`Invalid endDate: ${endDate}`);
  }

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
  const start = new Date(Date.UTC(startYear, startMonth - 1, startDay));
  const end = new Date(Date.UTC(endYear, endMonth - 1, endDay));

  if (start.getTime() > end.getTime()) {
    throw new Error('startDate must be before or equal to endDate.');
  }

  const dates = [];
  for (let current = start; current.getTime() <= end.getTime(); current = addUtcDays(current, 1)) {
    dates.push(formatUtcDate(current));
    if (dates.length > maxDays) {
      throw new Error(`Date range must not exceed ${maxDays} days.`);
    }
  }

  return dates;
}

export async function runSourceItemIngestion(env, {
  date,
  category = null,
  foloCookie = null,
  mode = 'manual',
  requireFoloCookie = false,
  allowPartialSuccess = false,
} = {}) {
  const dateStr = normalizeDate(date);
  const counts = createEmptyCounts();
  const errors = [];
  const previousFetchDate = getFetchDate();

  if (requireFoloCookie && !foloCookie) {
    return {
      success: false,
      status: 500,
      date: dateStr,
      mode,
      message: 'FOLO_COOKIE secret is required for scheduled ingestion and backfill.',
      counts,
      errors: ['FOLO_COOKIE secret is missing.'],
      ...buildCountFields(counts),
    };
  }

  try {
    assertValidDb(env);
    setFetchDate(dateStr);

    if (category) {
      if (!Object.hasOwn(dataSources, category)) {
        return {
          success: false,
          status: 400,
          date: dateStr,
          mode,
          message: `Unknown category: ${category}`,
          counts,
          errors: [`Unknown category: ${category}`],
          ...buildCountFields(counts),
        };
      }

      const { data, errors: categoryErrors } = await fetchDataByCategory(env, category, foloCookie);
      counts[category] = data.length;
      errors.push(...categoryErrors);

      if (categoryErrors.length === 0 || allowPartialSuccess) {
        await persistItems(env, data, dateStr);
      }

      const success = categoryErrors.length === 0 || (allowPartialSuccess && data.length > 0);
      return {
        success,
        status: success ? 200 : 502,
        date: dateStr,
        mode,
        message: success
          ? `Data for category '${category}' fetched and stored.`
          : `Failed to fetch data for category '${category}'.`,
        counts,
        errors,
        ...buildCountFields(counts),
      };
    }

    if (!allowPartialSuccess) {
      const { data, errors: fetchErrors } = await fetchAllData(env, foloCookie);
      errors.push(...fetchErrors);
      for (const sourceType of Object.keys(dataSources)) {
        counts[sourceType] = (data[sourceType] || []).length;
      }

      if (errors.length > 0) {
        return {
          success: false,
          status: 502,
          date: dateStr,
          mode,
          message: 'Failed to fetch one or more data sources.',
          counts,
          errors,
          ...buildCountFields(counts),
        };
      }

      const allItems = Object.keys(dataSources).flatMap((sourceType) => data[sourceType] || []);
      await persistItems(env, allItems, dateStr);

      return {
        success: true,
        status: 200,
        date: dateStr,
        mode,
        message: 'All data categories fetched and stored.',
        counts,
        errors,
        ...buildCountFields(counts),
      };
    }

    for (const sourceType of Object.keys(dataSources)) {
      const { data, errors: categoryErrors } = await fetchDataByCategory(env, sourceType, foloCookie);
      counts[sourceType] = data.length;
      errors.push(...categoryErrors);
      if (data.length > 0) {
        await persistItems(env, data, dateStr);
      }
    }

    const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
    const success = totalCount > 0 && errors.length < Object.keys(dataSources).length;

    return {
      success,
      status: success ? 200 : 502,
      date: dateStr,
      mode,
      message: success
        ? 'Source item ingestion completed.'
        : 'Failed to fetch all data sources.',
      counts,
      errors,
      ...buildCountFields(counts),
    };
  } catch (error) {
    return {
      success: false,
      status: 500,
      date: dateStr,
      mode,
      message: 'An unhandled error occurred during source item ingestion.',
      counts,
      errors: [error.message],
      error: error.message,
      details: error.stack,
      ...buildCountFields(counts),
    };
  } finally {
    setFetchDate(previousFetchDate);
  }
}
```

- [ ] **Step 4: Run service tests and verify they pass**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-item-ingestion.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Refactor `/writeData` handler to call the service**

Replace the core logic in `src/handlers/writeData.js` with this handler shape:

```javascript
// src/handlers/writeData.js
import { getFetchDate, getISODate } from '../helpers.js';
import { runSourceItemIngestion } from '../services/sourceItemIngestion.js';

export async function handleWriteData(request, env) {
  const dateParam = getFetchDate();
  const dateStr = dateParam ? dateParam : getISODate();
  let category = null;
  let foloCookie = null;

  try {
    if (request.headers.get('Content-Type')?.includes('application/json')) {
      const requestBody = await request.json();
      category = requestBody.category || null;
      foloCookie = requestBody.foloCookie || null;
    }

    console.log(`Starting /writeData process for date: ${dateStr}, category: ${category || 'all'}, foloCookie presence: ${!!foloCookie}`);

    const result = await runSourceItemIngestion(env, {
      date: dateStr,
      category,
      foloCookie,
      mode: 'manual',
      requireFoloCookie: false,
      allowPartialSuccess: false,
    });

    const body = {
      success: result.success,
      message: result.message,
      ...Object.fromEntries(
        Object.entries(result.counts || {}).map(([key, value]) => [`${key}ItemCount`, value]),
      ),
    };

    if (result.errors?.length) {
      body.errors = result.errors;
    }
    if (result.error) {
      body.error = result.error;
      body.details = result.details;
    }

    return new Response(JSON.stringify(body), {
      status: result.status || (result.success ? 200 : 500),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unhandled error in /writeData:', error);
    return new Response(JSON.stringify({
      success: false,
      message: 'An unhandled error occurred during data processing.',
      error: error.message,
      details: error.stack,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
```

- [ ] **Step 6: Run existing writeData tests and verify they pass**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit service extraction**

```bash
git add src/services/sourceItemIngestion.js src/handlers/writeData.js tests/source-item-ingestion.test.mjs tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs
git commit -m "refactor: extract source item ingestion service"
```

## Task 2: Scheduled Worker Ingestion

**Files:**
- Create: `tests/scheduled-ingestion.test.mjs`
- Modify: `src/index.js`
- Modify: `wrangler.toml`
- Modify: `wrangler.local.toml.example`
- Test: `tests/scheduled-ingestion.test.mjs`

- [ ] **Step 1: Write failing scheduled ingestion tests**

Create `tests/scheduled-ingestion.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function createDb() {
  const state = {
    batches: [],
    sql: [],
  };

  return {
    state,
    prepare(sql) {
      state.sql.push(sql);
      return {
        bind(...args) {
          return {
            sql,
            args,
            async run() {
              return { success: true };
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
    async batch(statements) {
      state.batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function createEnv(overrides = {}) {
  return {
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
    DB: createDb(),
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_API_URL: 'https://example.com/gemini',
    DEFAULT_GEMINI_MODEL: 'gemini-model',
    OPEN_TRANSLATE: 'true',
    USE_MODEL_PLATFORM: 'GEMINI',
    LOGIN_USERNAME: 'root',
    LOGIN_PASSWORD: 'toor',
    PODCAST_TITLE: 'podcast',
    PODCAST_BEGIN: 'begin',
    PODCAST_END: 'end',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    FOLO_COOKIE: 'scheduled-cookie',
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '7',
    NEWS_AGGREGATOR_LIST_ID: 'newsList',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: '',
    TWITTER_LIST_ID: '',
    REDDIT_LIST_ID: '',
    ...overrides,
  };
}

test('scheduled ingestion reads FOLO_COOKIE and writes source_items without writing daily_reports', async () => {
  const originalFetch = global.fetch;
  const env = createEnv();
  const waitUntilPromises = [];
  const fetchCalls = [];

  global.fetch = async (_url, init = {}) => {
    fetchCalls.push(init);
    return new Response(JSON.stringify({
      data: [{
        entries: {
          id: 'news-1',
          url: 'https://example.com/news-1',
          title: 'Scheduled item',
          content: '<p>Scheduled body</p>',
          publishedAt: '2026-04-10T08:00:00.000Z',
          author: 'scheduled-author',
        },
        feeds: {
          title: 'Scheduled Feed',
        },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    await worker.scheduled({
      scheduledTime: Date.parse('2026-04-10T00:10:00.000Z'),
      cron: '10 0 * * *',
    }, env, {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    await Promise.all(waitUntilPromises);

    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].headers.Cookie, 'scheduled-cookie');
    assert.equal(env.DB.state.batches.length, 1);
    assert.match(env.DB.state.batches[0][0].sql, /INSERT INTO source_items/);
    assert.doesNotMatch(env.DB.state.sql.join('\n'), /daily_reports/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('scheduled ingestion reports missing FOLO_COOKIE without fetching upstream', async () => {
  const originalFetch = global.fetch;
  const env = createEnv({ FOLO_COOKIE: '' });
  let fetchCalls = 0;
  const waitUntilPromises = [];

  global.fetch = async () => {
    fetchCalls += 1;
    return new Response('{}');
  };

  try {
    await worker.scheduled({
      scheduledTime: Date.parse('2026-04-10T00:10:00.000Z'),
      cron: '10 0 * * *',
    }, env, {
      waitUntil(promise) {
        waitUntilPromises.push(promise);
      },
    });
    await Promise.all(waitUntilPromises);

    assert.equal(fetchCalls, 0);
    assert.equal(env.DB.state.batches.length, 0);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run scheduled tests and verify they fail**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/scheduled-ingestion.test.mjs
```

Expected: FAIL because `worker.scheduled` is not defined.

- [ ] **Step 3: Add scheduled helper and Worker scheduled entry**

Modify `src/index.js`:

```javascript
import { getISODate } from './helpers.js';
import { runSourceItemIngestion } from './services/sourceItemIngestion.js';
```

Add this helper above `export default`:

```javascript
async function runScheduledSourceItemIngestion(controller, env) {
  const scheduledDate = controller?.scheduledTime
    ? getISODate(new Date(controller.scheduledTime))
    : getISODate();

  const result = await runSourceItemIngestion(env, {
    date: scheduledDate,
    mode: 'scheduled',
    foloCookie: env.FOLO_COOKIE,
    requireFoloCookie: true,
    allowPartialSuccess: true,
  });

  const logPayload = JSON.stringify({
    event: 'scheduled-source-item-ingestion',
    cron: controller?.cron || null,
    date: result.date,
    success: result.success,
    counts: result.counts,
    errors: result.errors,
  });

  if (result.success) {
    console.log(logPayload);
    return result;
  }

  console.error(logPayload);
  return result;
}
```

Add `scheduled()` to the default export next to `fetch`:

```javascript
export default {
  async scheduled(controller, env, ctx) {
    const promise = runScheduledSourceItemIngestion(controller, env);
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
      return;
    }
    await promise;
  },

  async fetch(request, env) {
    // existing fetch body
  },
};
```

- [ ] **Step 4: Add Wrangler cron trigger**

Modify `wrangler.toml` and `wrangler.local.toml.example`:

```toml
[triggers]
crons = ["10 0 * * *"]
```

Do not add `FOLO_COOKIE` to `[vars]`.

- [ ] **Step 5: Run scheduled tests and verify they pass**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/scheduled-ingestion.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Run index smoke tests**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/index-no-github-runtime.test.mjs tests/rss-d1.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit scheduled ingestion**

```bash
git add src/index.js wrangler.toml wrangler.local.toml.example tests/scheduled-ingestion.test.mjs
git commit -m "feat: add scheduled source item ingestion"
```

## Task 3: Authenticated Backfill Handler

**Files:**
- Create: `src/handlers/backfillData.js`
- Create: `tests/backfill-data.test.mjs`
- Modify: `src/index.js`
- Test: `tests/backfill-data.test.mjs`

- [ ] **Step 1: Write failing backfill tests**

Create `tests/backfill-data.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { handleBackfillData } from '../src/handlers/backfillData.js';

function createDb() {
  const state = {
    batches: [],
  };

  return {
    state,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,
            args,
            async run() {
              return { success: true };
            },
            async all() {
              return { results: [] };
            },
            async first() {
              return null;
            },
          };
        },
      };
    },
    async batch(statements) {
      state.batches.push(statements);
      return statements.map(() => ({ success: true }));
    },
  };
}

function createEnv(overrides = {}) {
  return {
    DATA_KV: {
      async get(key) {
        return key === 'session:valid-session' ? 'valid' : null;
      },
      async put() {},
      async delete() {},
    },
    DB: createDb(),
    GEMINI_API_KEY: 'gemini-key',
    GEMINI_API_URL: 'https://example.com/gemini',
    DEFAULT_GEMINI_MODEL: 'gemini-model',
    OPEN_TRANSLATE: 'true',
    USE_MODEL_PLATFORM: 'GEMINI',
    LOGIN_USERNAME: 'root',
    LOGIN_PASSWORD: 'toor',
    PODCAST_TITLE: 'podcast',
    PODCAST_BEGIN: 'begin',
    PODCAST_END: 'end',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    FOLO_COOKIE: 'backfill-cookie',
    FOLO_DATA_API: 'https://api.follow.is/entries',
    FOLO_FILTER_DAYS: '7',
    NEWS_AGGREGATOR_LIST_ID: 'newsList',
    NEWS_AGGREGATOR_FETCH_PAGES: '1',
    HGPAPERS_LIST_ID: '',
    TWITTER_LIST_ID: '',
    REDDIT_LIST_ID: '',
    ...overrides,
  };
}

function createJsonRequest(body) {
  return new Request('https://example.com/backfillData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('handleBackfillData rejects invalid date format', async () => {
  const response = await handleBackfillData(createJsonRequest({
    startDate: '2026/04/10',
    endDate: '2026-04-10',
  }), createEnv());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /Invalid startDate/);
});

test('handleBackfillData rejects reversed ranges', async () => {
  const response = await handleBackfillData(createJsonRequest({
    startDate: '2026-04-10',
    endDate: '2026-04-08',
  }), createEnv());
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /startDate must be before or equal to endDate/);
});

test('handleBackfillData runs each date independently and returns a summary', async () => {
  const originalFetch = global.fetch;
  const env = createEnv();
  const upstreamBodies = [];

  global.fetch = async (_url, init = {}) => {
    const requestBody = JSON.parse(init.body || '{}');
    upstreamBodies.push(requestBody);
    return new Response(JSON.stringify({
      data: [{
        entries: {
          id: `news-${upstreamBodies.length}`,
          url: `https://example.com/news-${upstreamBodies.length}`,
          title: `Backfill item ${upstreamBodies.length}`,
          content: '<p>Backfill body</p>',
          publishedAt: '2026-04-10T08:00:00.000Z',
          author: 'backfill-author',
        },
        feeds: {
          title: 'Backfill Feed',
        },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const response = await handleBackfillData(createJsonRequest({
      startDate: '2026-04-08',
      endDate: '2026-04-09',
    }), env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.summary.totalDays, 2);
    assert.equal(body.summary.successDays, 2);
    assert.equal(body.results.length, 2);
    assert.deepEqual(body.results.map((result) => result.date), ['2026-04-08', '2026-04-09']);
    assert.equal(env.DB.state.batches.length, 2);
    assert.equal(upstreamBodies.length, 2);
  } finally {
    global.fetch = originalFetch;
  }
});

test('worker redirects unauthenticated backfill requests to login', async () => {
  const response = await worker.fetch(createJsonRequest({
    startDate: '2026-04-08',
    endDate: '2026-04-08',
  }), createEnv({
    DATA_KV: {
      async get() {
        return null;
      },
      async put() {},
      async delete() {},
    },
  }));

  assert.equal(response.status, 302);
  assert.match(response.headers.get('location') || '', /\/login/);
});

test('worker allows authenticated backfill requests', async () => {
  const originalFetch = global.fetch;
  const env = createEnv();

  global.fetch = async () => new Response(JSON.stringify({
    data: [{
      entries: {
        id: 'news-auth',
        url: 'https://example.com/news-auth',
        title: 'Authenticated backfill',
        content: '<p>body</p>',
        publishedAt: '2026-04-08T08:00:00.000Z',
        author: 'author',
      },
      feeds: { title: 'Feed' },
    }],
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const request = new Request('https://example.com/backfillData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session_id_89757=valid-session',
      },
      body: JSON.stringify({
        startDate: '2026-04-08',
        endDate: '2026-04-08',
      }),
    });

    const response = await worker.fetch(request, env);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.summary.totalDays, 1);
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run backfill tests and verify they fail**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/backfill-data.test.mjs
```

Expected: FAIL because `src/handlers/backfillData.js` does not exist.

- [ ] **Step 3: Implement backfill handler**

Create `src/handlers/backfillData.js`:

```javascript
import {
  enumerateDateRange,
  MAX_BACKFILL_DAYS,
  runSourceItemIngestion,
} from '../services/sourceItemIngestion.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function summarizeResults(results) {
  const totalDays = results.length;
  const successDays = results.filter((result) => result.success && result.errors.length === 0).length;
  const partialFailureDays = results.filter((result) => result.success && result.errors.length > 0).length;
  const failedDays = results.filter((result) => !result.success).length;

  return {
    totalDays,
    successDays,
    partialFailureDays,
    failedDays,
  };
}

export async function handleBackfillData(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse({
      success: false,
      message: 'Method Not Allowed',
    }, 405);
  }

  let requestBody;
  try {
    requestBody = await request.json();
  } catch {
    return jsonResponse({
      success: false,
      message: 'Request body must be valid JSON.',
    }, 400);
  }

  let dates;
  try {
    dates = enumerateDateRange(requestBody.startDate, requestBody.endDate, MAX_BACKFILL_DAYS);
  } catch (error) {
    return jsonResponse({
      success: false,
      message: error.message,
    }, 400);
  }

  if (!env.FOLO_COOKIE) {
    return jsonResponse({
      success: false,
      message: 'FOLO_COOKIE secret is required for backfill.',
    }, 500);
  }

  const results = [];
  for (const date of dates) {
    const result = await runSourceItemIngestion(env, {
      date,
      mode: 'backfill',
      foloCookie: env.FOLO_COOKIE,
      requireFoloCookie: true,
      allowPartialSuccess: true,
    });
    results.push({
      success: result.success,
      date: result.date,
      mode: result.mode,
      message: result.message,
      counts: result.counts,
      errors: result.errors || [],
    });
  }

  const summary = summarizeResults(results);
  return jsonResponse({
    success: summary.failedDays === 0,
    message: summary.failedDays === 0
      ? `Backfill completed for ${summary.totalDays} day(s).`
      : `Backfill completed with ${summary.failedDays} failed day(s).`,
    summary,
    results,
  }, summary.failedDays === dates.length ? 502 : 200);
}
```

- [ ] **Step 4: Wire `/backfillData` into authenticated routing**

Modify imports in `src/index.js`:

```javascript
import { handleBackfillData } from './handlers/backfillData.js';
```

Add this route inside the authenticated routing block:

```javascript
} else if (path === '/backfillData' && request.method === 'POST') {
    response = await handleBackfillData(request, env);
```

Do not add `/backfillData` before the authentication check.

- [ ] **Step 5: Run backfill tests and verify they pass**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/backfill-data.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit backfill route**

```bash
git add src/handlers/backfillData.js src/index.js tests/backfill-data.test.mjs
git commit -m "feat: add authenticated source item backfill"
```

## Task 4: Backfill UI In Content Workspace

**Files:**
- Modify: `src/ui/contentSelectionPage.js`
- Modify: `tests/content-selection-page-ui.test.mjs`
- Test: `tests/content-selection-page-ui.test.mjs`

- [ ] **Step 1: Write failing UI test**

Append to `tests/content-selection-page-ui.test.mjs`:

```javascript
test('content selection page renders logged-in backfill controls', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
    {
      todayDate: '2026-04-10',
      archiveDays: [],
    },
  );

  assert.match(html, /data-backfill-panel/);
  assert.match(html, /id="backfillStartDate"/);
  assert.match(html, /id="backfillEndDate"/);
  assert.match(html, /data-run-backfill/);
  assert.match(html, /fetch\('\/backfillData'/);
  assert.match(html, /Backfill/);
});
```

- [ ] **Step 2: Run UI test and verify it fails**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/content-selection-page-ui.test.mjs
```

Expected: FAIL because the page does not render `data-backfill-panel`.

- [ ] **Step 3: Add backfill card markup**

In `src/ui/contentSelectionPage.js`, add this section near the cookie panel or inside the sidebar after the archive card:

```javascript
            <section class="backfill-card card" data-backfill-panel aria-label="Backfill 补数">
              <div class="selection-sidebar-header">
                <h2>Backfill 补数</h2>
                <p>使用 Worker secret 中的 Folo Cookie 回填指定日期区间。</p>
              </div>
              <label class="cookie-field" for="backfillStartDate">开始日期</label>
              <input id="backfillStartDate" type="date" value="${safeDateStr}">
              <label class="cookie-field" for="backfillEndDate">结束日期</label>
              <input id="backfillEndDate" type="date" value="${safeDateStr}">
              <div class="cookie-actions">
                <button type="button" class="button button-secondary" data-run-backfill>开始补数</button>
              </div>
              <p class="cookie-help" data-backfill-result>补数只写入 source_items，不会自动生成日报。</p>
            </section>
```

Keep it outside controls that submit `/genAIContent`.

- [ ] **Step 4: Add front-end backfill controller**

In the inline script, define these nodes near other `const` declarations:

```javascript
      const backfillStartDateInput = root.querySelector('#backfillStartDate');
      const backfillEndDateInput = root.querySelector('#backfillEndDate');
      const runBackfillButton = root.querySelector('[data-run-backfill]');
      const backfillResultNode = root.querySelector('[data-backfill-result]');
```

Add this function near `fetchLatest`:

```javascript
      function summarizeBackfill(payload) {
        const summary = payload?.summary || {};
        return '补数完成：'
          + (Number(summary.successDays) || 0) + ' 天成功，'
          + (Number(summary.partialFailureDays) || 0) + ' 天部分失败，'
          + (Number(summary.failedDays) || 0) + ' 天失败';
      }

      async function runBackfill() {
        if (!runBackfillButton || !backfillStartDateInput || !backfillEndDateInput) return;

        const originalText = runBackfillButton.textContent;
        const startDate = backfillStartDateInput.value;
        const endDate = backfillEndDateInput.value;

        if (!startDate || !endDate) {
          showToast('请选择补数开始日期和结束日期', 'error');
          return;
        }

        runBackfillButton.disabled = true;
        runBackfillButton.textContent = '补数中...';
        if (backfillResultNode) {
          backfillResultNode.textContent = '补数任务执行中，请稍候。';
        }

        try {
          const response = await fetch('/backfillData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate, endDate }),
          });
          const payload = await response.json().catch(() => null);

          if (!response.ok) {
            const message = payload?.message || '补数失败，请稍后重试';
            showToast(message, 'error');
            if (backfillResultNode) {
              backfillResultNode.textContent = message;
            }
            return;
          }

          const summary = summarizeBackfill(payload);
          showToast(summary);
          if (backfillResultNode) {
            backfillResultNode.textContent = summary;
          }
        } catch (error) {
          const message = error?.message || '补数失败，请检查网络';
          showToast(message, 'error');
          if (backfillResultNode) {
            backfillResultNode.textContent = message;
          }
        } finally {
          runBackfillButton.disabled = false;
          runBackfillButton.textContent = originalText;
        }
      }
```

Add this listener near other direct button listeners:

```javascript
      runBackfillButton?.addEventListener('click', runBackfill);
```

- [ ] **Step 5: Run UI tests and verify they pass**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/content-selection-page-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit backfill UI**

```bash
git add src/ui/contentSelectionPage.js tests/content-selection-page-ui.test.mjs
git commit -m "feat: add backfill controls to content workspace"
```

## Task 5: Documentation Updates

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `docs/API_ROUTES.md`
- Modify: `docs/DATA_FLOW.md`
- Test: documentation grep checks

- [ ] **Step 1: Update deployment documentation**

Modify `docs/DEPLOYMENT.md` to add `FOLO_COOKIE` under sensitive variables:

```markdown
npx wrangler secret put FOLO_COOKIE
```

Add this note to the Folo section:

```markdown
- 浏览器页面里的 Folo Cookie 仍保存在 `localStorage`，只服务手动 `/writeData` 抓取。
- 定时任务和登录后 backfill 不读取浏览器本地存储，统一读取 Cloudflare secret `FOLO_COOKIE`。
```

Add this cron note near deployment:

```markdown
当前 `wrangler.toml` 配置了每天 `10 0 * * *` UTC 的 Worker cron，对应北京时间每天 `08:10`。该任务只抓取并 upsert 最近 7 天的 `source_items`，不会自动生成日报。
```

- [ ] **Step 2: Update route documentation**

Modify `docs/API_ROUTES.md`:

```markdown
| `/backfillData` | `POST` | 登录后按日期区间手动补数 | 读取 secret `FOLO_COOKIE`，upsert D1 `source_items` |
```

Add a short scheduled section:

```markdown
### 5. 定时抓取

Worker `scheduled()` 每天执行一次滚动 7 天抓取。它读取 secret `FOLO_COOKIE`，复用源数据抓取服务，并只写入 D1 `source_items`。
```

- [ ] **Step 3: Update data flow documentation**

Modify `docs/DATA_FLOW.md` to distinguish two cookie flows:

```markdown
- 浏览器手动抓取：页面从 `localStorage` 读取 Folo Cookie，并在 POST `/writeData` 时放入请求体。
- Worker 自动抓取：`scheduled()` 与 `/backfillData` 从 Cloudflare secret `FOLO_COOKIE` 读取凭证。
```

Add `scheduled()` and `/backfillData` to the flow narrative.

- [ ] **Step 4: Run documentation checks**

Run:

```bash
rg -n "FOLO_COOKIE|backfillData|scheduled\\(\\)|10 0 \\* \\* \\*" docs wrangler.toml
```

Expected: output includes `docs/DEPLOYMENT.md`, `docs/API_ROUTES.md`, `docs/DATA_FLOW.md`, the spec, this plan, and `wrangler.toml`.

- [ ] **Step 5: Commit documentation updates**

```bash
git add docs/DEPLOYMENT.md docs/API_ROUTES.md docs/DATA_FLOW.md
git commit -m "docs: document scheduled ingestion and backfill"
```

## Task 6: Final Verification And Regression

**Files:**
- Test: all changed and adjacent tests
- Test: Wrangler dry-run

- [ ] **Step 1: Run focused test suite**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test \
  tests/source-item-ingestion.test.mjs \
  tests/scheduled-ingestion.test.mjs \
  tests/backfill-data.test.mjs \
  tests/writeData-d1-source-items.test.mjs \
  tests/writeData-unknown-category.test.mjs \
  tests/content-selection-page-ui.test.mjs \
  tests/index-no-github-runtime.test.mjs \
  tests/rss-d1.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run the full Node test suite**

Run:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run Wrangler dry-run**

Run:

```bash
npx --yes wrangler@4.11.1 deploy --dry-run
```

Expected: dry-run completes without module or config errors.

- [ ] **Step 4: Check secret setup instructions are actionable**

Run:

```bash
rg -n "npx wrangler secret put FOLO_COOKIE|FOLO_COOKIE secret|backfill" docs/DEPLOYMENT.md docs/API_ROUTES.md docs/DATA_FLOW.md
```

Expected: all three docs mention the new behavior clearly.

- [ ] **Step 5: Inspect git diff**

Run:

```bash
git diff --stat HEAD
git diff --check
```

Expected: `git diff --check` has no whitespace errors.

- [ ] **Step 6: Final commit if Task 6 required fixups**

Only commit if Task 6 required changes:

```bash
git add .
git commit -m "test: verify scheduled ingestion and backfill"
```

## Plan Self-Review

- Spec coverage: This plan covers scheduled ingestion, `FOLO_COOKIE`, backfill UI, authenticated route, partial failure handling, docs, and regression testing.
- Placeholder scan: No implementation step relies on unspecified behavior; all new files and commands are named exactly.
- Type consistency: The plan consistently uses `runSourceItemIngestion`, `enumerateDateRange`, `FOLO_COOKIE`, `/backfillData`, `source_items`, and `scheduled()`.
- Scope check: The plan does not implement webhook receiving or automatic daily report generation.
