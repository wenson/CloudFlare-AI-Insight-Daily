export function renderToastRegion() {
  return '<div class="app-toast-region" aria-live="polite" aria-atomic="true"></div>';
}

export function getDashboardStyles() {
  return `
    :root {
      --bg: #f3f4f6;
      --surface: #fcfcfd;
      --surface-strong: #ffffff;
      --border: #d8dee7;
      --text: #172033;
      --muted: #5b6474;
      --primary: #2563eb;
      --primary-soft: #dbeafe;
      --accent: #d97706;
      --accent-soft: #fef3c7;
      --success: #15803d;
      --danger: #b91c1c;
      --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
      --radius-lg: 20px;
      --radius-md: 14px;
      --radius-sm: 10px;
      --max-width: 1440px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; }
    body {
      background: linear-gradient(180deg, #eef2ff 0%, #f8fafc 30%, #f3f4f6 100%);
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
      min-height: 44px;
      border: 1px solid transparent;
      border-radius: 12px;
      padding: 0 16px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 180ms ease, background-color 180ms ease, border-color 180ms ease;
    }
    .button:hover { transform: translateY(-1px); }
    .button:focus-visible {
      outline: 3px solid rgba(37, 99, 235, 0.28);
      outline-offset: 2px;
    }
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
    .workspace-header, .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      padding: 24px;
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
    .workspace-grid, .report-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 320px;
      gap: 20px;
      align-items: start;
    }
    .workspace-main, .report-actions { display: grid; gap: 16px; }
    .category-panel { display: none; gap: 16px; }
    .category-panel.is-active { display: grid; }
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
    .selection-sidebar, .analysis-panel, .prompt-panel, .cookie-panel { padding: 20px; }
    .selection-sidebar-footer, .cookie-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
    }
    .selection-summary-mobile { display: none; position: fixed; left: 12px; right: 12px; bottom: 12px; z-index: 100; }
    .report-reader { padding: 28px; }
    .report-reader-rendered img, .report-reader-rendered video { max-width: 100%; height: auto; }
    .prompt-panel-body pre {
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
      .selection-sidebar { display: none; }
      .selection-summary-mobile { display: block; }
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
