import test from 'node:test';
import assert from 'node:assert/strict';

function generateContentSelectionPageHtml() {
  return `
    <div class="legacy-selection-shell">
      <div class="legacy-header">内容选择旧版</div>
      <div class="legacy-sidebar">旧侧边栏</div>
      <div class="legacy-summary-mobile">旧汇总</div>
      <div class="legacy-pill">旧分类</div>
      <button type="button">生成 AI 日报</button>
    </div>
  `;
}

test('content selection page renders the dashboard shell and explicit summary regions', () => {
  const html = generateContentSelectionPageHtml();

  assert.match(html, /workspace-shell/);
  assert.match(html, /workspace-header/);
  assert.match(html, /selection-sidebar/);
  assert.match(html, /selection-summary-mobile/);
  assert.match(html, /category-pill/);
  assert.match(html, /生成 AI 日报/);
  assert.doesNotMatch(html, /ondblclick=/);
});
