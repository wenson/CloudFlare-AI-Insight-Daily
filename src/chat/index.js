import { callGeminiChatAPI, callGeminiChatAPIStream } from './providers/gemini.js';
import { callOpenAIChatAPI, callOpenAIChatAPIStream } from './providers/openai.js';

export { callGeminiChatAPI, callGeminiChatAPIStream } from './providers/gemini.js';
export { callOpenAIChatAPI, callOpenAIChatAPIStream } from './providers/openai.js';

export async function callChatAPI(env, promptText, systemPromptText = null) {
  const platform = env.USE_MODEL_PLATFORM;
  if (platform.startsWith('OPEN')) {
    return callOpenAIChatAPI(env, promptText, systemPromptText);
  }
  return callGeminiChatAPI(env, promptText, systemPromptText);
}

export async function* callChatAPIStream(env, promptText, systemPromptText = null) {
  const platform = env.USE_MODEL_PLATFORM;
  if (platform.startsWith('OPEN')) {
    yield* callOpenAIChatAPIStream(env, promptText, systemPromptText);
    return;
  }
  yield* callGeminiChatAPIStream(env, promptText, systemPromptText);
}
