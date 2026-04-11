# Maintainability High-Impact Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three high-risk maintenance hazards first: broken HTML escaping, mutable request date state, and an untested Gemini streaming error path.

**Architecture:** Keep the current Worker/D1 routing and data flow intact while tightening shared helpers and failure handling. The first wave should favor small, test-backed edits in shared modules over broad refactors so we reduce risk quickly without destabilizing content ingestion or UI rendering.

**Tech Stack:** Cloudflare Workers, plain JavaScript ES modules, Node test runner, D1/KV-backed Worker runtime.

---

## File Map

- Modify: `src/helpers.js`
  - Fix shared HTML escaping and remove mutable request-date dependence from active runtime paths.
- Modify: `src/handlers/getContentHtml.js`
  - Stop mutating shared request date state during page rendering.
- Modify: `src/handlers/writeData.js`
  - Use explicit request/environment date resolution instead of global mutable state.
- Modify: `src/services/sourceItemIngestion.js`
  - Resolve fetch dates from explicit inputs and env-scoped overrides only.
- Modify: `src/dataSources/newsAggregator.js`
  - Remove fallback dependence on shared mutable date state.
- Modify: `src/chatapi.js`
  - Fix Gemini streaming error parsing and add a stable seam for stream-failure verification.
- Create: `tests/helpers.test.mjs`
  - Regression coverage for shared escaping behavior.
- Modify: `tests/source-item-ingestion.test.mjs`
  - Prove ingestion uses explicit request/env dates, not process-global mutable state.
- Modify: `tests/writeData-d1-source-items.test.mjs`
  - Prove `/writeData` date resolution works without shared helper mutation.
- Modify: `tests/writeData-unknown-category.test.mjs`
  - Keep unknown-category coverage aligned with explicit date resolution.
- Modify: `tests/news-aggregator-pagination.test.mjs`
  - Prove pagination boundaries follow env-scoped request dates instead of global state.
- Modify: `tests/news-aggregator-description-fallback.test.mjs`
  - Keep source-data fallback coverage aligned with explicit date resolution.
- Create: `tests/chatapi.test.mjs`
  - Regression coverage for Gemini streaming non-200 responses.
- Follow-up Modify: `.github/workflows/*` or create a new test workflow in a later pass
  - Not part of the first implementation wave, but explicitly queued after the three fixes land.

### Task 1: Fix Shared HTML Escaping

**Files:**
- Modify: `src/helpers.js`
- Create: `tests/helpers.test.mjs`

- [ ] **Step 1: Write the failing helper test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/helpers.js';

test('escapeHtml encodes HTML-sensitive characters', () => {
  assert.equal(
    escapeHtml(`Tom & "<Jerry>" 'Spike'`),
    'Tom &amp; &quot;&lt;Jerry&gt;&quot; &#039;Spike&#039;',
  );
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/helpers.test.mjs`
Expected: FAIL because `escapeHtml()` currently returns raw `&`, `<`, `>`, and `"` values.

- [ ] **Step 3: Write the minimal helper fix**

```js
export function escapeHtml(unsafe) {
  if (unsafe === null || typeof unsafe === 'undefined') {
    return '';
  }

  const str = String(unsafe);
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };

  return str.replace(/[&<>"']/g, (char) => map[char]);
}
```

- [ ] **Step 4: Run the helper test to verify it passes**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/helpers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers.test.mjs src/helpers.js
git commit -m "fix: correct shared html escaping"
```

### Task 2: Remove Active Runtime Dependence on Mutable Request Date State

**Files:**
- Modify: `src/helpers.js`
- Modify: `src/handlers/getContentHtml.js`
- Modify: `src/handlers/writeData.js`
- Modify: `src/services/sourceItemIngestion.js`
- Modify: `src/dataSources/newsAggregator.js`
- Modify: `tests/source-item-ingestion.test.mjs`
- Modify: `tests/writeData-d1-source-items.test.mjs`
- Modify: `tests/writeData-unknown-category.test.mjs`
- Modify: `tests/news-aggregator-pagination.test.mjs`
- Modify: `tests/news-aggregator-description-fallback.test.mjs`

- [ ] **Step 1: Write the failing ingestion/runtime tests**

Add test coverage that proves:

```js
test('runSourceItemIngestion uses the explicit date argument instead of helper global state', async () => {
  const env = createEnv();
  env.SOURCE_ITEM_FETCH_DATE = '1999-01-01';

  // global helper state intentionally set to a conflicting date
  setFetchDate('2026-04-01');

  const result = await runSourceItemIngestion(env, {
    date: '2026-04-10',
    mode: 'scheduled',
    foloCookie: 'secret-cookie',
    requireFoloCookie: true,
    allowPartialSuccess: true,
  });

  assert.equal(result.date, '2026-04-10');
  assert.equal(seenReferenceDates.every((value) => value === '2026-04-10'), true);
});

test('/writeData resolves request date without mutating shared helper state', async () => {
  const env = createEnv();
  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: '2026-04-08' }),
  });

  const response = await handleWriteData(request, env);
  assert.equal(response.status, 200);
  assert.equal(seenReferenceDates.every((value) => value === '2026-04-08'), true);
});
```

- [ ] **Step 2: Run the focused date tests to verify they fail**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-item-ingestion.test.mjs tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs tests/news-aggregator-pagination.test.mjs tests/news-aggregator-description-fallback.test.mjs`
Expected: FAIL because active code still reads or mutates helper-level `fetchDate`.

- [ ] **Step 3: Write the minimal runtime fix**

Key changes:

```js
// src/helpers.js
export function getSourceItemFetchDate(env, fallbackDate = getISODate()) {
  return env?.SOURCE_ITEM_FETCH_DATE ?? fallbackDate;
}

// src/services/sourceItemIngestion.js
const requestedDate = date ?? getSourceItemFetchDate(env, formatDateAsString(new Date()));
const fetchEnv = { ...env, SOURCE_ITEM_FETCH_DATE: requestedDate };

// src/handlers/writeData.js
const requestBody = await request.json();
const requestedDate = typeof requestBody.date === 'string' && requestBody.date ? requestBody.date : null;
const dateStr = requestedDate || env?.SOURCE_ITEM_FETCH_DATE || getISODate();

// src/handlers/getContentHtml.js
// remove setFetchDate(dateStr)

// src/dataSources/newsAggregator.js
function getPublishedBeforeBoundary(filterDays, referenceDate) {
  const targetDate = referenceDate;
  const [year, month, day] = targetDate.split('-').map(Number);
  ...
}
```

- [ ] **Step 4: Run the focused date tests to verify they pass**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/source-item-ingestion.test.mjs tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs tests/news-aggregator-pagination.test.mjs tests/news-aggregator-description-fallback.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/helpers.js src/handlers/getContentHtml.js src/handlers/writeData.js src/services/sourceItemIngestion.js src/dataSources/newsAggregator.js tests/source-item-ingestion.test.mjs tests/writeData-d1-source-items.test.mjs tests/writeData-unknown-category.test.mjs tests/news-aggregator-pagination.test.mjs tests/news-aggregator-description-fallback.test.mjs
git commit -m "fix: remove mutable fetch date from active runtime paths"
```

### Task 3: Harden Gemini Streaming Error Handling

**Files:**
- Modify: `src/chatapi.js`
- Create: `tests/chatapi.test.mjs`

- [ ] **Step 1: Write the failing streaming error test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { callChatAPIStream } from '../src/chatapi.js';

test('callChatAPIStream surfaces Gemini non-200 errors instead of throwing a reference error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'stream rejected' } }),
    { status: 500, headers: { 'Content-Type': 'application/json' } },
  );

  try {
    const env = {
      USE_MODEL_PLATFORM: 'GEMINI',
      GEMINI_API_URL: 'https://generativelanguage.googleapis.com',
      GEMINI_API_KEY: 'secret',
      DEFAULT_GEMINI_MODEL: 'gemini-test',
    };

    await assert.rejects(
      async () => {
        for await (const _chunk of callChatAPIStream(env, 'hello')) {
          // exhaust generator
        }
      },
      /Gemini Chat API error \(500\): stream rejected/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the chatapi test to verify it fails**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/chatapi.test.mjs`
Expected: FAIL with a `ReferenceError` caused by `errorBodyBody`.

- [ ] **Step 3: Write the minimal streaming fix**

```js
if (!response.ok) {
  const errorBodyText = await response.text();
  let errorData;
  try {
    errorData = JSON.parse(errorBodyText);
  } catch {
    errorData = errorBodyText;
  }
  ...
}
```

Optionally route Gemini/OpenAI HTTP calls through a shared `fetchWithTimeout()` seam if that keeps the change small and testable.

- [ ] **Step 4: Run the chatapi test to verify it passes**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/chatapi.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/chatapi.js tests/chatapi.test.mjs
git commit -m "fix: harden gemini stream error handling"
```

### Task 4: Full Verification and Follow-up Guardrails

**Files:**
- Modify: `README.md` or `docs/DEPLOYMENT.md`
- Follow-up Modify/Create: `.github/workflows/*.yml`

- [ ] **Step 1: Run the full current test suite**

Run: `node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs`
Expected: PASS with `0` failures.

- [ ] **Step 2: Document the canonical local verification command**

Add this command to docs:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs
```

- [ ] **Step 3: Add CI in a follow-up change**

Create a Worker test workflow that runs:

```bash
node --loader ./tests/extension-loader.mjs --experimental-default-type=module --test tests/*.test.mjs
```

- [ ] **Step 4: Commit**

```bash
git add README.md docs/DEPLOYMENT.md .github/workflows/
git commit -m "chore: document and automate worker test verification"
```
