import { escapeHtml, formatDateToChinese } from '../helpers.js';
import { dataSources } from '../dataFetchers.js';
import { renderDashboardPage } from './pageShell.js';

function buildTypeRenderers() {
  return Object.entries(dataSources).reduce((renderers, [type, config]) => {
    const sourceRenderer = Array.isArray(config?.sources)
      ? config.sources.find((source) => typeof source?.generateHtml === 'function')?.generateHtml
      : null;

    if (typeof sourceRenderer === 'function') {
      renderers[type] = sourceRenderer;
    }

    return renderers;
  }, {});
}

function renderContentCard(item, index, typeRenderers) {
  const renderer = typeRenderers[item.type];
  const html = typeof renderer === 'function'
    ? renderer(item)
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

function renderCategoryPanel(category, items, isActive, typeRenderers) {
  const cards = items.length
    ? items.map((item, index) => renderContentCard(item, index, typeRenderers)).join('')
    : '<div class="empty-panel card"><h3>当前分类暂无内容</h3><p>可以稍后重新抓取，或切换到其他分类继续筛选。</p></div>';

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
  const safeData = allData || {};
  const typeRenderers = buildTypeRenderers();
  const safeDateStr = escapeHtml(dateStr);
  const safeFilterDays = escapeHtml(env?.FOLO_FILTER_DAYS ?? '');
  const safeDisplayDate = escapeHtml(formatDateToChinese(dateStr));
  const totalItems = categories.reduce((count, category) => {
    return count + (safeData?.[category.id] || []).length;
  }, 0);

  const categoryNav = categories.map((category, index) => {
    const count = (safeData?.[category.id] || []).length;
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
    return renderCategoryPanel(category, safeData?.[category.id] || [], index === 0, typeRenderers);
  }).join('');

  const bodyContent = `
    <main class="workspace-shell">
      <form class="workspace-form" action="/genAIContent" method="POST">
        <input type="hidden" name="date" value="${safeDateStr}">

        <header class="workspace-header card">
          <div class="workspace-header-copy">
            <p class="workspace-kicker">AI Insight Daily</p>
            <h1>${safeDisplayDate} 内容工作台</h1>
            <div class="workspace-meta">
              <span class="chip status-chip">时间窗口 ${safeFilterDays} 天</span>
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
    title: `${safeDisplayDate} ${safeFilterDays}天内的数据`,
    bodyClass: 'page-content-selection',
    bodyContent,
    inlineScript: '',
  });
}
