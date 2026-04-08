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

test('content selection page renders the dashboard shell and explicit summary regions', () => {
  const html = generateContentSelectionPageHtml(
    createEnv(),
    '2026-04-08',
    createData(),
    createCategories(),
  );

  assert.ok(html.includes('<main class="workspace-shell">'));
  assert.ok(html.includes('<header class="workspace-header card">'));
  assert.ok(html.includes('<aside class="selection-sidebar card" aria-label="已选内容摘要">'));
  assert.ok(html.includes('<button type="button" class="selection-summary-mobile button button-primary" data-mobile-summary>'));
  assert.ok(html.includes('class="category-pill chip is-active"'));
  assert.ok(html.includes('>生成 AI 日报</button>'));
  assert.doesNotMatch(html, /ondblclick=/);
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
    assert.doesNotMatch(html, /Fallback title/);
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
  assert.match(html, /data-open-cookie-panel/);
  assert.match(html, /data-close-cookie-panel/);
  assert.match(html, /data-save-cookie/);
  assert.match(html, /data-fetch-all/);
  assert.match(html, /data-filter-selected/);
  assert.match(html, /data-clear-selection/);
  assert.match(html, /data-mobile-summary/);
  assert.match(html, /data-selected-count/);
  assert.match(html, /data-selection-summary-list/);
  assert.match(html, /data-sidebar-status/);
  assert.doesNotMatch(html, /alert\(/);
  assert.doesNotMatch(html, /confirm\(/);
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
});
