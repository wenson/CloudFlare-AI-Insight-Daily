import { escapeHtml, formatDateToChinese } from '../helpers.js';
import { dataSources } from '../dataFetchers.js';
import { renderDashboardPage } from './pageShell.js';
import {
  ALLOWED_CONTENT_BATCH_SIZES,
  DEFAULT_CONTENT_BATCH_SIZE,
} from '../contentSelection.js';

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

function getCategoryState(categoryId, itemCount, pageState = {}) {
  const sourceState = pageState.categoryState || pageState.categoryPagination || {};
  const raw = sourceState[categoryId] || {};
  const totalItems = Math.max(0, Number(raw.totalItems) || itemCount || 0);
  const loadedCount = Number.isFinite(Number(raw.loadedCount))
    ? Number(raw.loadedCount)
    : itemCount;
  const nextOffset = raw.nextOffset == null
    ? (loadedCount < totalItems ? loadedCount : null)
    : Number(raw.nextOffset);
  const hasMore = typeof raw.hasMore === 'boolean'
    ? raw.hasMore
    : nextOffset != null;

  return {
    totalItems,
    loadedCount,
    nextOffset,
    hasMore,
    loaded: Boolean(raw.loaded ?? itemCount > 0),
    isLoading: false,
    error: null,
  };
}

function getLinkLabel(itemType) {
  if (itemType === 'paper') {
    return '在 ArXiv/来源 阅读';
  }
  if (itemType === 'socialMedia') {
    return '查看原帖';
  }
  return '阅读更多';
}

function renderContentCard(item, index, typeRenderers, itemOffset = 0) {
  const renderer = typeRenderers[item.type];
  const html = typeof renderer === 'function'
    ? renderer(item)
    : `
      <strong>${escapeHtml(item.title || '未知内容')}</strong><br>
      <small>来源: ${escapeHtml(item.source || '未知')} | 发布日期: ${escapeHtml(item.published_date || '')}</small>
      <div class="content-html">${item.details?.content_html || '无内容。'}</div>
      <a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noopener noreferrer">${getLinkLabel(item.type)}</a>
    `;
  const itemNumber = itemOffset + index + 1;

  return `
    <article class="content-card card" data-item-card data-item-value="${escapeHtml(`${item.type}:${item.id}`)}">
      <div class="content-card-check">
        <input
          class="content-checkbox"
          type="checkbox"
          name="selectedItems"
          value="${escapeHtml(`${item.type}:${item.id}`)}"
          aria-label="选择第 ${itemNumber} 条内容"
        >
      </div>
      <div class="content-card-body">
        <div class="content-card-index">#${itemNumber}</div>
        <div class="content-card-html">${html}</div>
      </div>
    </article>`;
}

function renderBatchSizeControls(activePageSize) {
  return ALLOWED_CONTENT_BATCH_SIZES.map((size) => {
    const activeClass = size === activePageSize ? 'is-active' : '';
    return `
      <button
        type="button"
        class="chip batch-size-chip ${activeClass}"
        data-batch-size-option="${size}"
        aria-pressed="${size === activePageSize ? 'true' : 'false'}"
      >
        每批 ${size} 条
      </button>`;
  }).join('');
}

function renderCategoryStatus(categoryId, categoryState, items) {
  if (categoryState.totalItems === 0) {
    return `
      <div class="empty-panel card">
        <h3>当前分类暂无内容</h3>
        <p>可以稍后重新抓取，或切换到其他分类继续筛选。</p>
      </div>`;
  }

  const loadedCount = Math.max(items.length, categoryState.loadedCount || 0);
  const statusText = loadedCount > 0
    ? `已加载 ${loadedCount} / ${categoryState.totalItems} 条`
    : `共 ${categoryState.totalItems} 条，切换后自动加载`;

  return `
    <div class="load-more-state card" data-load-more-state="${escapeHtml(categoryId)}">
      <div class="load-more-copy">
        <p class="load-more-range">${statusText}</p>
        <p data-load-more-status="${escapeHtml(categoryId)}">${categoryState.hasMore ? '向下滚动继续加载' : '已加载全部内容'}</p>
      </div>
      <button
        type="button"
        class="button button-secondary"
        data-load-more-retry="${escapeHtml(categoryId)}"
        hidden
      >
        重试加载
      </button>
    </div>
    <div class="load-more-sentinel" data-load-more-sentinel="${escapeHtml(categoryId)}" aria-hidden="true"></div>`;
}

function renderCategoryPanel(category, items, isActive, typeRenderers, categoryState) {
  const cards = items.map((item, index) => renderContentCard(item, index, typeRenderers)).join('');
  const statusHtml = renderCategoryStatus(category.id, categoryState, items);

  return `
    <section
      id="panel-${escapeHtml(category.id)}"
      class="category-panel ${isActive ? 'is-active' : ''}"
      data-category-panel="${escapeHtml(category.id)}"
    >
      <div class="category-list" data-category-list="${escapeHtml(category.id)}">
        ${cards}
      </div>
      ${statusHtml}
    </section>`;
}

function renderArchiveLinks(archiveDays = [], todayDate = '') {
  const normalizedRows = Array.isArray(archiveDays) ? [...archiveDays] : [];
  const hasToday = todayDate
    ? normalizedRows.some((row) => row.archive_date === todayDate)
    : false;

  if (todayDate && !hasToday) {
    normalizedRows.unshift({
      archive_date: todayDate,
      total_count: 0,
      is_today_entry: true,
    });
  }

  if (!normalizedRows.length) {
    return '<p class="selection-empty">暂无历史归档内容。</p>';
  }

  return normalizedRows.map((row) => {
    const archiveDate = row.archive_date || '';
    const isTodayEntry = row.is_today_entry === true || archiveDate === todayDate;
    const primaryText = isTodayEntry
      ? '今天'
      : escapeHtml(formatDateToChinese(archiveDate));
    const secondaryText = isTodayEntry
      ? escapeHtml(formatDateToChinese(archiveDate))
      : `${Number(row.total_count) || 0} 条`;

    return `
      <a
        href="/getContentHtml?date=${encodeURIComponent(archiveDate)}&category=news&pageSize=20"
        class="archive-sidebar-link"
      >
        <span>${primaryText}</span>
        <span class="archive-sidebar-count">${secondaryText}</span>
      </a>`;
  }).join('');
}

export function generateContentSelectionPageHtml(env, dateStr, allData, dataCategories, pageState = {}) {
  const categories = Array.isArray(dataCategories) ? dataCategories : [];
  const safeData = allData || {};
  const typeRenderers = buildTypeRenderers();
  const firstCategory = categories[0]?.id ?? '';
  const initialActiveCategory = categories.some((category) => category.id === pageState.activeCategory)
    ? pageState.activeCategory
    : firstCategory;
  const initialPageSize = Number(pageState.pageSize) || DEFAULT_CONTENT_BATCH_SIZE;
  const safeDateStr = escapeHtml(dateStr);
  const safeDisplayDate = escapeHtml(formatDateToChinese(dateStr));
  const archiveLinksHtml = renderArchiveLinks(pageState.archiveDays || [], pageState.todayDate || '');
  const categoryState = {};
  const initialCategoryItems = {};
  const totalItems = Number.isFinite(Number(pageState.totalItems))
    ? Number(pageState.totalItems)
    : categories.reduce((count, category) => count + (safeData?.[category.id] || []).length, 0);

  const categoryNav = categories.map((category) => {
    const items = safeData?.[category.id] || [];
    categoryState[category.id] = getCategoryState(category.id, items.length, pageState);
    initialCategoryItems[category.id] = items;
    return `
      <button
        type="button"
        class="category-pill chip ${category.id === initialActiveCategory ? 'is-active' : ''}"
        data-category-trigger="${escapeHtml(category.id)}"
        aria-pressed="${category.id === initialActiveCategory ? 'true' : 'false'}"
      >
        <span>${escapeHtml(category.name)}</span>
        <span class="category-pill-count">${categoryState[category.id].totalItems}</span>
      </button>`;
  }).join('');

  const batchSizeControls = renderBatchSizeControls(initialPageSize);

  const panels = categories.map((category) => renderCategoryPanel(
    category,
    safeData?.[category.id] || [],
    category.id === initialActiveCategory,
    typeRenderers,
    categoryState[category.id],
  )).join('');

  const cookiePanelHtml = `
    <section class="cookie-panel card" data-cookie-panel>
      <h2>Folo Cookie 设置</h2>
      <label class="cookie-field" for="foloCookie">Folo Cookie</label>
      <input id="foloCookie" type="text" placeholder="在此输入 Folo Cookie">
      <p class="cookie-help">Cookie 将保存在浏览器本地存储中，只用于当前工作台抓取。</p>
      <div class="cookie-actions">
        <button type="button" class="button button-secondary" data-save-cookie>保存 Cookie</button>
        <button type="button" class="button button-ghost" data-close-cookie-panel>关闭</button>
      </div>
    </section>`;

  const backfillPanelHtml = `
    <section class="backfill-panel card" data-backfill-panel>
      <div class="backfill-panel-header">
        <h2>Backfill</h2>
        <p>从服务端补齐指定日期的源数据，无需浏览器 Cookie。</p>
      </div>
      <div class="backfill-panel-fields">
        <label>
          <span>开始日期</span>
          <input id="backfillStartDate" type="date" value="${safeDateStr}">
        </label>
        <label>
          <span>结束日期</span>
          <input id="backfillEndDate" type="date" value="${safeDateStr}">
        </label>
      </div>
      <div class="backfill-panel-actions">
        <button type="button" class="button button-secondary" data-run-backfill>Backfill</button>
      </div>
      <p class="backfill-panel-result" data-backfill-result aria-live="polite"></p>
    </section>`;

  const bodyContent = `
    <main class="workspace-shell workspace-shell-content">
      <form class="workspace-form" action="/genAIContent" method="POST">
        <input type="hidden" name="date" value="${safeDateStr}">
        <div data-selection-hidden-inputs hidden></div>

        <header class="workspace-status-band card">
          <div class="workspace-status-top">
            <div class="workspace-header-copy">
              <p class="workspace-kicker">AI Insight Daily</p>
              <h1>${safeDisplayDate} 内容工作台</h1>
              <p class="workspace-intro">先筛选内容，再进入日报或播客生成流程。</p>
            </div>
            <div class="workspace-primary-actions">
              <button type="button" class="button button-secondary" data-fetch-all>抓取最新数据</button>
              <button type="button" class="button button-ghost" data-toggle-advanced-actions aria-expanded="false">高级操作</button>
              <button type="submit" class="button button-primary">生成 AI 日报</button>
            </div>
          </div>
          <div class="workspace-status-metrics">
              <span class="chip status-chip">发布日期 ${safeDisplayDate}</span>
              <span class="chip status-chip">共 ${totalItems} 条候选内容</span>
              <span class="chip status-chip" data-selected-count>已选 0 条</span>
          </div>
        </header>

        <section class="workspace-toolbar workspace-toolbar-card card">
          <div class="workspace-toolbar-left">${categoryNav}</div>
          <div class="workspace-toolbar-right">
            <div class="batch-size-group" aria-label="每批加载条数">${batchSizeControls}</div>
          </div>
        </section>

        <div class="workspace-grid">
          <section class="workspace-main workspace-content-column">
            ${panels}
          </section>

          <aside class="selection-sidebar workspace-aside-column" aria-label="内容侧栏">
            <section class="selection-summary-card workspace-aside-section card" aria-label="已选内容摘要">
              <div class="selection-sidebar-header">
                <h2>已选摘要</h2>
                <p data-sidebar-status>还没有选择内容</p>
              </div>
              <div class="selection-summary-stats" data-selection-summary-stats></div>
              <div class="selection-sidebar-body selection-recent-list" data-selection-summary-list>
                <p class="selection-empty">从左侧内容池选择条目后，这里会实时显示结果。</p>
              </div>
              <div class="selection-sidebar-footer">
                <button type="button" class="button button-ghost" data-clear-selection>清空已选</button>
                <button type="submit" class="button button-primary">开始生成</button>
              </div>
            </section>

            <section class="selection-archive-card workspace-aside-section card" aria-label="内容归档">
              <div class="selection-sidebar-archive" data-selection-archive>
                <h2>内容归档</h2>
                <div class="selection-sidebar-archive-list">
                  ${archiveLinksHtml}
                </div>
              </div>
            </section>
          </aside>
        </div>

        <button type="button" class="selection-summary-mobile button button-primary" data-mobile-summary>
          已选 0 条
        </button>

        <button
          type="button"
          class="back-to-top-button button button-secondary"
          data-back-to-top
          aria-label="回到顶部"
          hidden
        >
          回到顶部
        </button>
      </form>

      <section class="advanced-actions-panel workspace-aside-section card" data-advanced-actions-panel hidden>
        <div class="advanced-actions-header">
          <h2>高级操作</h2>
          <p>Cookie 设置与 Backfill 默认收起，避免干扰主流程。</p>
        </div>
        <div class="advanced-actions-content">
          ${cookiePanelHtml}
          ${backfillPanelHtml}
        </div>
      </section>
    </main>`;

  const inlineScript = `
    (() => {
      const root = document;
      const toastRegion = root.querySelector('.app-toast-region');
      const advancedActionsPanel = root.querySelector('[data-advanced-actions-panel]');
      const advancedActionsToggle = root.querySelector('[data-toggle-advanced-actions]');
      const summaryList = root.querySelector('[data-selection-summary-list]');
      const summaryStats = root.querySelector('[data-selection-summary-stats]');
      const sidebarStatus = root.querySelector('[data-sidebar-status]');
      const selectionSidebar = root.querySelector('.selection-sidebar');
      const selectedCountNodes = root.querySelectorAll('[data-selected-count]');
      const mobileSummaryButton = root.querySelector('[data-mobile-summary]');
      const backToTopButton = root.querySelector('[data-back-to-top]');
      const cookieInput = root.querySelector('#foloCookie');
      const form = root.querySelector('.workspace-form');
      const hiddenInputsContainer = root.querySelector('[data-selection-hidden-inputs]');
      const cookieStorageKey = ${JSON.stringify(env?.FOLO_COOKIE_KV_KEY || 'folo_cookie')};
      const selectionStorageKey = ${JSON.stringify(`content-selection:${dateStr}`)};
      const requestDate = ${JSON.stringify(dateStr)};
      const initialActiveCategory = ${JSON.stringify(initialActiveCategory)};
      const initialPageSize = ${JSON.stringify(initialPageSize)};
      const allowedPageSizes = ${JSON.stringify(ALLOWED_CONTENT_BATCH_SIZES)};
      const categoryItems = ${JSON.stringify(initialCategoryItems)};
      const categoryState = ${JSON.stringify(categoryState)};
      let activeCategory = initialActiveCategory;
      let currentPageSize = initialPageSize;
      let selectedItemsMap = readSelectedItemsMap();
      let loadObserver = null;

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

      function setAdvancedActionsOpen(nextOpen) {
        if (!advancedActionsPanel || !advancedActionsToggle) return;
        advancedActionsPanel.hidden = !nextOpen;
        advancedActionsToggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
        advancedActionsToggle.textContent = nextOpen ? '收起高级操作' : '高级操作';
      }

      function readSelectedItemsMap() {
        try {
          const rawValue = localStorage.getItem(selectionStorageKey);
          if (!rawValue) return {};
          const parsed = JSON.parse(rawValue);
          return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
          return {};
        }
      }

      function writeSelectedItemsMap() {
        const entries = Object.entries(selectedItemsMap);
        if (entries.length === 0) {
          localStorage.removeItem(selectionStorageKey);
          return;
        }
        localStorage.setItem(selectionStorageKey, JSON.stringify(selectedItemsMap));
      }

      function escapeMarkup(value) {
        return String(value ?? '')
          .replaceAll('&', '&amp;')
          .replaceAll('<', '&lt;')
          .replaceAll('>', '&gt;')
          .replaceAll('"', '&quot;')
          .replaceAll("'", '&#39;');
      }

      function formatPublishedTime(dateValue) {
        if (!dateValue) return '未知时间';
        const date = new Date(dateValue);
        if (Number.isNaN(date.getTime())) return escapeMarkup(dateValue);
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        });
      }

      function getLinkLabel(itemType) {
        if (itemType === 'paper') return '在 ArXiv/来源 阅读';
        if (itemType === 'socialMedia') return '查看原帖';
        return '阅读更多';
      }

      function renderClientItemHtml(item) {
        const contentHtml = item?.details?.content_html || '无内容。';
        const linkLabel = getLinkLabel(item?.type);
        const paperSuffix = item?.type === 'paper' ? '<hr>' : '';

        return [
          '<strong>' + escapeMarkup(item?.title || '未知内容') + '</strong><br>',
          '<small>来源: ' + escapeMarkup(item?.source || '未知') + ' | 发布日期: ' + formatPublishedTime(item?.published_date) + '</small>',
          '<div class="content-html">' + contentHtml + paperSuffix + '</div>',
          '<a href="' + escapeMarkup(item?.url || '#') + '" target="_blank" rel="noopener noreferrer">' + linkLabel + '</a>',
        ].join('');
      }

      function renderCardMarkup(item, index, itemOffset) {
        const itemNumber = itemOffset + index + 1;
        const value = escapeMarkup((item?.type || 'unknown') + ':' + (item?.id || ''));

        return [
          '<article class="content-card card" data-item-card data-item-value="' + value + '">',
          '<div class="content-card-check">',
          '<input class="content-checkbox" type="checkbox" name="selectedItems" value="' + value + '" aria-label="选择第 ' + itemNumber + ' 条内容">',
          '</div>',
          '<div class="content-card-body">',
          '<div class="content-card-index">#' + itemNumber + '</div>',
          '<div class="content-card-html">' + renderClientItemHtml(item) + '</div>',
          '</div>',
          '</article>',
        ].join('');
      }

      function getAllCards() {
        return Array.from(root.querySelectorAll('[data-item-card]'));
      }

      function getCardValue(card) {
        return card?.dataset?.itemValue || '';
      }

      function getCardLabel(card) {
        return card?.querySelector('strong')?.textContent?.trim()
          || card?.querySelector('.content-card-html')?.textContent?.trim()
          || getCardValue(card)
          || '未命名内容';
      }

      function summarizeSelectedTypes(entries) {
        const counts = { news: 0, paper: 0, socialMedia: 0 };
        entries.forEach(([value]) => {
          const type = String(value).split(':')[0];
          if (counts[type] != null) counts[type] += 1;
        });
        return '新闻 ' + counts.news + ' / 论文 ' + counts.paper + ' / 社媒 ' + counts.socialMedia;
      }

      function syncHiddenInputs() {
        if (!hiddenInputsContainer) return;
        hiddenInputsContainer.replaceChildren();
        Object.keys(selectedItemsMap).forEach((value) => {
          const input = root.createElement('input');
          input.type = 'hidden';
          input.name = 'selectedItems';
          input.value = value;
          hiddenInputsContainer.appendChild(input);
        });
      }

      function updateSummary() {
        if (!sidebarStatus) return;

        const selectedEntries = Object.entries(selectedItemsMap);
        const selectedCount = selectedEntries.length;

        selectedCountNodes.forEach((node) => {
          node.textContent = '已选 ' + selectedCount + ' 条';
        });

        if (mobileSummaryButton) {
          mobileSummaryButton.textContent = '已选 ' + selectedCount + ' 条';
        }

        if (summaryStats) {
          summaryStats.innerHTML = selectedCount === 0
            ? '<div class="selection-stat-empty">尚未选择内容</div>'
            : [
                '<div class="selection-stat"><strong>' + selectedCount + ' 条</strong><span>总已选</span></div>',
                '<div class="selection-stat"><strong>' + summarizeSelectedTypes(selectedEntries) + '</strong><span>分类分布</span></div>',
              ].join('');
        }

        if (!summaryList) return;
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
        selectedEntries.slice(0, 6).forEach(([, label]) => {
          const row = root.createElement('div');
          row.className = 'selection-row';
          row.textContent = label || '未命名内容';
          summaryList.appendChild(row);
        });
      }

      function syncCardState(card) {
        const value = getCardValue(card);
        const checkbox = card.querySelector('.content-checkbox');
        const selected = Boolean(value && selectedItemsMap[value]);
        if (checkbox) {
          checkbox.checked = selected;
        }
        card.classList.toggle('is-selected', selected);
        card.setAttribute('aria-selected', selected ? 'true' : 'false');
      }

      function syncAllCards() {
        getAllCards().forEach(syncCardState);
        syncHiddenInputs();
        updateSummary();
      }

      function setCardSelection(card, selected) {
        const value = getCardValue(card);
        if (!value) return;

        if (selected) {
          selectedItemsMap[value] = getCardLabel(card);
        } else {
          delete selectedItemsMap[value];
        }

        writeSelectedItemsMap();
        syncAllCards();
      }

      function updateBatchSizeButtons() {
        root.querySelectorAll('[data-batch-size-option]').forEach((button) => {
          const active = Number(button.dataset.batchSizeOption) === currentPageSize;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      }

      function syncBackToTopVisibility() {
        if (!backToTopButton) return;
        backToTopButton.hidden = window.scrollY < 280;
      }

      function updateUrl() {
        const params = new URLSearchParams({
          date: requestDate,
          category: activeCategory,
          pageSize: String(currentPageSize),
        });
        history.replaceState(null, '', '/getContentHtml?' + params.toString());
      }

      function getCategoryListNode(categoryId) {
        return root.querySelector('[data-category-list="' + categoryId + '"]');
      }

      function getLoadStatusNode(categoryId) {
        return root.querySelector('[data-load-more-status="' + categoryId + '"]');
      }

      function getRetryButtonNode(categoryId) {
        return root.querySelector('[data-load-more-retry="' + categoryId + '"]');
      }

      function getSentinelNode(categoryId) {
        return root.querySelector('[data-load-more-sentinel="' + categoryId + '"]');
      }

      function renderCategoryList(categoryId) {
        const listNode = getCategoryListNode(categoryId);
        if (!listNode) return;

        const items = categoryItems[categoryId] || [];
        const totalItems = categoryState[categoryId]?.totalItems || 0;

        if (items.length === 0 && totalItems === 0) {
          listNode.innerHTML = '<div class="empty-panel card"><h3>当前分类暂无内容</h3><p>可以稍后重新抓取，或切换到其他分类继续筛选。</p></div>';
          syncAllCards();
          return;
        }

        if (items.length === 0) {
          listNode.innerHTML = '';
          syncAllCards();
          return;
        }

        listNode.innerHTML = items.map((item, index) => renderCardMarkup(item, index, 0)).join('');
        syncAllCards();
      }

      function renderCategoryStatus(categoryId) {
        const meta = categoryState[categoryId];
        const items = categoryItems[categoryId] || [];
        const loadedCount = items.length;
        const statusNode = getLoadStatusNode(categoryId);
        const retryButton = getRetryButtonNode(categoryId);
        const sentinel = getSentinelNode(categoryId);
        const stateCard = root.querySelector('[data-load-more-state="' + categoryId + '"]');

        if (!meta || !statusNode || !retryButton || !sentinel || !stateCard) return;

        if (meta.totalItems === 0) {
          stateCard.hidden = true;
          sentinel.hidden = true;
          return;
        }

        stateCard.hidden = false;
        stateCard.querySelector('.load-more-range').textContent = '已加载 ' + loadedCount + ' / ' + meta.totalItems + ' 条';

        if (meta.error) {
          statusNode.textContent = meta.error;
          retryButton.hidden = false;
          sentinel.hidden = true;
          return;
        }

        retryButton.hidden = true;
        if (meta.isLoading) {
          statusNode.textContent = '加载中...';
          sentinel.hidden = false;
          return;
        }

        if (meta.hasMore) {
          statusNode.textContent = '向下滚动继续加载';
          sentinel.hidden = false;
          return;
        }

        statusNode.textContent = '已加载全部内容';
        sentinel.hidden = true;
      }

      function renderCategory(categoryId) {
        renderCategoryList(categoryId);
        renderCategoryStatus(categoryId);
      }

      function activateCategory(categoryId) {
        activeCategory = categoryId;
        root.querySelectorAll('[data-category-trigger]').forEach((trigger) => {
          const active = trigger.dataset.categoryTrigger === categoryId;
          trigger.classList.toggle('is-active', active);
          trigger.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        root.querySelectorAll('[data-category-panel]').forEach((panel) => {
          panel.classList.toggle('is-active', panel.dataset.categoryPanel === categoryId);
        });
        updateUrl();

        const meta = categoryState[categoryId];
        if (meta && !meta.loaded && meta.totalItems > 0) {
          void loadCategoryBatch(categoryId, { reset: true });
        } else {
          renderCategoryStatus(categoryId);
          syncAllCards();
        }
      }

      function resetCategoryCaches(nextPageSize) {
        Object.keys(categoryItems).forEach((categoryId) => {
          categoryItems[categoryId] = [];
          const totalItems = categoryState[categoryId]?.totalItems || 0;
          categoryState[categoryId] = {
            totalItems,
            loadedCount: 0,
            nextOffset: totalItems > 0 ? 0 : null,
            hasMore: totalItems > 0,
            loaded: false,
            isLoading: false,
            error: null,
          };
          renderCategory(categoryId);
        });
        currentPageSize = nextPageSize;
        updateBatchSizeButtons();
        updateUrl();
      }

      async function loadCategoryBatch(categoryId, { reset = false } = {}) {
        const meta = categoryState[categoryId];
        if (!meta || meta.isLoading) return;
        if (!reset && !meta.hasMore) return;

        const offset = reset ? 0 : (meta.nextOffset || 0);
        meta.isLoading = true;
        meta.error = null;
        renderCategoryStatus(categoryId);

        try {
          const params = new URLSearchParams({
            date: requestDate,
            category: categoryId,
            offset: String(offset),
            limit: String(currentPageSize),
          });
          const response = await fetch('/getContentPage?' + params.toString());

          if (!response.ok) {
            throw new Error('加载失败，请稍后重试');
          }

          const payload = await response.json();
          const incomingItems = Array.isArray(payload.items) ? payload.items : [];
          categoryItems[categoryId] = reset
            ? incomingItems
            : (categoryItems[categoryId] || []).concat(incomingItems);
          categoryState[categoryId] = {
            totalItems: Number(payload.totalItems) || 0,
            loadedCount: categoryItems[categoryId].length,
            nextOffset: payload.nextOffset == null ? null : Number(payload.nextOffset),
            hasMore: Boolean(payload.hasMore),
            loaded: true,
            isLoading: false,
            error: null,
          };
          renderCategory(categoryId);
        } catch (error) {
          meta.isLoading = false;
          meta.error = error?.message || '加载失败，请稍后重试';
          renderCategoryStatus(categoryId);
        }
      }

      function saveCookie() {
        if (!cookieInput) return;

        const value = cookieInput.value.trim();
        if (!value) {
          showToast('Folo Cookie 不能为空', 'error');
          cookieInput.focus();
          return;
        }

        localStorage.setItem(cookieStorageKey, value);
        showToast('Cookie 已保存');
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

      const backfillButton = root.querySelector('[data-run-backfill]');
      const backfillResultNode = root.querySelector('[data-backfill-result]');
      const backfillStartInput = root.querySelector('#backfillStartDate');
      const backfillEndInput = root.querySelector('#backfillEndDate');

      async function executeBackfill() {
        if (!backfillButton) return;

        const startValue = backfillStartInput?.value?.trim();
        const endValue = backfillEndInput?.value?.trim();
        if (!startValue || !endValue) {
          showToast('请填写起始与结束日期', 'error');
          return;
        }

        const originalText = backfillButton.textContent;
        backfillButton.disabled = true;
        backfillButton.dataset.loading = 'true';
        backfillButton.textContent = '补数中...';
        if (backfillResultNode) {
          backfillResultNode.textContent = '请求中...';
        }

        try {
          const response = await fetch('/backfillData', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ startDate: startValue, endDate: endValue }),
          });

          if (!response.ok) {
            let errorPayload = {};
            try {
              errorPayload = await response.json();
            } catch {
              // ignore parse errors
            }
            const message = errorPayload.message || '补数遇到问题';
            showToast(message, 'error');
            if (backfillResultNode) {
              backfillResultNode.textContent = message;
            }
            return;
          }

          let payload = {};
          try {
            payload = await response.json();
          } catch (error) {
            const message = '补数响应格式异常，请重新登录后再试';
            showToast(message, 'error');
            if (backfillResultNode) {
              backfillResultNode.textContent = message;
            }
            return;
          }

          const summary = payload?.summary || {};
          const hasBackfillIssues = payload?.success !== true
            || Number(summary.partialFailureDays) > 0
            || Number(summary.failedDays) > 0;
          const summaryText =
            (hasBackfillIssues ? '补数结束：' : '补数完成：') +
            (summary.successDays ?? 0) +
            ' 天成功，' +
            (summary.partialFailureDays ?? 0) +
            ' 天部分失败，' +
            (summary.failedDays ?? 0) +
            ' 天失败';

          showToast(summaryText, hasBackfillIssues ? 'error' : 'info');
          if (backfillResultNode) {
            backfillResultNode.textContent = summaryText;
          }
        } catch (error) {
          const message = error?.message || '补数请求失败';
          showToast(message, 'error');
          if (backfillResultNode) {
            backfillResultNode.textContent = '补数失败：' + message;
          }
        } finally {
          backfillButton.disabled = false;
          backfillButton.dataset.loading = 'false';
          backfillButton.textContent = originalText;
        }
      }

      form?.addEventListener('submit', (event) => {
        if (Object.keys(selectedItemsMap).length === 0) {
          event.preventDefault();
          showToast('请至少选择一条内容后再生成', 'error');
          return;
        }
        syncHiddenInputs();
      });

      root.addEventListener('change', (event) => {
        const checkbox = event.target.closest('.content-checkbox');
        if (!checkbox) return;
        const card = checkbox.closest('[data-item-card]');
        if (!card) return;
        setCardSelection(card, checkbox.checked);
      });

      root.addEventListener('click', (event) => {
        const advancedToggle = event.target.closest('[data-toggle-advanced-actions]');
        if (advancedToggle) {
          const nextOpen = advancedActionsPanel?.hidden ?? true;
          setAdvancedActionsOpen(nextOpen);
          return;
        }

        const batchButton = event.target.closest('[data-batch-size-option]');
        if (batchButton) {
          const nextPageSize = Number(batchButton.dataset.batchSizeOption);
          if (!allowedPageSizes.includes(nextPageSize) || nextPageSize === currentPageSize) {
            return;
          }
          resetCategoryCaches(nextPageSize);
          void loadCategoryBatch(activeCategory, { reset: true });
          return;
        }

        const categoryTrigger = event.target.closest('[data-category-trigger]');
        if (categoryTrigger) {
          activateCategory(categoryTrigger.dataset.categoryTrigger);
          return;
        }

        const retryButton = event.target.closest('[data-load-more-retry]');
        if (retryButton) {
          void loadCategoryBatch(retryButton.dataset.loadMoreRetry, { reset: false });
          return;
        }

        const card = event.target.closest('[data-item-card]');
        if (card && !event.target.closest('a, button, input, label')) {
          const checkbox = card.querySelector('.content-checkbox');
          if (!checkbox) return;
          checkbox.checked = !checkbox.checked;
          setCardSelection(card, checkbox.checked);
        }
      });

      root.querySelector('[data-close-cookie-panel]')?.addEventListener('click', () => {
        setAdvancedActionsOpen(false);
      });
      root.querySelector('[data-save-cookie]')?.addEventListener('click', saveCookie);
      root.querySelector('[data-fetch-all]')?.addEventListener('click', (event) => {
        fetchLatest(event.currentTarget);
      });
      backfillButton?.addEventListener('click', (event) => {
        event.preventDefault();
        void executeBackfill();
      });
      root.querySelector('[data-clear-selection]')?.addEventListener('click', () => {
        selectedItemsMap = {};
        writeSelectedItemsMap();
        syncAllCards();
        showToast('已清空选择');
      });
      mobileSummaryButton?.addEventListener('click', () => {
        selectionSidebar?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      backToTopButton?.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      window.addEventListener('scroll', syncBackToTopVisibility, { passive: true });

      if ('IntersectionObserver' in window) {
        loadObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const categoryId = entry.target.dataset.loadMoreSentinel;
            if (categoryId !== activeCategory) return;
            void loadCategoryBatch(categoryId);
          });
        }, {
          rootMargin: '200px 0px 240px 0px',
        });

        root.querySelectorAll('[data-load-more-sentinel]').forEach((sentinel) => {
          loadObserver.observe(sentinel);
        });
      }

      const savedCookie = localStorage.getItem(cookieStorageKey);
      if (savedCookie && cookieInput) {
        cookieInput.value = savedCookie;
      }

      setAdvancedActionsOpen(false);
      updateBatchSizeButtons();
      Object.keys(categoryItems).forEach((categoryId) => renderCategoryStatus(categoryId));
      activateCategory(initialActiveCategory);
      syncBackToTopVisibility();
      syncAllCards();
    })();
  `;

  return renderDashboardPage({
    title: `${safeDisplayDate} 当天的数据`,
    bodyClass: 'page-content-selection',
    bodyContent,
    inlineScript,
  });
}
