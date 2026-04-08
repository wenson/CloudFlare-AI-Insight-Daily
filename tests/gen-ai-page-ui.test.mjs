import test from 'node:test';
import assert from 'node:assert/strict';

function generateGenAiPageHtml() {
  return `
    <div class="legacy-ai-shell">
      <div class="legacy-reader">旧阅读区</div>
      <div class="legacy-actions">旧操作区</div>
      <div class="legacy-analysis">旧分析区</div>
      <div class="legacy-prompt">旧提示面板</div>
      <button type="button">生成播客脚本</button>
    </div>
  `;
}

test('gen ai page renders reader and action rail layout', () => {
  const html = generateGenAiPageHtml();

  assert.match(html, /report-layout/);
  assert.match(html, /report-reader/);
  assert.match(html, /report-actions/);
  assert.match(html, /analysis-panel/);
  assert.match(html, /prompt-panel/);
  assert.match(html, /生成播客脚本/);
});
