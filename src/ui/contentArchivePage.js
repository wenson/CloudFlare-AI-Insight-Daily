import { escapeHtml, formatDateToChinese } from '../helpers.js';
import { renderDashboardPage } from './pageShell.js';

function renderArchiveCard(row) {
  const archiveDate = row.archive_date || '';
  const totalCount = Number(row.total_count) || 0;
  const newsCount = Number(row.news_count) || 0;
  const paperCount = Number(row.paper_count) || 0;
  const socialCount = Number(row.social_media_count) || 0;
  const displayDate = escapeHtml(formatDateToChinese(archiveDate));

  return `
    <article class="archive-card card">
      <div class="archive-card-copy">
        <p class="workspace-kicker">内容归档</p>
        <h2>${displayDate}</h2>
        <div class="workspace-meta">
          <span class="chip">共 ${totalCount} 条内容</span>
          <span class="chip">新闻 ${newsCount}</span>
          <span class="chip">论文 ${paperCount}</span>
          <span class="chip">社交平台 ${socialCount}</span>
        </div>
      </div>
      <div class="archive-card-actions">
        <a href="/getContentHtml?date=${encodeURIComponent(archiveDate)}&category=news&pageSize=20" class="button button-primary">查看内容</a>
      </div>
    </article>`;
}

export function generateContentArchivePageHtml(rows = []) {
  const cards = rows.length
    ? rows.map(renderArchiveCard).join('')
    : '<div class="empty-panel card"><h3>暂时还没有历史内容</h3><p>先抓取数据后，这里会按发布日期自动生成归档列表。</p></div>';

  const bodyContent = `
    <main class="workspace-shell">
      <header class="workspace-header card">
        <div class="workspace-header-copy">
          <p class="workspace-kicker">AI Insight Daily</p>
          <h1>历史内容归档</h1>
          <div class="workspace-meta">
            <span class="chip">按发布日期浏览历史原始内容</span>
            <span class="chip">点击后进入当天内容页</span>
          </div>
        </div>
        <div class="workspace-actions">
          <a href="/getContentHtml" class="button button-secondary">返回今日内容</a>
        </div>
      </header>
      <section class="archive-list">
        ${cards}
      </section>
    </main>`;

  return renderDashboardPage({
    title: '历史内容归档',
    bodyClass: 'page-content-archive',
    bodyContent,
  });
}
