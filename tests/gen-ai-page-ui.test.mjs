import test from 'node:test';
import assert from 'node:assert/strict';
import { generateGenAiPageHtml } from '../src/ui/genAiPage.js';

function createEnv() {
  return {
    IMG_PROXY: '',
  };
}

function extractPreviewPane(html) {
  const match = html.match(/<div class="report-reader-rendered" data-preview-pane hidden>([\s\S]*?)<\/div>\s*<\/article>/);
  assert.ok(match, 'expected preview pane markup to be present');
  return match[1];
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
  assert.match(html, /report-page-hero/);
  assert.match(html, /report-hero-metadata/);
  assert.match(html, /report-reader/);
  assert.match(html, /report-reader-shell/);
  assert.match(html, /report-reader-rendered/);
  assert.match(html, /report-actions/);
  assert.match(html, /report-sidebar-section/);
  assert.match(html, /analysis-panel/);
  assert.match(html, /prompt-panel/);
  assert.match(html, /data-open-preview/);
  assert.match(html, /data-run-analysis/);
  assert.match(html, /data-toggle-prompt/);
  assert.match(html, /app-toast-region/);
  assert.doesNotMatch(html, /alert\(/);
});

test('gen ai page sanitizes malicious preview markdown before rendering', () => {
  const html = generateGenAiPageHtml(
    createEnv(),
    'AI日报',
    '## 安全检查\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(2))\n\n<img src=x onerror=alert(3)>',
    '2026-04-08',
    false,
    ['news:1'],
    null,
    null,
    null,
    null,
    null,
    '## 安全检查',
    null,
  );

  const previewHtml = extractPreviewPane(html);

  assert.match(previewHtml, /<h2>安全检查<\/h2>/);
  assert.match(previewHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(previewHtml, /<script>alert\(1\)<\/script>/i);
  assert.doesNotMatch(previewHtml, /onerror=/i);
  assert.doesNotMatch(previewHtml, /javascript:/i);
});

test('gen ai page keeps prompt disclosure explicit and keyboard reachable', () => {
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

  assert.match(html, /data-toggle-prompt/);
  assert.match(html, /data-open-preview/);
  assert.match(html, /data-run-analysis/);
});
