import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGetContent } from '../src/handlers/getContent.js';
import { handleGetContentHtml } from '../src/handlers/getContentHtml.js';
import { handleGetContentPage } from '../src/handlers/getContentPage.js';

function createDb(resolver = () => []) {
  const state = {
    sql: '',
    args: [],
    calls: [],
  };

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
            async all() {
              return { results: resolver(sql, args) || [] };
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
    DB: createDb(() => [
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
        published_at: '2026-04-09T07:00:00.000Z',
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
        published_at: '2026-04-09T06:00:00.000Z',
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
  assert.deepEqual(env.DB.state.args, ['2026-04-08T16:00:00.000Z', '2026-04-09T15:59:59.999Z']);
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
    DB: createDb(() => [
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
    DB: createDb((sql, args) => {
      if (sql.includes("strftime('%Y-%m-%d', datetime(published_at, '+8 hours'))")) {
        return [
          {
            archive_date: '2026-04-08',
            total_count: 2,
            news_count: 1,
            paper_count: 0,
            social_media_count: 1,
            latest_published_at: '2026-04-08T10:00:00.000Z',
          },
          {
            archive_date: '2026-04-07',
            total_count: 3,
            news_count: 2,
            paper_count: 1,
            social_media_count: 0,
            latest_published_at: '2026-04-07T09:00:00.000Z',
          },
        ];
      }
      if (sql.includes('COUNT(*) AS total_count')) {
        return [
          { source_type: 'news', total_count: 1 },
          { source_type: 'socialMedia', total_count: 1 },
        ];
      }
      if (args[2] === 'news') {
        return [
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
        ];
      }
      return [];
    }),
  };

  const response = await handleGetContentHtml(
    new Request('https://example.com/getContentHtml?date=2026-04-09'),
    env,
    createCategories(),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  const countCall = env.DB.state.calls.find((call) => call.sql.includes('COUNT(*) AS total_count'));
  assert.match(countCall.sql, /FROM source_items/);
  assert.deepEqual(countCall.args, ['2026-04-08T16:00:00.000Z', '2026-04-09T15:59:59.999Z']);
  assert.equal(kvGetCalls, 0);

  assert.match(html, /共 2 条候选内容/);
  assert.match(html, /category-pill-count">1<\/span>/);
  assert.match(html, /category-pill-count">0<\/span>/);
  assert.match(html, /News D1 title/);
  assert.doesNotMatch(html, /Social D1 title/);
  assert.match(html, /2026\/4\/7/);
  assert.match(html, /href="\/getContentHtml\?date=2026-04-07&category=news&pageSize=20"/);
  assert.match(html, /发布日期 2026\/4\/9/);
  assert.match(html, /IntersectionObserver/);
  assert.match(html, /\/getContentPage/);
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
    DB: createDb((sql, args) => {
      if (sql.includes('COUNT(*) AS total_count')) {
        return [
          { source_type: 'podcast', total_count: 1 },
        ];
      }
      if (args[2] === 'podcast') {
        return [
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
        ];
      }
      return [];
    }),
  };

  const response = await handleGetContentHtml(
    new Request('https://example.com/getContentHtml?date=2026-04-09&category=podcast'),
    env,
    createCategoriesWithFutureType(),
  );
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /共 1 条候选内容/);
  assert.match(html, /Podcast D1 title/);
});

test('/getContentPage returns offset-based slices and hasMore metadata', async () => {
  const env = {
    FOLO_FILTER_DAYS: '2',
    FOLO_COOKIE_KV_KEY: 'folo_cookie',
    DB: createDb((sql, args) => {
      if (sql.includes('COUNT(*) AS total_count')) {
        return [{ source_type: 'news', total_count: 45 }];
      }
      if (args[2] === 'news' && args[3] === 20 && args[4] === 20) {
        return [
          {
            source_type: 'news',
            source_name: 'Source N',
            source_item_id: 'news-21',
            title: 'News page 2 title',
            url: 'https://example.com/news-21',
            author_name: 'Author N',
            description_text: 'News summary',
            content_html: '<p>news page 2 content</p>',
            published_at: '2026-04-09T08:00:00.000Z',
          },
        ];
      }
      return [];
    }),
  };

  const response = await handleGetContentPage(
    new Request('https://example.com/getContentPage?date=2026-04-09&category=news&offset=20&limit=20'),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.date, '2026-04-09');
  assert.equal(body.category, 'news');
  assert.equal(body.totalItems, 45);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].id, 'news-21');
  assert.equal(body.nextOffset, 40);
  assert.equal(body.hasMore, true);

  const newsCall = env.DB.state.calls.find((call) => call.args[2] === 'news');
  assert.deepEqual(newsCall.args, [
    '2026-04-08T16:00:00.000Z',
    '2026-04-09T15:59:59.999Z',
    'news',
    20,
    20,
  ]);
});

test('/getContentPage falls back to default batch size and returns hasMore false on the last slice', async () => {
  const env = {
    FOLO_FILTER_DAYS: '2',
    DB: createDb((sql, args) => {
      if (sql.includes('COUNT(*) AS total_count')) {
        return [{ source_type: 'socialMedia', total_count: 25 }];
      }
      if (args[2] === 'socialMedia' && args[3] === 20 && args[4] === 20) {
        return [
          {
            source_type: 'socialMedia',
            source_name: 'Source S',
            source_item_id: 'social-21',
            title: 'Social last batch title',
            url: 'https://example.com/social-21',
            author_name: 'Author S',
            description_text: 'Social summary',
            content_html: '<p>social content</p>',
            published_at: '2026-04-08T08:00:00.000Z',
          },
          {
            source_type: 'socialMedia',
            source_name: 'Source S',
            source_item_id: 'social-22',
            title: 'Social item 22',
            url: 'https://example.com/social-22',
            author_name: 'Author S',
            description_text: 'Social summary',
            content_html: '<p>social content</p>',
            published_at: '2026-04-08T07:00:00.000Z',
          },
          {
            source_type: 'socialMedia',
            source_name: 'Source S',
            source_item_id: 'social-23',
            title: 'Social item 23',
            url: 'https://example.com/social-23',
            author_name: 'Author S',
            description_text: 'Social summary',
            content_html: '<p>social content</p>',
            published_at: '2026-04-08T06:00:00.000Z',
          },
          {
            source_type: 'socialMedia',
            source_name: 'Source S',
            source_item_id: 'social-24',
            title: 'Social item 24',
            url: 'https://example.com/social-24',
            author_name: 'Author S',
            description_text: 'Social summary',
            content_html: '<p>social content</p>',
            published_at: '2026-04-08T05:00:00.000Z',
          },
          {
            source_type: 'socialMedia',
            source_name: 'Source S',
            source_item_id: 'social-25',
            title: 'Social item 25',
            url: 'https://example.com/social-25',
            author_name: 'Author S',
            description_text: 'Social summary',
            content_html: '<p>social content</p>',
            published_at: '2026-04-08T04:00:00.000Z',
          },
        ];
      }
      return [];
    }),
  };

  const response = await handleGetContentPage(
    new Request('https://example.com/getContentPage?date=2026-04-09&category=socialMedia&offset=20&limit=999'),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.totalItems, 25);
  assert.equal(body.nextOffset, null);
  assert.equal(body.hasMore, false);
  assert.equal(body.items[0].id, 'social-21');
  assert.equal(body.items.length, 5);
});
