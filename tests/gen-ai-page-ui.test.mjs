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
