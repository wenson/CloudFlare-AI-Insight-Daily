# Operations UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/getContentHtml` and the AI report result pages into a productized editorial operations workspace without changing backend routes or AI generation logic.

**Architecture:** Keep the existing Worker routing and handler contracts, but break the oversized `src/htmlGenerators.js` into a small shared page-shell module plus two focused page generators: one for content selection and one for report results. Add regression tests for generated HTML first, then implement the new selection workspace, then implement the new report workspace, and finally verify the end-to-end browser behavior on desktop and mobile.

**Tech Stack:** Cloudflare Workers, server-rendered HTML strings, vanilla CSS/JS, Node test runner (`node:test`), `agent-browser` for browser verification

---

## File Map

- Create: `src/ui/pageShell.js`
  - Shared dashboard tokens, layout CSS, toast region markup, shared helper renderers.
- Create: `src/ui/contentSelectionPage.js`
  - Productized `/getContentHtml` generator with content cards, metrics, filters, summary rail, and client-side selection controller.
- Create: `src/ui/genAiPage.js`
  - Productized AI report result page generator with reader pane, action rail, analysis region, preview helpers, and prompt disclosure.
- Modify: `src/handlers/getContentHtml.js`
  - Switch the content-selection handler to the new focused generator module.
- Modify: `src/handlers/genAIContent.js`
  - Switch AI generation result rendering to the new focused generator module.
- Modify: `src/handlers/genAIDailyPage.js`
  - Switch the standalone daily-page route to the new focused generator module.
- Modify: `src/htmlGenerators.js`
  - Remove dead legacy exports after both handlers have migrated.
- Create: `tests/content-selection-page-ui.test.mjs`
  - Regression tests for the redesigned content selection page shell and interaction hooks.
- Create: `tests/gen-ai-page-ui.test.mjs`
  - Regression tests for the redesigned AI report result page shell and interaction hooks.

## Task 1: Add Failing HTML Regression Tests

**Files:**
- Create: `tests/content-selection-page-ui.test.mjs`
- Create: `tests/gen-ai-page-ui.test.mjs`
- Test: `tests/content-selection-page-ui.test.mjs`
- Test: `tests/gen-ai-page-ui.test.mjs`

- [ ] **Step 1: Write the failing test for the content selection workspace**

Create `tests/content-selection-page-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContentSelectionPageHtml } from '../src/htmlGenerators.js';

function createEnv() {
  return {
    FOLO_FILTER_DAYS: '7',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
  };
}

function createCategories() {
  return [
    { id: 'news', name: '新闻' },
    { id: 'paper', name: '论文' },
    { id: 'socialMedia', name: '社交平台' },
  ];
}

function createData() {
  return {
    news: [{
      id: 'news-1',
      type: 'news',
      url: 'https://example.com/news-1',
      title: 'Alpha launch',
      source: 'AI Base',
      published_date: '2026-04-08T08:00:00.000Z',
      details: {
        content_html: '<p>Alpha body</p>',
      },
    }],
    paper: [],
    socialMedia: [],
  };
}

test('content selection page renders the dashboard shell and explicit summary regions', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(html, /workspace-shell/);
  assert.match(html, /workspace-header/);
  assert.match(html, /selection-sidebar/);
  assert.match(html, /selection-summary-mobile/);
  assert.match(html, /category-pill/);
  assert.match(html, /生成 AI 日报/);
  assert.doesNotMatch(html, /ondblclick=/);
});
```

- [ ] **Step 2: Run the test to verify it fails on the current HTML**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/content-selection-page-ui.test.mjs
```

Expected:

```text
not ok 1 - content selection page renders the dashboard shell and explicit summary regions
```

- [ ] **Step 3: Write the failing test for the report result workspace**

Create `tests/gen-ai-page-ui.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGenAiPageHtml } from '../src/htmlGenerators.js';

function createEnv() {
  return {
    IMG_PROXY: '',
  };
}

test('gen ai page renders reader and action rail layout', () => {
  const html = generateGenAiPageHtml(
    createEnv(),
    'AI日报',
    '## 今日摘要\n\n这里是正文。',
    '2026-04-08',
    false,
    ['news:1'],
    'system prompt',
    'user prompt',
    null,
    null,
    null,
    '## 今日摘要\n\n这里是正文。',
    null,
  );

  assert.match(html, /report-layout/);
  assert.match(html, /report-reader/);
  assert.match(html, /report-actions/);
  assert.match(html, /analysis-panel/);
  assert.match(html, /prompt-panel/);
  assert.match(html, /生成播客脚本/);
});
```

- [ ] **Step 4: Run the report-page test to verify it fails**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/gen-ai-page-ui.test.mjs
```

Expected:

```text
not ok 1 - gen ai page renders reader and action rail layout
```

- [ ] **Step 5: Commit the failing-test baseline**

```bash
git add tests/content-selection-page-ui.test.mjs tests/gen-ai-page-ui.test.mjs
git commit -m "test: add ui regression coverage for html generators"
```

If spec review requires a follow-up fix to keep the tests pointed at the real generators, add a second commit touching only these two files rather than rewriting history in a dirty workspace.

## Task 2: Extract Shared UI Shell and Static Content Selection Layout

**Files:**
- Create: `src/ui/pageShell.js`
- Create: `src/ui/contentSelectionPage.js`
- Modify: `src/handlers/getContentHtml.js`
- Test: `tests/content-selection-page-ui.test.mjs`

- [ ] **Step 1: Create the shared dashboard shell helpers**

Create `src/ui/pageShell.js`:

```js
export function renderDashboardPage({ lang = 'zh-Hans', title, bodyClass = '', bodyContent, inlineScript = '' }) {
  return `<!DOCTYPE html>
  <html lang="${lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>${getDashboardStyles()}</style>
    </head>
    <body class="${bodyClass}">
      <div class="app-shell">
        ${renderToastRegion()}
        ${bodyContent}
      </div>
      <script>${inlineScript}</script>
    </body>
  </html>`;
}

export function renderToastRegion() {
  return '<div class="app-toast-region" aria-live="polite" aria-atomic="true"></div>';
}

export function getDashboardStyles() {
  return `
    :root {
      --bg: #f3f4f6;
      --surface: #fcfcfd;
      --surface-strong: #ffffff;
      --border: #d8dee7;
      --text: #172033;
      --muted: #5b6474;
      --primary: #2563eb;
      --primary-soft: #dbeafe;
      --accent: #d97706;
      --accent-soft: #fef3c7;
      --success: #15803d;
      --danger: #b91c1c;
      --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      --radius-lg: 20px;
      --radius-md: 14px;
      --radius-sm: 10px;
      --max-width: 1440px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body {
      background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 30%, #f3f4f6 100%);
      color: var(--text);
      font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.6;
    }
    .app-shell {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    .app-toast-region {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .card {
      background: var(--surface-strong);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }
    .button {
      min-height: 44px;
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
    }
    .button:hover { transform: translateY(-1px); }
    .button:focus-visible {
      outline: 3px solid rgba(37, 99, 235, 0.28);
      outline-offset: 2px;
    }
    .button-primary {
      background: var(--primary);
      color: #fff;
    }
    .button-secondary {
      background: var(--surface-strong);
      border-color: var(--border);
      color: var(--text);
    }
    .button-ghost {
      background: transparent;
      border-color: var(--border);
      color: var(--muted);
    }
    .workspace-shell, .report-layout { display: grid; gap: 20px; }
    .workspace-header, .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px;
    }
    .workspace-actions, .report-header-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    .workspace-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .workspace-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
    }
    .workspace-toolbar-left {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .workspace-grid, .report-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      align-items: start;
    }
    .workspace-main, .report-actions { display: grid; gap: 16px; }
    .category-panel { display: none; gap: 16px; }
    .category-panel.is-active { display: grid; }
    .content-card {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 16px;
      padding: 20px;
      cursor: pointer;
      transition: border-color 180ms ease, transform 180ms ease, background-color 180ms ease;
    }
    .content-card:hover { transform: translateY(-1px); border-color: #bfd0ff; }
    .content-card.is-selected { background: #eff6ff; border-color: #93c5fd; }
    .content-card-index { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
    .selection-sidebar, .analysis-panel, .prompt-panel, .cookie-panel { padding: 20px; }
    .selection-sidebar-footer, .cookie-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .selection-summary-mobile { display: none; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 100; }
    .report-reader { padding: 28px; }
    .report-reader-rendered img, .report-reader-rendered video { max-width: 100%; height: auto; }
    .prompt-panel-body pre {
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid var(--border);
    }
    @media (max-width: 768px) {
      .app-shell { padding: 16px 12px 96px; }
      .workspace-header, .report-header, .workspace-toolbar { padding: 16px; }
      .workspace-header, .report-header, .workspace-toolbar { flex-direction: column; }
      .workspace-grid, .report-grid { grid-template-columns: 1fr; }
      .selection-sidebar { display: none; }
      .selection-summary-mobile { display: block; }
    }
  `;
}
```

- [ ] **Step 2: Create the static content selection page generator with the new layout skeleton**

Create `src/ui/contentSelectionPage.js`:

```js
import { escapeHtml, formatDateToChinese } from '../helpers.js';
import { dataSources } from '../dataFetchers.js';
import { renderDashboardPage } from './pageShell.js';

function renderContentCard(item, index) {
  const source = dataSources[item.type];
  const html = source?.sources?.[0]?.generateHtml
    ? source.sources[0].generateHtml(item)
    : `<strong>${escapeHtml(item.title || '未知内容')}</strong>`;

  return `
    <article class="content-card card" data-item-card data-item-value="${escapeHtml(`${item.type}:${item.id}`)}">
      <div class="content-card-check">
        <input
          class="content-checkbox"
          type="checkbox"
          name="selectedItems"
          value="${escapeHtml(`${item.type}:${item.id}`)}"
          aria-label="选择第 ${index + 1} 条内容"
        >
      </div>
      <div class="content-card-body">
        <div class="content-card-index">#${index + 1}</div>
        <div class="content-card-html">${html}</div>
      </div>
    </article>`;
}

function renderCategoryPanel(category, items, isActive) {
  const cards = items.length
    ? items.map((item, index) => renderContentCard(item, index)).join('')
    : `<div class="empty-panel card"><h3>当前分类暂无内容</h3><p>可以稍后重新抓取，或切换到其他分类继续筛选。</p></div>`;

  return `
    <section
      id="panel-${escapeHtml(category.id)}"
      class="category-panel ${isActive ? 'is-active' : ''}"
      data-category-panel="${escapeHtml(category.id)}"
    >
      ${cards}
    </section>`;
}

export function generateContentSelectionPageHtml(env, dateStr, allData, dataCategories) {
  const categories = Array.isArray(dataCategories) ? dataCategories : [];
  const firstCategory = categories[0]?.id ?? '';
  const totalItems = categories.reduce((count, category) => count + ((allData?.[category.id] || []).length), 0);

  const categoryNav = categories.map((category, index) => {
    const count = (allData?.[category.id] || []).length;
    return `
      <button
        type="button"
        class="category-pill chip ${index === 0 ? 'is-active' : ''}"
        data-category-trigger="${escapeHtml(category.id)}"
        aria-pressed="${index === 0 ? 'true' : 'false'}"
      >
        <span>${escapeHtml(category.name)}</span>
        <span class="category-pill-count">${count}</span>
      </button>`;
  }).join('');

  const panels = categories.map((category, index) => {
    return renderCategoryPanel(category, allData?.[category.id] || [], index === 0);
  }).join('');

  const bodyContent = `
    <main class="workspace-shell">
      <form class="workspace-form" action="/genAIContent" method="POST">
        <input type="hidden" name="date" value="${escapeHtml(dateStr)}">

        <header class="workspace-header card">
          <div class="workspace-header-copy">
            <p class="workspace-kicker">AI Insight Daily</p>
            <h1>${formatDateToChinese(escapeHtml(dateStr))} 内容工作台</h1>
            <div class="workspace-meta">
              <span class="chip status-chip">时间窗口 ${escapeHtml(env.FOLO_FILTER_DAYS)} 天</span>
              <span class="chip status-chip">共 ${totalItems} 条候选内容</span>
              <span class="chip status-chip" data-selected-count>已选 0 条</span>
            </div>
          </div>
          <div class="workspace-actions">
            <button type="button" class="button button-secondary" data-open-cookie-panel>Cookie 设置</button>
            <button type="button" class="button button-secondary" data-fetch-all>抓取最新数据</button>
            <button type="submit" class="button button-primary">生成 AI 日报</button>
          </div>
        </header>

        <section class="workspace-toolbar card">
          <div class="workspace-toolbar-left">
            ${categoryNav}
          </div>
          <div class="workspace-toolbar-right">
            <label class="toolbar-toggle">
              <input type="checkbox" data-filter-selected>
              <span>仅看已选</span>
            </label>
          </div>
        </section>

        <div class="workspace-grid">
          <section class="workspace-main">
            ${panels}
          </section>

          <aside class="selection-sidebar card" aria-label="已选内容摘要">
            <div class="selection-sidebar-header">
              <h2>已选摘要</h2>
              <p data-sidebar-status>还没有选择内容</p>
            </div>
            <div class="selection-sidebar-body" data-selection-summary-list>
              <p class="selection-empty">从左侧内容池选择条目后，这里会实时显示结果。</p>
            </div>
            <div class="selection-sidebar-footer">
              <button type="button" class="button button-ghost" data-clear-selection>清空已选</button>
              <button type="submit" class="button button-primary">开始生成</button>
            </div>
          </aside>
        </div>

        <button type="button" class="selection-summary-mobile button button-primary" data-mobile-summary>
          已选 0 条
        </button>

        <section class="cookie-panel card" data-cookie-panel hidden>
          <h2>Folo Cookie 设置</h2>
          <label class="cookie-field" for="foloCookie">Folo Cookie</label>
          <input id="foloCookie" type="text" placeholder="在此输入 Folo Cookie">
          <p class="cookie-help">Cookie 将保存在浏览器本地存储中，只用于当前工作台抓取。</p>
          <div class="cookie-actions">
            <button type="button" class="button button-secondary" data-save-cookie>保存 Cookie</button>
            <button type="button" class="button button-ghost" data-close-cookie-panel>关闭</button>
          </div>
        </section>
      </form>
    </main>`;

  return renderDashboardPage({
    title: `${formatDateToChinese(escapeHtml(dateStr))} ${env.FOLO_FILTER_DAYS}天内的数据`,
    bodyClass: 'page-content-selection',
    bodyContent,
    inlineScript: '',
  });
}
```

- [ ] **Step 3: Point the content-selection handler at the new generator module**

Update `src/handlers/getContentHtml.js`:

```js
import { getISODate, escapeHtml, setFetchDate } from '../helpers.js';
import { getFromKV } from '../kv.js';
import { generateContentSelectionPageHtml } from '../ui/contentSelectionPage.js';
```

At the same time, update `tests/content-selection-page-ui.test.mjs` to import `generateContentSelectionPageHtml` from `../src/ui/contentSelectionPage.js` so the test turns green against the newly extracted module instead of the still-legacy facade.

- [ ] **Step 4: Run the content-selection regression test and make sure it passes**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/content-selection-page-ui.test.mjs
```

Expected:

```text
ok 1 - content selection page renders the dashboard shell and explicit summary regions
```

- [ ] **Step 5: Commit the shell extraction**

```bash
git add src/ui/pageShell.js src/ui/contentSelectionPage.js src/handlers/getContentHtml.js
git commit -m "feat: add shared dashboard shell for selection ui"
```

## Task 3: Implement Content Selection Interactions and Replace Blocking Feedback

**Files:**
- Modify: `src/ui/contentSelectionPage.js`
- Modify: `tests/content-selection-page-ui.test.mjs`
- Test: `tests/content-selection-page-ui.test.mjs`

- [ ] **Step 1: Extend the content-selection regression test to cover interaction hooks and non-blocking feedback**

Append this test to `tests/content-selection-page-ui.test.mjs`:

```js
test('content selection page uses explicit interaction hooks instead of alert or confirm', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(html, /app-toast-region/);
  assert.match(html, /data-open-cookie-panel/);
  assert.match(html, /data-save-cookie/);
  assert.match(html, /data-fetch-all/);
  assert.match(html, /data-filter-selected/);
  assert.match(html, /data-clear-selection/);
  assert.match(html, /data-mobile-summary/);
  assert.doesNotMatch(html, /alert\(/);
  assert.doesNotMatch(html, /confirm\(/);
});
```

- [ ] **Step 2: Run the updated test to verify it fails**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/content-selection-page-ui.test.mjs
```

Expected:

```text
not ok 2 - content selection page uses explicit interaction hooks instead of alert or confirm
```

- [ ] **Step 3: Add the interaction controller, summary syncing, toast feedback, and explicit fetch behavior**

Update `src/ui/contentSelectionPage.js` so the `inlineScript` passed to `renderDashboardPage()` is:

```js
const inlineScript = `
  (() => {
    const root = document;
    const toastRegion = root.querySelector('.app-toast-region');
    const summaryList = root.querySelector('[data-selection-summary-list]');
    const sidebarStatus = root.querySelector('[data-sidebar-status]');
    const selectedCountNodes = root.querySelectorAll('[data-selected-count]');
    const mobileSummaryButton = root.querySelector('[data-mobile-summary]');
    const cookiePanel = root.querySelector('[data-cookie-panel]');
    const cookieInput = root.querySelector('#foloCookie');
    const selectedFilter = root.querySelector('[data-filter-selected]');
    const triggers = [...root.querySelectorAll('[data-category-trigger]')];
    const panels = [...root.querySelectorAll('[data-category-panel]')];
    const cards = [...root.querySelectorAll('[data-item-card]')];
    const checkboxes = [...root.querySelectorAll('.content-checkbox')];
    const form = root.querySelector('.workspace-form');
    const cookieStorageKey = ${JSON.stringify(env.FOLO_COOKIE_KV_KEY)};

    function showToast(message, tone = 'info') {
      const toast = document.createElement('div');
      toast.className = 'chip';
      toast.style.pointerEvents = 'auto';
      toast.style.background = tone === 'error' ? '#fee2e2' : '#dbeafe';
      toast.style.color = tone === 'error' ? '#991b1b' : '#1d4ed8';
      toast.textContent = message;
      toastRegion.appendChild(toast);
      window.setTimeout(() => toast.remove(), 2400);
    }

    function getSelectedCards() {
      return cards.filter(card => {
        const checkbox = card.querySelector('.content-checkbox');
        return checkbox?.checked;
      });
    }

    function updateSummary() {
      const selectedCards = getSelectedCards();
      const selectedCount = selectedCards.length;
      selectedCountNodes.forEach(node => {
        node.textContent = '已选 ' + selectedCount + ' 条';
      });
      if (mobileSummaryButton) {
        mobileSummaryButton.textContent = '已选 ' + selectedCount + ' 条';
      }

      if (selectedCount === 0) {
        sidebarStatus.textContent = '还没有选择内容';
        summaryList.innerHTML = '<p class="selection-empty">从左侧内容池选择条目后，这里会实时显示结果。</p>';
        return;
      }

      sidebarStatus.textContent = '已准备生成，可直接提交';
      summaryList.innerHTML = selectedCards.slice(0, 6).map(card => {
        const title = card.querySelector('strong')?.textContent?.trim() || card.dataset.itemValue;
        return '<div class="selection-row">' + title + '</div>';
      }).join('');
    }

    function syncCardState(card) {
      const checkbox = card.querySelector('.content-checkbox');
      const selected = Boolean(checkbox?.checked);
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-selected', selected ? 'true' : 'false');
    }

    function syncAllCards() {
      cards.forEach(syncCardState);
      updateSummary();
      if (selectedFilter?.checked) {
        applySelectedFilter();
      }
    }

    function applySelectedFilter() {
      const onlySelected = Boolean(selectedFilter?.checked);
      cards.forEach(card => {
        const isSelected = card.querySelector('.content-checkbox')?.checked;
        card.hidden = onlySelected && !isSelected;
      });
    }

    function activateCategory(categoryId) {
      triggers.forEach(trigger => {
        const active = trigger.dataset.categoryTrigger === categoryId;
        trigger.classList.toggle('is-active', active);
        trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      panels.forEach(panel => {
        panel.classList.toggle('is-active', panel.dataset.categoryPanel === categoryId);
      });
    }

    async function saveCookie() {
      const value = cookieInput.value.trim();
      if (!value) {
        showToast('Folo Cookie 不能为空', 'error');
        cookieInput.focus();
        return;
      }
      localStorage.setItem(cookieStorageKey, value);
      showToast('Cookie 已保存');
      cookiePanel.hidden = true;
    }

    async function fetchLatest(button, category = null) {
      const originalText = button.textContent;
      const foloCookie = localStorage.getItem(cookieStorageKey);
      button.disabled = true;
      button.textContent = '抓取中...';

      try {
        const response = await fetch('/writeData', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, foloCookie }),
        });

        if (!response.ok) {
          const text = await response.text();
          showToast(text || '抓取失败，请稍后重试', 'error');
          return;
        }

        showToast(category ? '分类抓取完成，页面即将刷新' : '数据抓取完成，页面即将刷新');
        window.setTimeout(() => window.location.reload(), 800);
      } catch (error) {
        showToast(error.message || '抓取失败，请检查网络', 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalText;
      }
    }

    form.addEventListener('submit', event => {
      if (getSelectedCards().length === 0) {
        event.preventDefault();
        showToast('请至少选择一条内容后再生成', 'error');
      }
    });

    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => syncAllCards());
    });

    cards.forEach(card => {
      card.addEventListener('click', event => {
        if (event.target.closest('a, button, input, label')) return;
        const checkbox = card.querySelector('.content-checkbox');
        checkbox.checked = !checkbox.checked;
        syncAllCards();
      });
    });

    triggers.forEach(trigger => {
      trigger.addEventListener('click', () => activateCategory(trigger.dataset.categoryTrigger));
    });

    selectedFilter?.addEventListener('change', applySelectedFilter);
    root.querySelector('[data-open-cookie-panel]')?.addEventListener('click', () => { cookiePanel.hidden = false; });
    root.querySelector('[data-close-cookie-panel]')?.addEventListener('click', () => { cookiePanel.hidden = true; });
    root.querySelector('[data-save-cookie]')?.addEventListener('click', saveCookie);
    root.querySelector('[data-fetch-all]')?.addEventListener('click', event => fetchLatest(event.currentTarget));
    root.querySelector('[data-clear-selection]')?.addEventListener('click', () => {
      checkboxes.forEach(checkbox => { checkbox.checked = false; });
      syncAllCards();
    });
    mobileSummaryButton?.addEventListener('click', () => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });

    const savedCookie = localStorage.getItem(cookieStorageKey);
    if (savedCookie) cookieInput.value = savedCookie;
    if (${JSON.stringify(firstCategory)}) activateCategory(${JSON.stringify(firstCategory)});
    syncAllCards();
  })();
`;
```

Also pass that variable into `renderDashboardPage()`:

```js
  return renderDashboardPage({
    title: `${formatDateToChinese(escapeHtml(dateStr))} ${env.FOLO_FILTER_DAYS}天内的数据`,
    bodyClass: 'page-content-selection',
    bodyContent,
    inlineScript,
  });
```

- [ ] **Step 4: Run the test again and make sure the interaction coverage passes**

Run:

```bash
node --test tests/content-selection-page-ui.test.mjs
```

Expected:

```text
ok 1 - content selection page renders the dashboard shell and explicit summary regions
ok 2 - content selection page uses explicit interaction hooks instead of alert or confirm
```

- [ ] **Step 5: Commit the interaction upgrade**

```bash
git add src/ui/contentSelectionPage.js tests/content-selection-page-ui.test.mjs
git commit -m "feat: add interactive content selection workspace"
```

## Task 4: Implement the AI Report Workspace Layout and Actions Rail

**Files:**
- Create: `src/ui/genAiPage.js`
- Modify: `tests/gen-ai-page-ui.test.mjs`
- Modify: `src/handlers/genAIContent.js`
- Modify: `src/handlers/genAIDailyPage.js`
- Modify: `src/htmlGenerators.js`
- Test: `tests/gen-ai-page-ui.test.mjs`

- [ ] **Step 1: Extend the report-page test to cover non-blocking actions and disclosure panels**

Replace `tests/gen-ai-page-ui.test.mjs` with:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGenAiPageHtml } from '../src/ui/genAiPage.js';

function createEnv() {
  return {
    IMG_PROXY: '',
  };
}

test('gen ai page renders reader and action rail layout', () => {
  const html = generateGenAiPageHtml(
    createEnv(),
    'AI日报',
    '## 今日摘要\\n\\n这里是正文。',
    '2026-04-08',
    false,
    ['news:1'],
    'system prompt',
    'user prompt',
    null,
    null,
    null,
    '## 今日摘要\\n\\n这里是正文。',
    null,
  );

  assert.match(html, /report-layout/);
  assert.match(html, /report-reader/);
  assert.match(html, /report-actions/);
  assert.match(html, /analysis-panel/);
  assert.match(html, /prompt-panel/);
  assert.match(html, /data-open-preview/);
  assert.match(html, /data-run-analysis/);
  assert.match(html, /app-toast-region/);
  assert.doesNotMatch(html, /alert\(/);
});
```

- [ ] **Step 2: Run the report-page test and verify it still fails**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/gen-ai-page-ui.test.mjs
```

Expected:

```text
not ok 1 - gen ai page renders reader and action rail layout
```

- [ ] **Step 3: Create the redesigned report page generator and move result-page logic out of `src/htmlGenerators.js`**

Create `src/ui/genAiPage.js`:

```js
import { escapeHtml, formatDateToChinese, convertEnglishQuotesToChinese, replaceImageProxy } from '../helpers.js';
import { marked } from '../marked.esm.js';
import { renderDashboardPage } from './pageShell.js';

function renderActionForm(action, pageDate, selectedItemsForAction, extraFields, label, tone = 'secondary') {
  return `
    <form action="${action}" method="POST">
      <input type="hidden" name="date" value="${escapeHtml(pageDate)}">
      ${selectedItemsForAction.map(item => `<input type="hidden" name="selectedItems" value="${escapeHtml(item)}">`).join('')}
      ${extraFields}
      <button type="submit" class="button ${tone === 'primary' ? 'button-primary' : 'button-secondary'}">${label}</button>
    </form>`;
}

function renderPromptPanel(systemPrompt, userPrompt, promptId) {
  if (!systemPrompt && !userPrompt) return '';
  return `
    <section class="prompt-panel card">
      <div class="prompt-panel-header">
        <h3>API 调用详情</h3>
        <button type="button" class="button button-ghost" data-toggle-prompt="${promptId}">展开提示</button>
      </div>
      <div id="${promptId}" class="prompt-panel-body" hidden>
        <h4>系统指令</h4>
        <pre>${escapeHtml(systemPrompt || '无')}</pre>
        <h4>用户输入</h4>
        <pre>${escapeHtml(userPrompt || '无')}</pre>
      </div>
    </section>`;
}

export function generateGenAiPageHtml(env, title, bodyContent, pageDate, isErrorPage = false, selectedItemsForAction = null,
  systemP1 = null, userP1 = null, systemP2 = null, userP2 = null, promptsMd = null, dailyMd = null, podcastMd = null) {
  const selectedItems = Array.isArray(selectedItemsForAction) ? selectedItemsForAction : [];
  const readerHtml = marked.parse(replaceImageProxy(env.IMG_PROXY, bodyContent));
  const dailyPromptPanel = title === 'AI日报' || title.includes('生成AI日报出错(')
    ? renderPromptPanel(convertEnglishQuotesToChinese(systemP1), convertEnglishQuotesToChinese(userP1), 'prompt-call-1')
    : '';
  const podcastPromptPanel = title === 'AI播客脚本'
    ? renderPromptPanel(convertEnglishQuotesToChinese(systemP2), convertEnglishQuotesToChinese(userP2), 'prompt-call-2')
    : '';

  const primaryAction = title === 'AI日报' && !isErrorPage && podcastMd === null
    ? renderActionForm(
        '/genAIPodcastScript',
        pageDate,
        selectedItems,
        `<input type="hidden" name="summarizedContent" value="${escapeHtml(convertEnglishQuotesToChinese(bodyContent))}">`,
        '生成播客脚本',
        'primary',
      )
    : '';

  const bodyMarkup = `
    <main class="report-layout">
      <header class="report-header card">
        <div class="report-header-copy">
          <p class="workspace-kicker">AI Insight Daily</p>
          <h1>${escapeHtml(title)}</h1>
          <div class="workspace-meta">
            <span class="chip">日期 ${formatDateToChinese(escapeHtml(pageDate))}</span>
            <span class="chip">${selectedItems.length} 条来源</span>
            <span class="chip">${isErrorPage ? '生成失败' : '已生成'}</span>
          </div>
        </div>
        <div class="report-header-actions">
          ${primaryAction}
          <button type="button" class="button button-secondary" data-run-analysis data-date="${escapeHtml(pageDate)}">AI 日报分析</button>
          <button type="button" class="button button-secondary" data-open-preview>预览排版</button>
          <a href="/getContentHtml?date=${encodeURIComponent(pageDate)}" class="button button-ghost">返回内容选择</a>
        </div>
      </header>

      <div class="report-grid">
        <article class="report-reader card">
          <div class="report-reader-markdown">${bodyContent}</div>
          <div class="report-reader-rendered" data-preview-pane hidden>${readerHtml}</div>
        </article>

        <aside class="report-actions">
          <section class="analysis-panel card" id="dailyAnalysisResult">
            <h2>分析结果</h2>
            <p>点击“AI 日报分析”后，这里会显示补充分析。</p>
          </section>
          ${dailyPromptPanel}
          ${podcastPromptPanel}
        </aside>
      </div>
    </main>`;

  const inlineScript = `
    (() => {
      const toastRegion = document.querySelector('.app-toast-region');
      const previewButton = document.querySelector('[data-open-preview]');
      const analysisButton = document.querySelector('[data-run-analysis]');
      const previewPane = document.querySelector('[data-preview-pane]');
      const readerMarkdown = document.querySelector('.report-reader-markdown');
      const analysisPanel = document.querySelector('#dailyAnalysisResult');

      function showToast(message, tone = 'info') {
        const toast = document.createElement('div');
        toast.className = 'chip';
        toast.style.pointerEvents = 'auto';
        toast.style.background = tone === 'error' ? '#fee2e2' : '#dbeafe';
        toast.style.color = tone === 'error' ? '#991b1b' : '#1d4ed8';
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2400);
      }

      document.querySelectorAll('[data-toggle-prompt]').forEach(button => {
        button.addEventListener('click', () => {
          const panel = document.getElementById(button.dataset.togglePrompt);
          const expanded = !panel.hidden;
          panel.hidden = expanded;
          button.textContent = expanded ? '展开提示' : '收起提示';
        });
      });

      previewButton?.addEventListener('click', () => {
        const expanded = !previewPane.hidden;
        previewPane.hidden = expanded;
        readerMarkdown.hidden = !expanded;
        previewButton.textContent = expanded ? '预览排版' : '查看原稿';
      });

      analysisButton?.addEventListener('click', async () => {
        const date = analysisButton.dataset.date;
        const summarizedContent = readerMarkdown.textContent;
        const originalText = analysisButton.textContent;
        analysisButton.disabled = true;
        analysisButton.textContent = '分析中...';

        try {
          const response = await fetch('/genAIDailyAnalysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, summarizedContent }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            analysisPanel.innerHTML = '<h2>分析结果</h2><p>' + errorText + '</p>';
            showToast('AI 日报分析失败', 'error');
            return;
          }

          const result = await response.text();
          analysisPanel.innerHTML = '<h2>分析结果</h2><div>' + result + '</div>';
          showToast('AI 日报分析已更新');
        } catch (error) {
          analysisPanel.innerHTML = '<h2>分析结果</h2><p>请求失败，请稍后重试。</p>';
          showToast('请求失败，请稍后重试', 'error');
        } finally {
          analysisButton.disabled = false;
          analysisButton.textContent = originalText;
        }
      });
    })();
  `;

  return renderDashboardPage({
    title: escapeHtml(title),
    bodyClass: 'page-report',
    bodyContent: bodyMarkup,
    inlineScript,
  });
}
```

- [ ] **Step 4: Point the report handlers at the new generator module and remove the legacy export file**

Update the imports in `src/handlers/genAIContent.js` and `src/handlers/genAIDailyPage.js`:

```js
import { generateGenAiPageHtml } from '../ui/genAiPage.js';
```

Then replace `src/htmlGenerators.js` with a comment-only compatibility stub so any forgotten imports fail loudly instead of silently diverging:

```js
throw new Error('src/htmlGenerators.js is deprecated. Import page generators from src/ui/*.js instead.');
```

- [ ] **Step 5: Run the report-page regression test and make sure it passes**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test tests/gen-ai-page-ui.test.mjs
```

Expected:

```text
ok 1 - gen ai page renders reader and action rail layout
```

- [ ] **Step 6: Commit the report workspace**

```bash
git add src/ui/genAiPage.js src/handlers/genAIContent.js src/handlers/genAIDailyPage.js src/htmlGenerators.js tests/gen-ai-page-ui.test.mjs
git commit -m "feat: redesign ai report workspace layout"
```

## Task 5: Run Full Regression and Browser Verification

**Files:**
- Modify: `src/ui/contentSelectionPage.js`
- Modify: `src/ui/genAiPage.js`
- Test: `tests/content-selection-page-ui.test.mjs`
- Test: `tests/gen-ai-page-ui.test.mjs`

- [x] **Step 1: Add one final smoke assertion for accessibility hooks on both pages**

Append this test to `tests/content-selection-page-ui.test.mjs`:

```js
test('content selection page exposes accessible summary and cookie controls', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="已选内容摘要"/);
  assert.match(html, /id="foloCookie"/);
});
```

Append this test to `tests/gen-ai-page-ui.test.mjs`:

```js
test('gen ai page keeps prompt disclosure explicit and keyboard reachable', () => {
  const html = generateGenAiPageHtml(
    createEnv(),
    'AI日报',
    '## 今日摘要\\n\\n这里是正文。',
    '2026-04-08',
    false,
    ['news:1'],
    'system prompt',
    'user prompt',
    null,
    null,
    null,
    '## 今日摘要\\n\\n这里是正文。',
    null,
  );

  assert.match(html, /data-toggle-prompt/);
  assert.match(html, /data-open-preview/);
  assert.match(html, /data-run-analysis/);
});
```

- [x] **Step 2: Run the full automated regression suite**

Run:

```bash
node --loader ./tests/extension-loader.mjs --test \
  tests/content-selection-page-ui.test.mjs \
  tests/gen-ai-page-ui.test.mjs \
  tests/rss-d1.test.mjs \
  tests/writeData-unknown-category.test.mjs \
  tests/index-no-github-runtime.test.mjs \
  tests/news-aggregator-description-fallback.test.mjs \
  tests/folo-curl-command.test.mjs
```

Expected:

```text
# tests  ...
# pass   ...
# fail   0
```

Verification on April 9, 2026:

```text
# tests 18
# pass 18
# fail 0
```

- [x] **Step 3: Run the local worker and verify the redesigned flows in the browser**

Start the worker:

```bash
npx wrangler dev --config wrangler.local.toml --port 8791
```

In a second terminal, verify desktop flow:

```bash
agent-browser open http://127.0.0.1:8791/login
agent-browser wait --load networkidle
agent-browser snapshot -i
set -a; source ./.dev.vars; set +a
agent-browser fill @e1 "$LOGIN_USERNAME"
agent-browser fill @e2 "$LOGIN_PASSWORD"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i -C
```

Expected:

```text
- button "抓取最新数据"
- button "生成 AI 日报"
- button "Cookie 设置"
- button "已选 0 条"
```

Verify mobile flow:

```bash
agent-browser set device "iPhone 14"
agent-browser open http://127.0.0.1:8791/getContentHtml
agent-browser wait --load networkidle
agent-browser snapshot -i -C
```

Expected:

```text
- button "已选 0 条"
- button "生成 AI 日报"
```

Verification on April 9, 2026:

```text
Desktop:
- button "Cookie 设置"
- button "抓取最新数据"
- button "生成 AI 日报"

Mobile:
- button "生成 AI 日报"
- button "已选 0 条"

Report page:
- button "生成播客脚本"
- button "AI 日报分析"
- button "预览排版"
```

- [x] **Step 4: Fix any failing assertions or browser regressions with the smallest targeted change**

If the accessibility smoke test fails because the summary aside is missing an aria label, update `src/ui/contentSelectionPage.js`:

```js
          <aside class="selection-sidebar card" aria-label="已选内容摘要">
```

If the report page misses the analysis hook, ensure this button remains present in `src/ui/genAiPage.js`:

```js
          <button type="button" class="button button-secondary" data-run-analysis data-date="${escapeHtml(pageDate)}">AI 日报分析</button>
```

- [ ] **Step 5: Commit the verified UI redesign**

```bash
git add src/ui/pageShell.js src/ui/contentSelectionPage.js src/ui/genAiPage.js src/htmlGenerators.js tests/content-selection-page-ui.test.mjs tests/gen-ai-page-ui.test.mjs
git commit -m "feat: redesign editorial operations ui"
```
