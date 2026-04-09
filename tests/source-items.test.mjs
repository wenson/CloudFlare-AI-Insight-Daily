import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceItemRecord,
  getPublishedWindowBounds,
  mapSourceItemRowToUnifiedItem,
  groupSourceItemsByType,
} from '../src/sourceItems.js';
import {
  upsertSourceItem,
  listSourceItemsByPublishedWindow,
  getSourceItemsBySelections,
} from '../src/d1.js';

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
            async run() {
              return { success: true };
            },
            async all() {
              return { results };
            },
          };
        },
      };
    },
  };
}

test('buildSourceItemRecord preserves rich source payload fields', () => {
  const record = buildSourceItemRecord({
    id: '264914242829813760',
    type: 'news',
    title: '马斯克死磕奥特曼：赔款我不要，但他必须离开OpenAI董事会',
    url: 'https://www.qbitai.com/2026/04/398071.html',
    source: '量子位',
    published_date: '2026-04-09T03:41:25.334Z',
    details: {
      content_html: '<p>西风 发自 凹非寺</p>',
    },
    source_meta: {
      guid: 'https://www.qbitai.com/2026/04/398071.html',
      author_name: '量子位',
      inserted_at: '2026-04-09T03:58:11.139Z',
      categories: ['资讯', '山姆·奥特曼', '马斯克'],
      media: [{ url: 'https://i.qbitai.com/a.webp', type: 'photo' }],
      raw_json: { foo: 'bar' },
    },
  }, '2026-04-09');

  assert.equal(record.source_type, 'news');
  assert.equal(record.source_name, '量子位');
  assert.equal(record.source_item_id, '264914242829813760');
  assert.equal(record.guid, 'https://www.qbitai.com/2026/04/398071.html');
  assert.equal(record.author_name, '量子位');
  assert.equal(record.inserted_at, '2026-04-09T03:58:11.139Z');
  assert.equal(record.first_seen_date, '2026-04-09');
  assert.equal(record.last_seen_date, '2026-04-09');
  assert.equal(record.categories_json, JSON.stringify(['资讯', '山姆·奥特曼', '马斯克']));
  assert.equal(record.media_json, JSON.stringify([{ url: 'https://i.qbitai.com/a.webp', type: 'photo' }]));
  assert.equal(record.raw_json, JSON.stringify({ foo: 'bar' }));
});

test('getPublishedWindowBounds returns the shanghai day window for FOLO_FILTER_DAYS', () => {
  const bounds = getPublishedWindowBounds('2026-04-09', 2);

  assert.deepEqual(bounds, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
  });
});

test('mapSourceItemRowToUnifiedItem and groupSourceItemsByType rebuild handler payloads', () => {
  const grouped = groupSourceItemsByType([
    mapSourceItemRowToUnifiedItem({
      source_type: 'news',
      source_name: '量子位',
      source_item_id: '264914242829813760',
      title: '量子位新闻',
      url: 'https://example.com/news/1',
      author_name: '量子位',
      description_text: '新闻摘要',
      content_html: '<p>新闻正文</p>',
      published_at: '2026-04-09T03:41:25.334Z',
    }),
  ]);

  assert.equal(grouped.news.length, 1);
  assert.equal(grouped.paper.length, 0);
  assert.equal(grouped.socialMedia.length, 0);
  assert.equal(grouped.news[0].id, '264914242829813760');
  assert.equal(grouped.news[0].details.content_html, '<p>新闻正文</p>');
});

test('row to unified to record round-trip preserves author and source_meta fields', () => {
  const row = {
    source_type: 'news',
    source_name: '量子位',
    source_item_id: '264914242829813760',
    title: '量子位新闻',
    url: 'https://example.com/news/1',
    guid: 'https://example.com/news/1',
    author_name: '量子位作者',
    author_url: 'https://example.com/authors/1',
    author_avatar: 'https://example.com/authors/1.png',
    description_text: '新闻摘要',
    content_html: '<p>新闻正文</p>',
    published_at: '2026-04-09T03:41:25.334Z',
    inserted_at: '2026-04-09T03:58:11.139Z',
    language: 'zh',
    summary: 'summary',
    categories_json: JSON.stringify(['资讯']),
    media_json: JSON.stringify([{ url: 'https://example.com/a.webp', type: 'photo' }]),
    attachments_json: JSON.stringify([{ name: 'file.pdf' }]),
    extra_json: JSON.stringify({ foo: 'bar' }),
    raw_json: JSON.stringify({ source: 'folo' }),
  };

  const unified = mapSourceItemRowToUnifiedItem(row);
  const record = buildSourceItemRecord(unified, '2026-04-09');

  assert.equal(record.author_name, '量子位作者');
  assert.equal(record.guid, 'https://example.com/news/1');
  assert.equal(record.author_url, 'https://example.com/authors/1');
  assert.equal(record.author_avatar, 'https://example.com/authors/1.png');
  assert.equal(record.inserted_at, '2026-04-09T03:58:11.139Z');
  assert.equal(record.language, 'zh');
  assert.equal(record.summary, 'summary');
  assert.equal(record.categories_json, JSON.stringify(['资讯']));
  assert.equal(record.media_json, JSON.stringify([{ url: 'https://example.com/a.webp', type: 'photo' }]));
  assert.equal(record.attachments_json, JSON.stringify([{ name: 'file.pdf' }]));
  assert.equal(record.extra_json, JSON.stringify({ foo: 'bar' }));
  assert.equal(record.raw_json, JSON.stringify({ source: 'folo' }));
});

test('upsertSourceItem uses unique source_type and source_item_id conflict handling', async () => {
  const db = createDb();
  await upsertSourceItem(db, {
    source_type: 'news',
    source_name: '量子位',
    source_item_id: '264914242829813760',
    title: '量子位新闻',
    url: 'https://example.com/news/1',
    guid: 'https://example.com/news/1',
    author_name: '量子位',
    author_url: null,
    author_avatar: null,
    description_text: '新闻摘要',
    content_html: '<p>新闻正文</p>',
    published_at: '2026-04-09T03:41:25.334Z',
    inserted_at: '2026-04-09T03:58:11.139Z',
    language: null,
    summary: null,
    categories_json: '["资讯"]',
    media_json: '[]',
    attachments_json: null,
    extra_json: null,
    raw_json: '{"foo":"bar"}',
    first_seen_date: '2026-04-09',
    last_seen_date: '2026-04-09',
    created_at: '2026-04-09T04:00:00.000Z',
    updated_at: '2026-04-09T04:00:00.000Z',
  });

  assert.match(db.state.sql, /INSERT INTO source_items/);
  assert.match(db.state.sql, /ON CONFLICT\(source_type, source_item_id\)/);
  assert.equal(db.state.args[0], 'news');
  assert.equal(db.state.args[2], '264914242829813760');
});

test('listSourceItemsByPublishedWindow queries the published_at range in descending order', async () => {
  const db = createDb([{ source_item_id: '264914242829813760' }]);
  const results = await listSourceItemsByPublishedWindow(db, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
  });

  assert.match(db.state.sql, /WHERE published_at >= \? AND published_at <= \?/);
  assert.match(db.state.sql, /ORDER BY published_at DESC/);
  assert.equal(results.length, 1);
});

test('getSourceItemsBySelections fetches exact type and id pairs', async () => {
  const db = createDb([{ source_type: 'news', source_item_id: '1' }]);
  const rows = await getSourceItemsBySelections(db, [
    { sourceType: 'news', sourceItemId: '1' },
    { sourceType: 'paper', sourceItemId: '2' },
  ]);

  assert.match(
    db.state.sql,
    /\(source_type = \? AND source_item_id = \?\) OR \(source_type = \? AND source_item_id = \?\)/,
  );
  assert.deepEqual(db.state.args, ['news', '1', 'paper', '2']);
  assert.equal(rows.length, 1);
});
