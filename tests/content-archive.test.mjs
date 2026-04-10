import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGetContentArchive } from '../src/handlers/getContentArchive.js';

function createDb(results = []) {
  const state = { sql: '', args: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      return {
        bind(...args) {
          state.args = args;
          return {
            async all() {
              return { results };
            },
          };
        },
      };
    },
  };
}

test('/contentArchive renders archive days and links back into date-scoped content pages', async () => {
  const env = {
    DB: createDb([
      {
        archive_date: '2026-04-10',
        total_count: 12,
        news_count: 5,
        paper_count: 3,
        social_media_count: 4,
        latest_published_at: '2026-04-10T12:00:00.000Z',
      },
      {
        archive_date: '2026-04-09',
        total_count: 7,
        news_count: 4,
        paper_count: 1,
        social_media_count: 2,
        latest_published_at: '2026-04-09T11:00:00.000Z',
      },
    ]),
  };

  const response = await handleGetContentArchive(
    new Request('https://example.com/contentArchive'),
    env,
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(env.DB.state.sql, /FROM source_items/);
  assert.match(html, /历史内容归档/);
  assert.match(html, /workspace-status-band/);
  assert.match(html, /workspace-shell-archive/);
  assert.match(html, /workspace-status-top/);
  assert.match(html, /archive-list/);
  assert.match(html, /archive-card card/);
  assert.match(html, /返回今日内容/);
  assert.match(html, /按发布日期浏览历史原始内容/);
  assert.match(html, /2026\/4\/10/);
  assert.match(html, /共 12 条内容/);
  assert.match(html, /新闻 5/);
  assert.match(html, /论文 3/);
  assert.match(html, /社交平台 4/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-10&category=news&pageSize=20"/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-09&category=news&pageSize=20"/);
});
