import { formatDateToChinese, convertEnglishQuotesToChinese, replaceImageProxy } from '../helpers.js';
import { marked } from '../marked.esm.js';
import { renderDashboardPage } from './pageShell.js';

function escapeMarkup(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\'':
        return '&#39;';
      default:
        return char;
    }
  });
}

function isDailyReportPage(title) {
  return String(title || '').includes('AI日报');
}

function isPodcastPage(title) {
  return String(title || '').includes('AI播客');
}

function escapeRawHtmlInMarkdown(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function sanitizePreviewHtml(renderedHtml) {
  return String(renderedHtml ?? '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\b(href|src)\s*=\s*(["'])(.*?)\2/gi, (fullMatch, attribute, quote, rawValue) => {
      const normalized = String(rawValue)
        .replace(/[\u0000-\u001F\u007F\s]+/g, '')
        .toLowerCase();

      if (
        normalized.startsWith('javascript:')
        || normalized.startsWith('vbscript:')
        || normalized.startsWith('data:text/html')
      ) {
        return `${attribute}=${quote}#${quote}`;
      }

      return `${attribute}=${quote}${rawValue}${quote}`;
    });
}

function renderHiddenFields(pageDate, selectedItems, extraFields = '') {
  return `
    <input type="hidden" name="date" value="${escapeMarkup(pageDate)}">
    ${selectedItems.map((item) => `<input type="hidden" name="selectedItems" value="${escapeMarkup(item)}">`).join('')}
    ${extraFields}`;
}

function renderActionForm(action, pageDate, selectedItems, extraFields, label, tone = 'secondary') {
  return `
    <form action="${escapeMarkup(action)}" method="POST">
      ${renderHiddenFields(pageDate, selectedItems, extraFields)}
      <button type="submit" class="button ${tone === 'primary' ? 'button-primary' : 'button-secondary'}">${escapeMarkup(label)}</button>
    </form>`;
}

function renderPromptPanel(title, systemPrompt, userPrompt, promptId) {
  if (!systemPrompt && !userPrompt) {
    return '';
  }

  return `
    <section class="prompt-panel report-sidebar-section card">
      <div class="prompt-panel-header">
        <h3>${escapeMarkup(title)}</h3>
        <button
          type="button"
          class="button button-ghost"
          data-toggle-prompt="${escapeMarkup(promptId)}"
          aria-expanded="false"
        >
          展开提示
        </button>
      </div>
      <div id="${escapeMarkup(promptId)}" class="prompt-panel-body" hidden>
        <div>
          <h4>系统指令</h4>
          <pre>${escapeMarkup(systemPrompt || '无')}</pre>
        </div>
        <div>
          <h4>用户输入</h4>
          <pre>${escapeMarkup(userPrompt || '无')}</pre>
        </div>
      </div>
    </section>`;
}

function normalizeOptionalPrompt(value) {
  if (value == null || value === '') {
    return null;
  }

  return convertEnglishQuotesToChinese(value);
}

function renderActionRail({
  title,
  pageDate,
  isErrorPage,
  selectedItems,
  bodyContent,
  dailyMd,
  podcastMd,
}) {
  const actions = [];
  const showAnalysisAction = isDailyReportPage(title) && !isErrorPage;

  if (isDailyReportPage(title) && selectedItems.length > 0) {
    actions.push(
      renderActionForm(
        '/genAIContent',
        pageDate,
        selectedItems,
        '',
        isErrorPage ? '重试生成日报' : '重新生成日报',
      ),
    );
  }

  if (isPodcastPage(title) && selectedItems.length > 0 && dailyMd) {
    actions.push(
      renderActionForm(
        '/genAIPodcastScript',
        pageDate,
        selectedItems,
        `<textarea name="summarizedContent" hidden>${escapeMarkup(convertEnglishQuotesToChinese(dailyMd))}</textarea>`,
        isErrorPage ? '重试播客脚本' : '重新生成播客脚本',
      ),
    );
  }

  if (isDailyReportPage(title) && !isErrorPage && podcastMd === null) {
    actions.push(
      renderActionForm(
        '/genAIPodcastScript',
        pageDate,
        selectedItems,
        `<textarea name="summarizedContent" hidden>${escapeMarkup(convertEnglishQuotesToChinese(bodyContent))}</textarea>`,
        '生成播客脚本',
        'primary',
      ),
    );
  }

  return `
    <section class="report-rail report-sidebar-section card">
      <h2>操作台</h2>
      <p class="report-action-note">页面内操作都通过非阻塞提示反馈当前状态，不会打断阅读流程。</p>
      <div class="report-action-list">
        ${actions.join('')}
        <button
          type="button"
          class="button button-secondary"
          data-run-analysis
          data-date="${escapeMarkup(pageDate)}"
          ${showAnalysisAction ? '' : 'disabled'}
        >
          AI 日报分析
        </button>
        <button type="button" class="button button-secondary" data-open-preview>
          预览排版
        </button>
        <a href="/getContentHtml?date=${encodeURIComponent(pageDate || '')}" class="button button-ghost">
          返回内容选择
        </a>
      </div>
    </section>`;
}

function renderAnalysisPanel(title, isErrorPage) {
  let description = '点击“AI 日报分析”后，这里会补充风险、机会和后续观察点。';

  if (!isDailyReportPage(title)) {
    description = '分析面板保留在结果页中；日报结果生成后可在这里继续追加解读。';
  } else if (isErrorPage) {
    description = '当前页面是错误态，可先返回调整内容后再发起分析。';
  }

  return `
    <section class="analysis-panel report-sidebar-section card">
      <h2>分析面板</h2>
      <p>${escapeMarkup(description)}</p>
      <pre class="analysis-panel-output" id="dailyAnalysisResult">等待新的分析结果...</pre>
    </section>`;
}

export function generateGenAiPageHtml(
  env,
  title,
  bodyContent,
  pageDate,
  isErrorPage = false,
  selectedItemsForAction = null,
  systemP1 = null,
  userP1 = null,
  systemP2 = null,
  userP2 = null,
  promptsMd = null,
  dailyMd = null,
  podcastMd = null,
) {
  const selectedItems = Array.isArray(selectedItemsForAction) ? selectedItemsForAction : [];
  const safeTitle = escapeMarkup(title || 'AI Report');
  const safeBodyContent = String(bodyContent ?? '');
  const previewMarkdown = replaceImageProxy(
    env?.IMG_PROXY || '',
    escapeRawHtmlInMarkdown(safeBodyContent),
  );
  const renderedMarkdown = sanitizePreviewHtml(marked.parse(previewMarkdown));
  const formattedDate = escapeMarkup(formatDateToChinese(pageDate || '') || pageDate || '');
  const dailyPromptPanel = isDailyReportPage(title)
    ? renderPromptPanel(
        '日报提示词',
        normalizeOptionalPrompt(systemP1),
        normalizeOptionalPrompt(userP1),
        'prompt-call-1',
      )
    : '';
  const podcastPromptPanel = isPodcastPage(title)
    ? renderPromptPanel(
        '播客提示词',
        normalizeOptionalPrompt(systemP2),
        normalizeOptionalPrompt(userP2),
        'prompt-call-2',
      )
    : '';
  const promptArchivePanel = promptsMd
    ? `
      <section class="prompt-panel report-sidebar-section card">
        <div class="prompt-panel-header">
          <h3>调用记录</h3>
          <button
            type="button"
            class="button button-ghost"
            data-toggle-prompt="prompt-archive"
            aria-expanded="false"
          >
            展开提示
          </button>
        </div>
        <div id="prompt-archive" class="prompt-panel-body" hidden>
          <pre>${escapeMarkup(promptsMd)}</pre>
        </div>
      </section>`
    : '';

  const bodyMarkup = `
    <main class="report-layout">
      <header class="report-page-hero card">
        <div class="report-header">
          <div class="report-header-copy">
            <p class="workspace-kicker">AI Insight Daily</p>
            <h1>${safeTitle}</h1>
            <div class="workspace-meta report-hero-metadata">
              <span class="chip">日期 ${formattedDate}</span>
              <span class="chip">${selectedItems.length} 条来源</span>
              <span class="chip">${isErrorPage ? '生成失败' : '已生成'}</span>
            </div>
          </div>
          <div class="report-header-actions">
            <span class="chip">结果工作区</span>
          </div>
        </div>
      </header>

      <div class="report-grid">
        <article class="report-reader report-reader-shell card">
          <pre class="report-reader-markdown">${escapeMarkup(safeBodyContent)}</pre>
          <div class="report-reader-rendered" data-preview-pane hidden>${renderedMarkdown}</div>
        </article>

        <aside class="report-actions">
          ${renderActionRail({
            title,
            pageDate,
            isErrorPage,
            selectedItems,
            bodyContent: safeBodyContent,
            dailyMd,
            podcastMd,
          })}
          ${renderAnalysisPanel(title, isErrorPage)}
          ${dailyPromptPanel}
          ${podcastPromptPanel}
          ${promptArchivePanel}
        </aside>
      </div>
    </main>`;

  const inlineScript = `
    (() => {
      const root = document;
      const toastRegion = root.querySelector('.app-toast-region');
      const previewButton = root.querySelector('[data-open-preview]');
      const analysisButton = root.querySelector('[data-run-analysis]');
      const previewPane = root.querySelector('[data-preview-pane]');
      const readerMarkdown = root.querySelector('.report-reader-markdown');
      const analysisOutput = root.querySelector('#dailyAnalysisResult');

      function setAnalysisOutput(message) {
        if (analysisOutput) {
          analysisOutput.textContent = message;
        }
      }

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

      root.querySelectorAll('[data-toggle-prompt]').forEach((button) => {
        button.addEventListener('click', () => {
          const panel = root.getElementById(button.dataset.togglePrompt);
          if (!panel) return;

          const willOpen = panel.hidden;
          panel.hidden = !panel.hidden;
          button.textContent = willOpen ? '收起提示' : '展开提示';
          button.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
          showToast(willOpen ? '已展开提示详情' : '已收起提示详情');
        });
      });

      previewButton?.addEventListener('click', () => {
        if (!previewPane || !readerMarkdown) return;

        const showPreview = previewPane.hidden;
        previewPane.hidden = !showPreview;
        readerMarkdown.hidden = showPreview;
        previewButton.textContent = showPreview ? '查看原稿' : '预览排版';
        showToast(showPreview ? '已切换到排版预览' : '已切换到原稿视图');
      });

      analysisButton?.addEventListener('click', async () => {
        const date = analysisButton.dataset.date;
        const summarizedContent = readerMarkdown?.textContent || '';
        if (!summarizedContent.trim()) {
          showToast('当前页面没有可分析的摘要', 'error');
          return;
        }

        const originalLabel = analysisButton.textContent;
        analysisButton.disabled = true;
        analysisButton.textContent = '分析中...';
        setAnalysisOutput('正在请求新的分析结果...');

        try {
          const response = await fetch('/genAIDailyAnalysis', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, summarizedContent }),
          });

          const resultText = await response.text();
          if (!response.ok) {
            setAnalysisOutput(resultText || 'AI 日报分析失败。');
            showToast('AI 日报分析失败', 'error');
            return;
          }

          setAnalysisOutput(resultText || '分析已完成，但没有返回额外内容。');
          showToast('AI 日报分析已更新');
        } catch (error) {
          setAnalysisOutput('请求失败，请稍后重试。');
          showToast('请求失败，请稍后重试', 'error');
        } finally {
          analysisButton.disabled = false;
          analysisButton.textContent = originalLabel;
        }
      });
    })();
  `;

  return renderDashboardPage({
    title: safeTitle,
    bodyClass: 'page-report',
    bodyContent: bodyMarkup,
    inlineScript,
  });
}
