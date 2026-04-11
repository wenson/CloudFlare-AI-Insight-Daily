export async function callOpenAIChatAPI(env, promptText, systemPromptText = null) {
  if (!env.OPENAI_API_URL) {
    throw new Error('OPENAI_API_URL environment variable is not set.');
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set for OpenAI models.');
  }

  const url = `${env.OPENAI_API_URL}/v1/chat/completions`;
  const messages = [];
  if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
    messages.push({ role: 'system', content: systemPromptText });
    console.log('System instruction included in OpenAI Chat API call.');
  }
  messages.push({ role: 'user', content: promptText });

  const payload = {
    model: env.DEFAULT_OPEN_MODEL,
    messages,
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorBodyText);
      } catch {
        errorData = errorBodyText;
      }
      console.error('OpenAI Chat API Error Response Body:', typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
      const message = typeof errorData === 'object' && errorData.error?.message
        ? errorData.error.message
        : (typeof errorData === 'string' ? errorData : 'Unknown OpenAI Chat API error');
      throw new Error(`OpenAI Chat API error (${response.status}): ${message}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content;
    }

    console.warn('OpenAI Chat API response format unexpected: No choices or content found.', JSON.stringify(data, null, 2));
    throw new Error('OpenAI Chat API returned an empty or malformed response.');
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('OpenAI Chat'))) {
      console.error('Error calling OpenAI Chat API (Non-streaming):', error);
    }
    throw error;
  }
}

export async function* callOpenAIChatAPIStream(env, promptText, systemPromptText = null) {
  if (!env.OPENAI_API_URL) {
    throw new Error('OPENAI_API_URL environment variable is not set.');
  }
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is not set for OpenAI models.');
  }

  const url = `${env.OPENAI_API_URL}/v1/chat/completions`;
  const messages = [];
  if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
    messages.push({ role: 'system', content: systemPromptText });
    console.log('System instruction included in OpenAI Chat API call.');
  }
  messages.push({ role: 'user', content: promptText });

  const payload = {
    model: env.DEFAULT_OPEN_MODEL,
    messages,
    temperature: 1,
    max_tokens: 2048,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    stream: true,
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBodyText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorBodyText);
      } catch {
        errorData = errorBodyText;
      }
      console.error('OpenAI Chat API Error (Stream Initial) Response Body:', typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
      const message = typeof errorData === 'object' && errorData.error?.message
        ? errorData.error.message
        : (typeof errorData === 'string' ? errorData : 'Unknown OpenAI Chat API error');
      throw new Error(`OpenAI Chat API error (${response.status}): ${message}`);
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasYieldedContent = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let eventBoundary;
      while ((eventBoundary = buffer.indexOf('\n\n')) !== -1) {
        let message = buffer.substring(0, eventBoundary);
        buffer = buffer.substring(eventBoundary + 2);

        if (message.startsWith('data: ')) {
          message = message.substring(5).trim();
        } else {
          message = message.trim();
        }

        if (message === '' || message === '[DONE]') {
          continue;
        }

        try {
          const parsedChunk = JSON.parse(message);
          if (parsedChunk.choices && parsedChunk.choices.length > 0) {
            const delta = parsedChunk.choices[0].delta;
            if (delta && delta.content) {
              hasYieldedContent = true;
              yield delta.content;
            }
          } else if (parsedChunk.error) {
            console.error('OpenAI Chat API Stream Error Chunk:', JSON.stringify(parsedChunk.error, null, 2));
            throw new Error(`OpenAI Chat API stream error: ${parsedChunk.error.message || 'Unknown error in stream'}`);
          }
        } catch (error) {
          console.warn('Failed to parse JSON chunk from OpenAI stream:', message, error.message);
        }
      }
    }

    if (buffer.trim()) {
      let finalMessage = buffer.trim();
      if (finalMessage.startsWith('data: ')) {
        finalMessage = finalMessage.substring(5).trim();
      }
      if (finalMessage !== '' && finalMessage !== '[DONE]') {
        try {
          const parsedChunk = JSON.parse(finalMessage);
          if (parsedChunk.choices && parsedChunk.choices.length > 0) {
            const delta = parsedChunk.choices[0].delta;
            if (delta && delta.content) {
              hasYieldedContent = true;
              yield delta.content;
            }
          } else if (parsedChunk.error) {
            console.error('OpenAI Chat API Stream Error Chunk:', JSON.stringify(parsedChunk.error, null, 2));
            throw new Error(`OpenAI Chat API stream error: ${parsedChunk.error.message || 'Unknown error in stream'}`);
          }
        } catch (error) {
          console.warn('Failed to parse final JSON chunk from OpenAI stream:', finalMessage, error.message);
        }
      }
    }

    if (!hasYieldedContent) {
      console.warn('OpenAI Chat stream finished but no content was yielded.');
      throw new Error('OpenAI Chat stream completed but yielded no content.');
    }
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('OpenAI Chat'))) {
      console.error('Error calling or streaming from OpenAI Chat API:', error);
    }
    throw error;
  }
}
