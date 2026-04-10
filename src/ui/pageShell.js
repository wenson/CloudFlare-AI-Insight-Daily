export function renderToastRegion() {
  return '<div class="app-toast-region" aria-live="polite" aria-atomic="true"></div>';
}

export function getDashboardStyles() {
  return `
    :root {
      --bg: #f4f6f3;
      --bg-accent: linear-gradient(135deg, #f7fbff 0%, #eef4ff 52%, #f7f5ed 100%);
      --surface: #f9fafb;
      --surface-strong: #ffffff;
      --surface-muted: #f4f7fb;
      --border: #d8e1eb;
      --border-strong: #c6d3e1;
      --text: #182131;
      --muted: #5d6878;
      --primary: #2558d9;
      --primary-soft: #e7efff;
      --accent: #b7791f;
      --accent-soft: #fff1d6;
      --success: #15803d;
      --danger: #b91c1c;
      --shadow-sm: 0 10px 24px rgba(15, 23, 42, 0.04);
      --shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
      --radius-lg: 20px;
      --radius-md: 14px;
      --radius-sm: 10px;
      --max-width: 1440px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body {
      background: var(--bg-accent);
      color: var(--text);
      font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.6;
    }
    .app-shell {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    .app-toast-region {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 1000;
      display: grid;
      gap: 8px;
      pointer-events: none;
    }
    .card {
      background: var(--surface-strong);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--muted);
      font-size: 14px;
      font-weight: 600;
    }
    .button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
    }
    .button:hover { transform: translateY(-1px); }
    .button:disabled {
      cursor: wait;
      opacity: 0.7;
      transform: none;
    }
    .button:focus-visible { outline: 3px solid rgba(37, 88, 217, 0.28); outline-offset: 2px; }
    .button-primary {
      background: var(--primary);
      color: #fff;
    }
    .button-secondary {
      background: var(--surface-strong);
      border-color: var(--border);
      color: var(--text);
    }
    .button-ghost {
      background: transparent;
      border-color: var(--border);
      color: var(--muted);
    }
    .workspace-shell, .report-layout { display: grid; gap: 20px; }
    .workspace-status-band,
    .report-page-hero {
      display: grid;
      gap: 18px;
      padding: 24px;
      background: var(--bg-accent);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
    }
    .workspace-section-card,
    .workspace-aside-section,
    .report-sidebar-section,
    .advanced-actions-panel,
    .report-reader-shell {
      background: var(--surface-strong);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }
    .workspace-header, .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px;
    }
    .workspace-kicker {
      margin: 0 0 8px;
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .workspace-header-copy h1, .report-header-copy h1 {
      margin: 0;
      font-size: clamp(1.8rem, 2vw + 1rem, 2.5rem);
      line-height: 1.1;
    }
    .workspace-status-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
    }
    .workspace-status-band .workspace-header-copy {
      display: grid;
      gap: 10px;
      min-width: 0;
      flex: 1 1 420px;
    }
    .workspace-intro {
      margin: 0;
      max-width: 60ch;
      color: var(--muted);
    }
    .workspace-primary-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      flex: 0 1 auto;
    }
    .workspace-status-metrics {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
    }
    .status-chip {
      background: rgba(255, 255, 255, 0.78);
      border-color: rgba(198, 211, 225, 0.95);
      color: var(--text);
    }
    .workspace-actions, .report-header-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    .workspace-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    .workspace-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
    }
    .workspace-toolbar-left {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .workspace-toolbar-right {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .batch-size-group {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      justify-content: flex-end;
    }
    .batch-size-chip {
      cursor: pointer;
      transition: background-color 180ms ease, border-color 180ms ease, color 180ms ease;
    }
    .batch-size-chip.is-active {
      background: var(--primary-soft);
      border-color: #93c5fd;
      color: #1d4ed8;
    }
    .workspace-grid, .report-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      align-items: start;
    }
    .archive-list {
      display: grid;
      gap: 16px;
    }
    .archive-card {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px;
    }
    .archive-card h2 {
      margin: 0;
      font-size: 1.4rem;
      line-height: 1.15;
    }
    .archive-card-copy {
      display: grid;
      gap: 10px;
    }
    .archive-card-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
    }
    .workspace-main, .report-actions { display: grid; gap: 16px; }
    .category-panel { display: none; gap: 16px; }
    .category-panel.is-active { display: grid; }
    .category-list {
      display: grid;
      gap: 16px;
    }
    .load-more-state {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 16px 20px;
    }
    .load-more-copy {
      display: grid;
      gap: 4px;
    }
    .load-more-copy p {
      margin: 0;
    }
    .load-more-range {
      font-weight: 700;
      color: var(--text);
    }
    .load-more-sentinel {
      height: 1px;
      width: 100%;
    }
    .load-more-state p[data-load-more-status] {
      color: var(--muted);
      font-size: 14px;
    }
    .content-card {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: 16px;
      padding: 20px;
      cursor: pointer;
      transition: border-color 180ms ease, transform 180ms ease, background-color 180ms ease;
    }
    .content-card:hover { transform: translateY(-1px); border-color: #bfd0ff; }
    .content-card.is-selected { background: #eff6ff; border-color: #93c5fd; }
    .content-card-index { font-size: 12px; font-weight: 700; color: var(--accent); margin-bottom: 8px; }
    .selection-sidebar {
      display: grid;
      gap: 16px;
    }
    .selection-summary-stats {
      display: grid;
      gap: 10px;
      margin-top: 12px;
    }
    .selection-stat {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    .selection-stat-empty {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
    }
    .selection-stat strong {
      color: var(--text);
      font-size: 14px;
      line-height: 1.3;
    }
    .selection-stat span {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .selection-stat-empty {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }
    .selection-recent-list {
      display: grid;
      gap: 8px;
      max-height: 260px;
      overflow: auto;
      padding-right: 2px;
    }
    .selection-summary-card,
    .selection-archive-card,
    .analysis-panel,
    .prompt-panel,
    .cookie-panel { padding: 20px; }
    .advanced-actions-panel {
      display: grid;
      gap: 18px;
      padding: 20px;
    }
    .advanced-actions-header,
    .advanced-actions-content,
    .backfill-panel,
    .backfill-panel-header {
      display: grid;
      gap: 12px;
    }
    .advanced-actions-header h2,
    .backfill-panel-header h2,
    .cookie-panel h2 {
      margin: 0;
    }
    .advanced-actions-header p,
    .backfill-panel-header p,
    .cookie-help,
    .backfill-panel-result {
      margin: 0;
      color: var(--muted);
    }
    .advanced-actions-content {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    .backfill-panel {
      padding: 20px;
    }
    .backfill-panel-fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .backfill-panel-fields label,
    .cookie-field {
      display: grid;
      gap: 8px;
      color: var(--text);
      font-weight: 600;
    }
    .backfill-panel-fields span {
      font-size: 14px;
    }
    .cookie-panel input,
    .backfill-panel input {
      min-height: 44px;
      width: 100%;
      padding: 0 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
    .backfill-panel-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .report-rail {
      display: grid;
      gap: 16px;
      padding: 20px;
    }
    .report-action-list,
    .report-action-list form {
      display: grid;
      gap: 12px;
    }
    .report-action-list form { margin: 0; }
    .report-action-list .button { width: 100%; }
    .report-action-note,
    .analysis-panel p {
      margin: 0;
      color: var(--muted);
    }
    .selection-sidebar-footer, .cookie-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .selection-sidebar-archive {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }
    .selection-sidebar-archive h3 {
      margin: 0;
      font-size: 14px;
    }
    .selection-sidebar-archive-list {
      display: grid;
      gap: 8px;
    }
    .archive-sidebar-link {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      color: var(--text);
      text-decoration: none;
      transition: border-color 180ms ease, transform 180ms ease, background-color 180ms ease;
    }
    .archive-sidebar-link:hover {
      border-color: #bfd0ff;
      background: #f8fbff;
      transform: translateY(-1px);
    }
    .archive-sidebar-count {
      color: var(--muted);
      font-size: 12px;
      white-space: nowrap;
    }
    .back-to-top-button {
      position: fixed;
      right: 20px;
      bottom: 20px;
      z-index: 120;
      box-shadow: var(--shadow);
    }
    .selection-summary-mobile { display: none; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 100; }
    .report-reader {
      display: grid;
      gap: 16px;
      padding: 28px;
    }
    .report-reader-markdown,
    .analysis-panel-output {
      margin: 0;
      padding: 18px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: #f8fafc;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 13px;
      line-height: 1.7;
    }
    .report-reader-rendered { display: grid; gap: 16px; }
    .report-reader-rendered img, .report-reader-rendered video { max-width: 100%; height: auto; }
    .report-reader-rendered blockquote {
      margin: 0;
      padding-left: 16px;
      border-left: 4px solid #cbd5f5;
      color: var(--muted);
    }
    .analysis-panel {
      display: grid;
      gap: 12px;
    }
    .analysis-panel h2,
    .prompt-panel h3,
    .report-rail h2 {
      margin: 0;
    }
    .prompt-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .prompt-panel-body {
      display: grid;
      gap: 12px;
    }
    .prompt-panel-body h4 {
      margin: 0;
      font-size: 14px;
    }
    .prompt-panel-body pre {
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      padding: 12px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid var(--border);
    }
    @media (max-width: 768px) {
      .app-shell { padding: 16px 12px 96px; }
      .workspace-header, .report-header, .workspace-toolbar { padding: 16px; }
      .workspace-header, .report-header, .workspace-toolbar { flex-direction: column; }
      .workspace-grid, .report-grid { grid-template-columns: 1fr; }
      .workspace-status-top {
        flex-direction: column;
      }
      .workspace-primary-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .workspace-primary-actions .button {
        width: 100%;
      }
      .workspace-status-metrics {
        gap: 8px;
      }
      .advanced-actions-content,
      .backfill-panel-fields {
        grid-template-columns: 1fr;
      }
      .archive-card {
        padding: 16px;
        flex-direction: column;
      }
      .archive-card-actions {
        width: 100%;
        justify-content: flex-start;
      }
      .workspace-toolbar-right,
      .batch-size-group {
        width: 100%;
        justify-content: flex-start;
      }
      .load-more-state {
        padding: 16px;
        align-items: flex-start;
        flex-direction: column;
      }
      .back-to-top-button { bottom: 84px; right: 16px; }
      .selection-sidebar { display: grid; }
      .selection-summary-mobile { display: block; }
    }
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation: none !important;
        transition: none !important;
        scroll-behavior: auto !important;
      }
    }
  `;
}

export function renderDashboardPage({
  lang = 'zh-Hans',
  title,
  bodyClass = '',
  bodyContent,
  inlineScript = '',
}) {
  return `<!DOCTYPE html>
  <html lang="${lang}">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>${getDashboardStyles()}</style>
    </head>
    <body class="${bodyClass}">
      <div class="app-shell">
        ${renderToastRegion()}
        ${bodyContent}
      </div>
      <script>${inlineScript}</script>
    </body>
  </html>`;
}
