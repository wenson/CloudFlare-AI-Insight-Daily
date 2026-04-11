import test from 'node:test';
import assert from 'node:assert/strict';
import { callChatAPI } from '../src/chat/index.js';
import { callGeminiChatAPI } from '../src/chat/providers/gemini.js';
import { callOpenAIChatAPI } from '../src/chat/providers/openai.js';

test('chat dispatcher routes GEMINI requests through the Gemini provider module', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    candidates: [
      {
        finishReason: 'STOP',
        content: {
          parts: [{ text: 'gemini-ok' }],
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const env = {
      USE_MODEL_PLATFORM: 'GEMINI',
      GEMINI_API_URL: 'https://generativelanguage.googleapis.com',
      GEMINI_API_KEY: 'secret',
      DEFAULT_GEMINI_MODEL: 'gemini-test',
    };

    assert.equal(await callGeminiChatAPI(env, 'hello'), 'gemini-ok');
    assert.equal(await callChatAPI(env, 'hello'), 'gemini-ok');
  } finally {
    global.fetch = originalFetch;
  }
});

test('chat dispatcher routes OPEN requests through the OpenAI provider module', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    choices: [
      {
        message: {
          content: 'openai-ok',
        },
      },
    ],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    const env = {
      USE_MODEL_PLATFORM: 'OPEN',
      OPENAI_API_URL: 'https://api.openai.com',
      OPENAI_API_KEY: 'secret',
      DEFAULT_OPEN_MODEL: 'gpt-test',
    };

    assert.equal(await callOpenAIChatAPI(env, 'hello'), 'openai-ok');
    assert.equal(await callChatAPI(env, 'hello'), 'openai-ok');
  } finally {
    global.fetch = originalFetch;
  }
});
