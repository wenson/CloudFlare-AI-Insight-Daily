import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWriteData } from '../src/handlers/writeData.js';

async function runUnknownCategoryRequest(category) {
  const putCalls = [];
  const env = {
    DATA_KV: {
      async put(key, value, options) {
        putCalls.push({ key, value, options });
      },
    },
  };

  const request = new Request('https://example.com/writeData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category, foloCookie: 'cookie' }),
  });

  const response = await handleWriteData(request, env);
  const body = await response.json();
  return { response, body, putCalls };
}

test('handleWriteData rejects unknown category and does not write KV', async () => {
  const { response, body, putCalls } = await runUnknownCategoryRequest('project');

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /Unknown category/i);
  assert.equal(putCalls.length, 0);
});

test('handleWriteData rejects prototype-chain category names and does not write KV', async () => {
  const { response, body, putCalls } = await runUnknownCategoryRequest('__proto__');

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.match(body.message, /Unknown category/i);
  assert.equal(putCalls.length, 0);
});
