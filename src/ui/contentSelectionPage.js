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
  const firstCategory = categories[0]?.id ?? '';
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

  const inlineScript = `
    (() => {
      const root = document;
      const toastRegion = root.querySelector('.app-toast-region');
      const summaryList = root.querySelector('[data-selection-summary-list]');
      const sidebarStatus = root.querySelector('[data-sidebar-status]');
      const selectionSidebar = root.querySelector('.selection-sidebar');
      const selectedCountNodes = root.querySelectorAll('[data-selected-count]');
      const mobileSummaryButton = root.querySelector('[data-mobile-summary]');
      const cookiePanel = root.querySelector('[data-cookie-panel]');
      const cookieInput = root.querySelector('#foloCookie');
      const selectedFilter = root.querySelector('[data-filter-selected]');
      const triggers = Array.from(root.querySelectorAll('[data-category-trigger]'));
      const panels = Array.from(root.querySelectorAll('[data-category-panel]'));
      const cards = Array.from(root.querySelectorAll('[data-item-card]'));
      const checkboxes = Array.from(root.querySelectorAll('.content-checkbox'));
      const form = root.querySelector('.workspace-form');
      const cookieStorageKey = ${JSON.stringify(env?.FOLO_COOKIE_KV_KEY || 'folo_cookie')};

      function showToast(message, tone = 'info') {
        if (!toastRegion) return;

        const toast = root.createElement('div');
        toast.className = 'chip';
        toast.style.pointerEvents = 'auto';
        toast.style.background = tone === 'error' ? '#fee2e2' : '#dbeafe';
        toast.style.color = tone === 'error' ? '#991b1b' : '#1d4ed8';
        toast.textContent = message;
        toastRegion.appendChild(toast);
        window.setTimeout(() => toast.remove(), 2400);
      }

      function getSelectedCards() {
        return cards.filter((card) => {
          const checkbox = card.querySelector('.content-checkbox');
          return Boolean(checkbox?.checked);
        });
      }

      function updateSummary() {
        if (!summaryList || !sidebarStatus) return;

        const selectedCards = getSelectedCards();
        const selectedCount = selectedCards.length;
        selectedCountNodes.forEach((node) => {
          node.textContent = '已选 ' + selectedCount + ' 条';
        });

        if (mobileSummaryButton) {
          mobileSummaryButton.textContent = '已选 ' + selectedCount + ' 条';
        }

        summaryList.replaceChildren();

        if (selectedCount === 0) {
          sidebarStatus.textContent = '还没有选择内容';
          const emptyNode = root.createElement('p');
          emptyNode.className = 'selection-empty';
          emptyNode.textContent = '从左侧内容池选择条目后，这里会实时显示结果。';
          summaryList.appendChild(emptyNode);
          return;
        }

        sidebarStatus.textContent = '已准备生成，可直接提交';
        selectedCards.slice(0, 6).forEach((card) => {
          const row = root.createElement('div');
          row.className = 'selection-row';
          const titleText = card.querySelector('strong')?.textContent?.trim()
            || card.querySelector('.content-card-html')?.textContent?.trim()
            || '未命名内容';
          row.textContent = titleText;
          summaryList.appendChild(row);
        });
      }

      function syncCardState(card) {
        const checkbox = card.querySelector('.content-checkbox');
        const selected = Boolean(checkbox?.checked);
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
      }

      function applySelectedFilter() {
        const onlySelected = Boolean(selectedFilter?.checked);
        cards.forEach((card) => {
          const isSelected = Boolean(card.querySelector('.content-checkbox')?.checked);
          card.hidden = onlySelected && !isSelected;
        });
      }

      function syncAllCards() {
        cards.forEach(syncCardState);
        updateSummary();
        applySelectedFilter();
      }

      function activateCategory(categoryId) {
        triggers.forEach((trigger) => {
          const active = trigger.dataset.categoryTrigger === categoryId;
          trigger.classList.toggle('is-active', active);
          trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          panel.classList.toggle('is-active', panel.dataset.categoryPanel === categoryId);
        });
      }

      function saveCookie() {
        if (!cookieInput || !cookiePanel) return;

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
        if (!button) return;

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
          showToast(error?.message || '抓取失败，请检查网络', 'error');
        } finally {
          button.disabled = false;
          button.textContent = originalText;
        }
      }

      form?.addEventListener('submit', (event) => {
        if (getSelectedCards().length === 0) {
          event.preventDefault();
          showToast('请至少选择一条内容后再生成', 'error');
        }
      });

      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', () => {
          syncAllCards();
        });
      });

      cards.forEach((card) => {
        card.addEventListener('click', (event) => {
          if (event.target.closest('a, button, input, label')) return;
          const checkbox = card.querySelector('.content-checkbox');
          if (!checkbox) return;
          checkbox.checked = !checkbox.checked;
          syncAllCards();
        });
      });

      triggers.forEach((trigger) => {
        trigger.addEventListener('click', () => activateCategory(trigger.dataset.categoryTrigger));
      });

      selectedFilter?.addEventListener('change', applySelectedFilter);
      root.querySelector('[data-open-cookie-panel]')?.addEventListener('click', () => {
        if (cookiePanel) cookiePanel.hidden = false;
      });
      root.querySelector('[data-close-cookie-panel]')?.addEventListener('click', () => {
        if (cookiePanel) cookiePanel.hidden = true;
      });
      root.querySelector('[data-save-cookie]')?.addEventListener('click', saveCookie);
      root.querySelector('[data-fetch-all]')?.addEventListener('click', (event) => {
        fetchLatest(event.currentTarget);
      });
      root.querySelector('[data-clear-selection]')?.addEventListener('click', () => {
        checkboxes.forEach((checkbox) => {
          checkbox.checked = false;
        });
        syncAllCards();
        showToast('已清空选择');
      });
      mobileSummaryButton?.addEventListener('click', () => {
        selectionSidebar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      const savedCookie = localStorage.getItem(cookieStorageKey);
      if (savedCookie && cookieInput) {
        cookieInput.value = savedCookie;
      }

      if (${JSON.stringify(firstCategory)}) {
        activateCategory(${JSON.stringify(firstCategory)});
      }

      syncAllCards();
    })();
  `;

  return renderDashboardPage({
    title: `${safeDisplayDate} ${safeFilterDays}天内的数据`,
    bodyClass: 'page-content-selection',
    bodyContent,
    inlineScript,
  });
}
