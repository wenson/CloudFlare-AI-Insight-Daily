import test from 'node:test';
import assert from 'node:assert/strict';
import { generateContentSelectionPageHtml } from '../src/ui/contentSelectionPage.js';

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

  assert.match(html, /workspace-shell/);
  assert.match(html, /workspace-header/);
  assert.match(html, /selection-sidebar/);
  assert.match(html, /selection-summary-mobile/);
  assert.match(html, /category-pill/);
  assert.match(html, /生成 AI 日报/);
  assert.doesNotMatch(html, /ondblclick=/);
});
