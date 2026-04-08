import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGenAIDailyPage } from '../src/handlers/genAIDailyPage.js';

function createEnv() {
  return {
    DAILY_TITLE: 'AI日报',
    DAILY_TITLE_MIN: '今日要点',
    INSERT_AD: 'false',
    INSERT_FOOT: 'false',
    OPEN_TRANSLATE: 'false',
    OPEN_TRANSLATE_URL: '',
    OPEN_TRANSLATE_API_KEY: '',
    OPEN_TRANSLATE_MODEL: '',
    IMG_PROXY: '',
  };
}

test('genAIDailyPage does not render placeholder prompt archive content', async () => {
  const request = new Request('https://example.com/genAIDailyPage?date=2026-04-08');
  const response = await handleGenAIDailyPage(request, createEnv());
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, /webbuild/);
  assert.doesNotMatch(html, /<h3>调用记录<\/h3>/);
});
