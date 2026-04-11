export async function callGeminiChatAPI(env, promptText, systemPromptText = null) {
  if (!env.GEMINI_API_URL) {
    throw new Error('GEMINI_API_URL environment variable is not set.');
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set for Gemini models.');
  }

  const modelName = env.DEFAULT_GEMINI_MODEL;
  const url = `${env.GEMINI_API_URL}/v1beta/models/${modelName}:generateContent?key=${env.GEMINI_API_KEY}`;
  const payload = {
    contents: [{
      parts: [{ text: promptText }],
    }],
  };

  if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
    payload.systemInstruction = {
      parts: [{ text: systemPromptText }],
    };
    console.log('System instruction included in Chat API call.');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      console.error('Gemini Chat API Error Response Body:', typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
      const message = typeof errorData === 'object' && errorData.error?.message
        ? errorData.error.message
        : (typeof errorData === 'string' ? errorData : 'Unknown Gemini Chat API error');
      throw new Error(`Gemini Chat API error (${response.status}): ${message}`);
    }

    const data = await response.json();

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      const blockReason = data.promptFeedback.blockReason;
      const safetyRatings = data.promptFeedback.safetyRatings ? JSON.stringify(data.promptFeedback.safetyRatings) : 'N/A';
      console.error(`Gemini Chat prompt blocked: ${blockReason}. Safety ratings: ${safetyRatings}`, JSON.stringify(data, null, 2));
      throw new Error(`Gemini Chat prompt blocked: ${blockReason}. Safety ratings: ${safetyRatings}`);
    }

    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];

      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        const reason = candidate.finishReason;
        const safetyRatings = candidate.safetyRatings ? JSON.stringify(candidate.safetyRatings) : 'N/A';
        console.error(`Gemini Chat content generation finished with reason: ${reason}. Safety ratings: ${safetyRatings}`, JSON.stringify(data, null, 2));
        if (reason === 'SAFETY') {
          throw new Error(`Gemini Chat content generation blocked due to safety (${reason}). Safety ratings: ${safetyRatings}`);
        }
        throw new Error(`Gemini Chat content generation finished due to: ${reason}. Safety ratings: ${safetyRatings}`);
      }

      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0 && candidate.content.parts[0].text) {
        return candidate.content.parts[0].text;
      }

      console.warn("Gemini Chat API response has candidate with 'STOP' finishReason but no text content, or content structure is unexpected.", JSON.stringify(data, null, 2));
      throw new Error("Gemini Chat API returned a candidate with 'STOP' finishReason but no text content.");
    }

    console.warn('Gemini Chat API response format unexpected: No candidates found and no prompt block reason.', JSON.stringify(data, null, 2));
    throw new Error('Gemini Chat API returned an empty or malformed response with no candidates.');
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Gemini Chat'))) {
      console.error('Error calling Gemini Chat API (Non-streaming):', error);
    }
    throw error;
  }
}

export async function* callGeminiChatAPIStream(env, promptText, systemPromptText = null) {
  if (!env.GEMINI_API_URL) {
    throw new Error('GEMINI_API_URL environment variable is not set.');
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set for Gemini models.');
  }

  const modelName = env.DEFAULT_GEMINI_MODEL;
  const url = `${env.GEMINI_API_URL}/v1beta/models/${modelName}:streamGenerateContent?key=${env.GEMINI_API_KEY}&alt=sse`;
  const payload = {
    contents: [{
      parts: [{ text: promptText }],
    }],
    generationConfig: {
      temperature: 1,
      topP: 0.95,
    },
  };

  if (systemPromptText && typeof systemPromptText === 'string' && systemPromptText.trim() !== '') {
    payload.systemInstruction = {
      parts: [{ text: systemPromptText }],
    };
    console.log('System instruction included in Chat API call.');
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
      console.error('Gemini Chat API Error (Stream Initial) Response Body:', typeof errorData === 'object' ? JSON.stringify(errorData, null, 2) : errorData);
      const message = typeof errorData === 'object' && errorData.error?.message
        ? errorData.error.message
        : (typeof errorData === 'string' ? errorData : 'Unknown Gemini Chat API error');
      throw new Error(`Gemini Chat API error (${response.status}): ${message}`);
    }

    if (!response.body) {
      throw new Error('Response body is null, cannot stream.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hasYieldedContent = false;
    let overallFinishReason = null;
    let finalSafetyRatings = null;

    const processJsonChunk = (jsonString) => {
      if (jsonString.trim() === '') return null;
      try {
        return JSON.parse(jsonString);
      } catch (error) {
        console.warn('Failed to parse JSON chunk from stream:', jsonString, error.message);
        return null;
      }
    };

    const handleChunkLogic = (chunk) => {
      if (!chunk) return false;

      if (chunk.promptFeedback && chunk.promptFeedback.blockReason) {
        const blockReason = chunk.promptFeedback.blockReason;
        const safetyRatings = chunk.promptFeedback.safetyRatings ? JSON.stringify(chunk.promptFeedback.safetyRatings) : 'N/A';
        console.error(`Gemini Chat prompt blocked during stream: ${blockReason}. Safety ratings: ${safetyRatings}`, JSON.stringify(chunk, null, 2));
        throw new Error(`Gemini Chat prompt blocked: ${blockReason}. Safety ratings: ${safetyRatings}`);
      }

      if (chunk.candidates && chunk.candidates.length > 0) {
        const candidate = chunk.candidates[0];
        if (candidate.finishReason) {
          overallFinishReason = candidate.finishReason;
          finalSafetyRatings = candidate.safetyRatings;

          if (candidate.finishReason !== 'STOP') {
            const reason = candidate.finishReason;
            const safetyRatings = candidate.safetyRatings ? JSON.stringify(candidate.safetyRatings) : 'N/A';
            console.error(`Gemini Chat stream candidate finished with reason: ${reason}. Safety ratings: ${safetyRatings}`, JSON.stringify(chunk, null, 2));
            if (reason === 'SAFETY') {
              throw new Error(`Gemini Chat content generation blocked due to safety (${reason}). Safety ratings: ${safetyRatings}`);
            }
            throw new Error(`Gemini Chat stream finished due to: ${reason}. Safety ratings: ${safetyRatings}`);
          }
        }

        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const textPart = candidate.content.parts[0].text;
          if (textPart && typeof textPart === 'string') {
            hasYieldedContent = true;
            return textPart;
          }
        }
      } else if (chunk.error) {
        console.error('Gemini Chat API Stream Error Chunk:', JSON.stringify(chunk.error, null, 2));
        throw new Error(`Gemini Chat API stream error: ${chunk.error.message || 'Unknown error in stream'}`);
      }

      return null;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let eventBoundary;
      while ((eventBoundary = buffer.indexOf('\n\n')) !== -1 || (eventBoundary = buffer.indexOf('\n')) !== -1) {
        const separatorLength = (buffer.indexOf('\n\n') === eventBoundary) ? 2 : 1;
        let message = buffer.substring(0, eventBoundary);
        buffer = buffer.substring(eventBoundary + separatorLength);

        if (message.startsWith('data: ')) {
          message = message.substring(5).trim();
        } else {
          message = message.trim();
        }

        if (message === '' || message === '[DONE]') {
          continue;
        }

        const parsedChunk = processJsonChunk(message);
        if (parsedChunk) {
          const textToYield = handleChunkLogic(parsedChunk);
          if (textToYield !== null) {
            yield textToYield;
          }
        }
      }
    }

    if (buffer.trim()) {
      let finalMessage = buffer.trim();
      if (finalMessage.startsWith('data: ')) {
        finalMessage = finalMessage.substring(5).trim();
      }
      if (finalMessage !== '' && finalMessage !== '[DONE]') {
        const parsedChunk = processJsonChunk(finalMessage);
        if (parsedChunk) {
          const textToYield = handleChunkLogic(parsedChunk);
          if (textToYield !== null) {
            yield textToYield;
          }
        }
      }
    }

    if (!hasYieldedContent) {
      if (overallFinishReason && overallFinishReason !== 'STOP') {
        const safetyRatings = finalSafetyRatings ? JSON.stringify(finalSafetyRatings) : 'N/A';
        console.warn(`Gemini Chat stream ended with reason '${overallFinishReason}' and no content was yielded. Safety: ${safetyRatings}`);
        throw new Error(`Gemini Chat stream completed due to ${overallFinishReason} without yielding content. Safety ratings: ${safetyRatings}`);
      }
      if (overallFinishReason === 'STOP') {
        console.warn("Gemini Chat stream finished with 'STOP' but no content was yielded.", JSON.stringify({ overallFinishReason, finalSafetyRatings }, null, 2));
        throw new Error("Gemini Chat stream completed with 'STOP' but yielded no content.");
      }
      console.warn('Gemini Chat stream ended without yielding any content or a clear finish reason.');
      throw new Error('Gemini Chat stream completed without yielding any content.');
    }
  } catch (error) {
    if (!(error instanceof Error && error.message.startsWith('Gemini Chat'))) {
      console.error('Error calling or streaming from Gemini Chat API:', error);
    }
    throw error;
  }
}
