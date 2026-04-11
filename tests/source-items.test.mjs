import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSourceItemRecord,
  getPublishedDayBounds,
  getPublishedWindowBounds,
  mapSourceItemRowToUnifiedItem,
  groupSourceItemsByType,
} from '../src/sourceItems.js';
import {
  upsertSourceItem,
  listSourceItemsByPublishedWindow,
  listSourceItemsByPublishedWindowAndType,
  countSourceItemsByPublishedWindowGroupedByType,
  listSourceItemArchiveDays,
  getSourceItemsBySelections,
} from '../src/d1.js';

function createDb(config = []) {
  const normalized = Array.isArray(config) ? { allResults: config } : (config || {});
  const state = { sql: '', args: [], calls: [] };
  return {
    state,
    prepare(sql) {
      state.sql = sql;
      const call = { sql, args: [] };
      state.calls.push(call);
      return {
        bind(...args) {
          state.args = args;
          call.args = args;
          return {
            async run() {
              return { success: true };
            },
            async all() {
              return { results: normalized.allResults || [] };
            },
            async first() {
              return normalized.firstResult || null;
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

test('getPublishedDayBounds returns only the requested shanghai day window', () => {
  const bounds = getPublishedDayBounds('2026-04-09');

  assert.deepEqual(bounds, {
    startAt: '2026-04-08T16:00:00.000Z',
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

test('mapSourceItemRowToUnifiedItem normalizes dirty description text from stored rows', () => {
  const unified = mapSourceItemRowToUnifiedItem({
    source_type: 'news',
    source_name: 'AI新闻资讯 - 量子位',
    source_item_id: 'dirty-description-item',
    title: '10万小时数据集，00后创业灵初智能一战成名',
    url: 'https://example.com/news/dirty-description',
    author_name: '量子位',
    description_text: '<![CDATA[ 鹭羽 2026-04-11 10:07:08 来源：量子位 10万小时数据集，00后创业灵初智能一战成名 鹭羽 发自 凹非寺 量子位 | 公众号 QbitAI 还得是这届00后，强得可怕！一出手，具身智能就被“整顿”得底朝天。 当别人还在Sim2Real打转… ]]>',
    content_html: '',
    published_at: '2026-04-11T08:00:00.000Z',
  });

  assert.equal(
    unified.description,
    '10万小时数据集，00后创业灵初智能一战成名 还得是这届00后，强得可怕！一出手，具身智能就被“整顿”得底朝天。 当别人还在Sim2Real打转…',
  );
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

test('listSourceItemsByPublishedWindowAndType applies source_type filter and pagination', async () => {
  const db = createDb([{ source_item_id: 'news-51' }]);
  const results = await listSourceItemsByPublishedWindowAndType(db, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
    sourceType: 'news',
    limit: 50,
    offset: 50,
  });

  assert.match(db.state.sql, /WHERE published_at >= \? AND published_at <= \?/);
  assert.match(db.state.sql, /AND source_type = \?/);
  assert.match(db.state.sql, /LIMIT \? OFFSET \?/);
  assert.deepEqual(db.state.args, [
    '2026-04-07T16:00:00.000Z',
    '2026-04-09T15:59:59.999Z',
    'news',
    50,
    50,
  ]);
  assert.equal(results.length, 1);
});

test('countSourceItemsByPublishedWindowGroupedByType returns grouped totals', async () => {
  const db = createDb([
    { source_type: 'news', total_count: 123 },
    { source_type: 'socialMedia', total_count: 8 },
  ]);
  const results = await countSourceItemsByPublishedWindowGroupedByType(db, {
    startAt: '2026-04-07T16:00:00.000Z',
    endAt: '2026-04-09T15:59:59.999Z',
  });

  assert.match(db.state.sql, /SELECT source_type, COUNT\(\*\) AS total_count/);
  assert.match(db.state.sql, /GROUP BY source_type/);
  assert.deepEqual(db.state.args, ['2026-04-07T16:00:00.000Z', '2026-04-09T15:59:59.999Z']);
  assert.deepEqual(results, [
    { source_type: 'news', total_count: 123 },
    { source_type: 'socialMedia', total_count: 8 },
  ]);
});

test('listSourceItemArchiveDays groups source items by shanghai published date descending', async () => {
  const db = createDb([
    {
      archive_date: '2026-04-10',
      total_count: 12,
      news_count: 5,
      paper_count: 3,
      social_media_count: 4,
      latest_published_at: '2026-04-10T12:00:00.000Z',
    },
  ]);
  const results = await listSourceItemArchiveDays(db);

  assert.match(db.state.sql, /strftime\('%Y-%m-%d', datetime\(published_at, '\+8 hours'\)\)/);
  assert.match(db.state.sql, /GROUP BY archive_date/);
  assert.match(db.state.sql, /ORDER BY archive_date DESC/);
  assert.deepEqual(results, [
    {
      archive_date: '2026-04-10',
      total_count: 12,
      news_count: 5,
      paper_count: 3,
      social_media_count: 4,
      latest_published_at: '2026-04-10T12:00:00.000Z',
    },
  ]);
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
