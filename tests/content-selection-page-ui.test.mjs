import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContentSelectionPageHtml } from '../src/ui/contentSelectionPage.js';
import { dataSources } from '../src/dataFetchers.js';

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
    news: [
      {
        id: 'news-1',
        type: 'news',
        url: 'https://example.com/news-1',
        title: 'Alpha launch',
        source: 'AI Base',
        published_date: '2026-04-08T08:00:00.000Z',
        details: {
          content_html: '<p>Alpha body</p>',
        },
      },
    ],
    paper: [],
    socialMedia: [],
  };
}

test('content selection page renders the refreshed workbench hierarchy and explicit summary regions', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
    {
      todayDate: '2026-04-10',
      archiveDays: [
        {
          archive_date: '2026-04-07',
          total_count: 9,
          news_count: 4,
          paper_count: 2,
          social_media_count: 3,
        },
        {
          archive_date: '2026-04-06',
          total_count: 5,
          news_count: 3,
          paper_count: 1,
          social_media_count: 1,
        },
      ],
    },
  );

  assert.ok(html.includes('<main class="workspace-shell workspace-shell-content">'));
  assert.ok(html.includes('<header class="workspace-status-band card">'));
  assert.ok(html.includes('<aside class="selection-sidebar workspace-aside-column" aria-label="内容侧栏">'));
  assert.ok(html.includes('<section class="selection-summary-card workspace-aside-section card" aria-label="已选内容摘要">'));
  assert.ok(html.includes('<section class="selection-archive-card workspace-aside-section card" aria-label="内容归档">'));
  assert.ok(html.includes('<button type="button" class="selection-summary-mobile button button-primary" data-mobile-summary>'));
  assert.ok(html.includes('class="category-pill chip is-active"'));
  assert.ok(html.includes('>生成 AI 日报</button>'));
  assert.match(html, /data-selection-archive/);
  assert.match(html, /selection-summary-card[\s\S]*selection-recent-list[\s\S]*selection-sidebar-footer/);
  assert.match(html, /selection-archive-card[\s\S]*data-selection-archive/);
  assert.match(html, /workspace-status-band/);
  assert.match(html, /workspace-status-metrics/);
  assert.match(html, /workspace-primary-actions/);
  assert.match(html, /workspace-toolbar-card/);
  assert.match(html, /workspace-content-column/);
  assert.match(html, /workspace-aside-column/);
  assert.match(html, /selection-recent-list/);
  assert.match(html, /advanced-actions-panel/);
  assert.match(html, /selection-summary-card[\s\S]*selection-archive-card[\s\S]*advanced-actions-panel/);
  const formMatch = html.match(/<form[^>]*class="workspace-form"[^>]*>[\s\S]*?<\/form>/);
  assert.ok(formMatch);
  assert.doesNotMatch(formMatch[0], /data-advanced-actions-panel/);
  assert.doesNotMatch(formMatch[0], /data-backfill-panel/);
  assert.match(html, /<\/form>\s*<section class="advanced-actions-panel workspace-aside-section card" data-advanced-actions-panel hidden>/);
  assert.match(html, /\.workspace-status-top\s*\{/);
  assert.match(html, /\.workspace-primary-actions\s*\{/);
  assert.match(html, /\.workspace-status-metrics\s*\{/);
  assert.match(html, /report-reader-shell/);
  assert.match(html, /今天/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-10&category=news&pageSize=20"/);
  assert.match(html, /2026\/4\/7/);
  assert.match(html, /2026\/4\/6/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-07&category=news&pageSize=20"/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-06&category=news&pageSize=20"/);
  assert.match(html, /<h2>内容归档<\/h2>/);
  assert.doesNotMatch(html, /ondblclick=/);
  assert.match(html, /发布日期 2026\/4\/8/);
});

test('content selection page resolves renderer by type instead of fixed first source index', () => {
  const originalNewsSources = dataSources.news.sources;
  dataSources.news.sources = [
    {},
    {
      generateHtml: () => '<strong>Second source renderer</strong>',
    },
  ];

  try {
    const html = generateContentSelectionPageHtml(
      createEnv(),
      '2026-04-08',
      {
        news: [
          {
            id: 'news-2',
            type: 'news',
            title: 'Fallback title',
          },
        ],
        paper: [],
        socialMedia: [],
      },
      createCategories(),
    );

    assert.match(html, /Second source renderer/);
    assert.doesNotMatch(html, /<strong>Fallback title<\/strong>/);
  } finally {
    dataSources.news.sources = originalNewsSources;
  }
});

test('content selection page ships interaction controller hooks with non-blocking feedback', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(html, /app-toast-region/);
  assert.match(html, /data-close-cookie-panel/);
  assert.match(html, /data-save-cookie/);
  assert.match(html, /data-fetch-all/);
  assert.match(html, /data-toggle-advanced-actions/);
  assert.match(html, /data-advanced-actions-panel/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /data-clear-selection/);
  assert.match(html, /data-mobile-summary/);
  assert.match(html, /data-selected-count/);
  assert.match(html, /data-selection-summary-stats/);
  assert.match(html, /data-selection-summary-list/);
  assert.match(html, /data-sidebar-status/);
  assert.match(html, /selectedEntries\.slice\(0, 6\)/);
  assert.match(html, /const advancedActionsPanel = root\.querySelector\('\[data-advanced-actions-panel\]'\);/);
  assert.match(html, /const advancedActionsToggle = root\.querySelector\('\[data-toggle-advanced-actions\]'\);/);
  assert.match(html, /const summaryStats = root\.querySelector\('\[data-selection-summary-stats\]'\);/);
  assert.match(html, /function setAdvancedActionsOpen\(nextOpen\)/);
  assert.match(html, /advancedActionsToggle\.setAttribute\('aria-expanded', nextOpen \? 'true' : 'false'\);/);
  assert.match(html, /const advancedToggle = event\.target\.closest\('\[data-toggle-advanced-actions\]'\);/);
  assert.match(html, /root\.querySelector\('\[data-close-cookie-panel\]'\)\?\.addEventListener\('click', \(\) => \{\s*setAdvancedActionsOpen\(false\);/);
  assert.doesNotMatch(html, /data-open-cookie-panel/);
  assert.doesNotMatch(html, /cookiePanel\.hidden = true/);
  assert.doesNotMatch(html, /alert\(/);
  assert.doesNotMatch(html, /confirm\(/);
  assert.doesNotMatch(html, /<section class="cookie-panel card" data-cookie-panel hidden>/);
});

test('content selection page keeps summary sidebar usable on mobile and CTA scrolls to it', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(
    html,
    /@media \(max-width: 768px\)[\s\S]*?\.selection-sidebar \{ display: grid; \}/,
  );
  assert.match(html, /const selectionSidebar = root\.querySelector\('\.selection-sidebar'\);/);
  assert.match(html, /selectionSidebar\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\);/);
  assert.match(html, /data-back-to-top/);
  assert.match(html, /window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\);/);
  assert.match(html, /window\.addEventListener\('scroll', syncBackToTopVisibility, \{ passive: true \}\);/);
  assert.match(
    html,
    /@media \(max-width: 768px\)[\s\S]*?\.back-to-top-button \{ bottom: 84px; right: 16px; \}/,
  );
});

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

test('content selection page renders batch-size controls and incremental loading hooks', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
    {
      activeCategory: 'news',
      pageSize: 20,
      todayDate: '2026-04-10',
      archiveDays: [
        {
          archive_date: '2026-04-07',
          total_count: 9,
          news_count: 4,
          paper_count: 2,
          social_media_count: 3,
        },
      ],
      categoryPagination: {
        news: {
          currentPage: 1,
          totalPages: 7,
          totalItems: 125,
          startItem: 1,
          endItem: 20,
          nextOffset: 20,
          hasMore: true,
        },
        paper: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          startItem: 0,
          endItem: 0,
          nextOffset: null,
          hasMore: false,
        },
        socialMedia: {
          currentPage: 1,
          totalPages: 1,
          totalItems: 0,
          startItem: 0,
          endItem: 0,
          nextOffset: null,
          hasMore: false,
        },
      },
    },
  );

  assert.match(html, /每批 20 条/);
  assert.match(html, /每批 50 条/);
  assert.match(html, /每批 100 条/);
  assert.match(html, /data-batch-size-option="20"/);
  assert.match(html, /data-load-more-sentinel/);
  assert.match(html, /data-load-more-status/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /fetch\(.*\/getContentPage/);
  assert.match(html, /nextOffset/);
  assert.match(html, /hasMore/);
  assert.match(html, /const selectionStorageKey = /);
  assert.match(html, /data-selection-hidden-inputs/);
  assert.match(html, /input\.name = 'selectedItems';/);
  assert.match(html, /selectedItemsMap/);
});

test('content selection page renders the backfill control set', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.match(html, /data-backfill-panel/);
  assert.match(html, /id="backfillStartDate"/);
  assert.match(html, /id="backfillEndDate"/);
  assert.match(html, /data-run-backfill/);
  assert.match(html, /fetch\('\/backfillData'/);
  assert.match(html, /<h2>Backfill<\/h2>/);
  assert.match(html, /hasBackfillIssues/);
  assert.match(html, /showToast\(summaryText, hasBackfillIssues \? 'error' : 'info'\)/);
  assert.match(html, /if \(!response\.ok\)/);
  assert.match(html, /payload\?\.success !== true/);
  assert.match(html, /try \{[\s\S]*await response\.json\(\);/);
  assert.match(html, /catch \(error\)/);
  assert.match(html, /补数响应格式异常/);
  assert.doesNotMatch(html, /\.catch\(\(\) => \(\{\}\)\)/);
});

test('advanced actions panel sits after the genAIContent form so backfill is not nested in submit scope', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  const formMatch = html.match(/<form[^>]*class="workspace-form"[^>]*>[\s\S]*?<\/form>/);
  assert.ok(formMatch);
  assert.doesNotMatch(formMatch[0], /data-advanced-actions-panel/);
  assert.doesNotMatch(formMatch[0], /data-cookie-panel/);
  assert.doesNotMatch(formMatch[0], /data-backfill-panel/);
  assert.match(html, /<\/form>\s*<section class="advanced-actions-panel workspace-aside-section card" data-advanced-actions-panel hidden>[\s\S]*data-cookie-panel[\s\S]*data-backfill-panel/);
});
