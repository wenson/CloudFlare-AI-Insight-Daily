import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGetContent } from '../src/handlers/getContent.js';
import { handleGetContentHtml } from '../src/handlers/getContentHtml.js';

function createDb(results = []) {
  const state = {
    sql: '',
    args: [],
  };

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

function createCategories() {
  return [
    { id: 'news', name: '新闻' },
    { id: 'paper', name: '论文' },
    { id: 'socialMedia', name: '社交平台' },
  ];
}

function createCategoriesWithFutureType() {
  return [
    ...createCategories(),
    { id: 'podcast', name: '播客' },
  ];
}

test('/getContent reads source items from D1 published window instead of content KV', async () => {
  let kvGetCalls = 0;
  const env = {
    FOLO_FILTER_DAYS: '2',
    DATA_KV: {
      async get() {
        kvGetCalls += 1;
        return JSON.stringify([]);
      },
    },
    DB: createDb([
      {
        source_type: 'news',
        source_name: 'Source N',
        source_item_id: 'news-1',
        title: 'News title',
        url: 'https://example.com/news-1',
        author_name: 'Author N',
        description_text: 'News summary',
        content_html: '<p>news content</p>',
        published_at: '2026-04-09T08:00:00.000Z',
      },
      {
        source_type: 'paper',
        source_name: 'Source P',
        source_item_id: 'paper-1',
        title: 'Paper title',
        url: 'https://example.com/paper-1',
        author_name: 'Author P',
        description_text: 'Paper summary',
        content_html: '<p>paper content</p>',
        published_at: '2026-04-08T08:00:00.000Z',
      },
      {
        source_type: 'socialMedia',
        source_name: 'Source S',
        source_item_id: 'social-1',
        title: 'Social title',
        url: 'https://example.com/social-1',
        author_name: 'Author S',
        description_text: 'Social summary',
        content_html: '<p>social content</p>',
        published_at: '2026-04-08T07:00:00.000Z',
      },
    ]),
  };

  const response = await handleGetContent(new Request('https://example.com/getContent?date=2026-04-09'), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.date, '2026-04-09');
  assert.equal(body.news.length, 1);
  assert.equal(body.paper.length, 1);
  assert.equal(body.socialMedia.length, 1);
  assert.equal(body.news[0].id, 'news-1');
  assert.equal(body.news[0].details.content_html, '<p>news content</p>');

  assert.match(env.DB.state.sql, /FROM source_items/);
  assert.match(env.DB.state.sql, /WHERE published_at >= \? AND published_at <= \?/);
  assert.deepEqual(env.DB.state.args, ['2026-04-07T16:00:00.000Z', '2026-04-09T15:59:59.999Z']);
  assert.equal(kvGetCalls, 0);
});

test('/getContent keeps known groups and includes future source_type groups from D1', async () => {
  const env = {
    FOLO_FILTER_DAYS: '2',
    DATA_KV: {
      async get() {
        throw new Error('should not read content KV');
      },
    },
    DB: createDb([
      {
        source_type: 'podcast',
        source_name: 'Source Pod',
        source_item_id: 'pod-1',
        title: 'Podcast title',
        url: 'https://example.com/pod-1',
        author_name: 'Author Pod',
        description_text: 'Podcast summary',
        content_html: '<p>pod content</p>',
        published_at: '2026-04-09T08:00:00.000Z',
      },
    ]),
  };

  const response = await handleGetContent(new Request('https://example.com/getContent?date=2026-04-09'), env);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(Array.isArray(body.news), true);
  assert.equal(Array.isArray(body.paper), true);
  assert.equal(Array.isArray(body.socialMedia), true);
  assert.equal(body.podcast.length, 1);
  assert.equal(body.podcast[0].id, 'pod-1');
});

test('/getContentHtml reads source items from D1 and renders grouped counts/content', async () => {
  let kvGetCalls = 0;
  const env = {
    FOLO_FILTER_DAYS: '2',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    DATA_KV: {
      async get() {
        kvGetCalls += 1;
        return JSON.stringify([]);
      },
    },
    DB: createDb([
      {
        source_type: 'news',
        source_name: 'Source N',
        source_item_id: 'news-1',
        title: 'News D1 title',
        url: 'https://example.com/news-1',
        author_name: 'Author N',
        description_text: 'News summary',
        content_html: '<p>news content</p>',
        published_at: '2026-04-09T08:00:00.000Z',
      },
      {
        source_type: 'socialMedia',
        source_name: 'Source S',
        source_item_id: 'social-1',
        title: 'Social D1 title',
        url: 'https://example.com/social-1',
        author_name: 'Author S',
        description_text: 'Social summary',
        content_html: '<p>social content</p>',
        published_at: '2026-04-08T08:00:00.000Z',
      },
    ]),
  };

  const response = await handleGetContentHtml(
    new Request('https://example.com/getContentHtml?date=2026-04-09'),
    env,
    createCategories(),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(env.DB.state.sql, /FROM source_items/);
  assert.deepEqual(env.DB.state.args, ['2026-04-07T16:00:00.000Z', '2026-04-09T15:59:59.999Z']);
  assert.equal(kvGetCalls, 0);

  assert.match(html, /共 2 条候选内容/);
  assert.match(html, /category-pill-count">1<\/span>/);
  assert.match(html, /category-pill-count">0<\/span>/);
  assert.match(html, /News D1 title/);
  assert.match(html, /Social D1 title/);
});

test('/getContentHtml can render configured future source_type groups from D1', async () => {
  const env = {
    FOLO_FILTER_DAYS: '2',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    DATA_KV: {
      async get() {
        throw new Error('should not read content KV');
      },
    },
    DB: createDb([
      {
        source_type: 'podcast',
        source_name: 'Source Pod',
        source_item_id: 'pod-1',
        title: 'Podcast D1 title',
        url: 'https://example.com/pod-1',
        author_name: 'Author Pod',
        description_text: 'Podcast summary',
        content_html: '<p>podcast content</p>',
        published_at: '2026-04-09T08:00:00.000Z',
      },
    ]),
  };

  const response = await handleGetContentHtml(
    new Request('https://example.com/getContentHtml?date=2026-04-09'),
    env,
    createCategoriesWithFutureType(),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /共 1 条候选内容/);
  assert.match(html, /Podcast D1 title/);
});
