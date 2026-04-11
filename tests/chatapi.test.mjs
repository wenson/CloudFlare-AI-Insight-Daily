import test from 'node:test';
import assert from 'node:assert/strict';
import { callChatAPIStream } from '../src/chatapi.js';

test('callChatAPIStream surfaces Gemini non-200 errors without throwing a reference error', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(
    JSON.stringify({ error: { message: 'stream rejected' } }),
    {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    },
  );

  try {
    const env = {
      USE_MODEL_PLATFORM: 'GEMINI',
      GEMINI_API_URL: 'https://generativelanguage.googleapis.com',
      GEMINI_API_KEY: 'secret',
      DEFAULT_GEMINI_MODEL: 'gemini-test',
    };

    await assert.rejects(
      async () => {
        for await (const _chunk of callChatAPIStream(env, 'hello')) {
          assert.fail('stream should not yield data');
        }
      },
      /Gemini Chat API error \(500\): stream rejected/,
    );
  } finally {
    global.fetch = originalFetch;
  }
});
