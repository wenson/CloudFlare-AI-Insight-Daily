// src/handlers/writeData.js
import { getISODate } from '../utils/date.js';
import { runSourceItemIngestion } from '../services/sourceItemIngestion.js';

export async function handleWriteData(request, env) {
  let dateStr = env?.SOURCE_ITEM_FETCH_DATE || getISODate();
  let category;
  let foloCookie = null;

  try {
    if (request.headers.get('Content-Type')?.includes('application/json')) {
      const requestBody = await request.json();
      category = requestBody.category;
      foloCookie = typeof requestBody.foloCookie === 'string' ? requestBody.foloCookie : null;
      if (typeof requestBody.date === 'string' && requestBody.date.trim() !== '') {
        dateStr = requestBody.date;
      }
    }

    const ingestionResult = await runSourceItemIngestion(env, {
      date: dateStr,
      category,
      foloCookie,
      mode: 'manual',
      requireFoloCookie: false,
      allowPartialSuccess: false,
    });

    const responseBody = {
      success: ingestionResult.success,
      message: ingestionResult.message,
    };

    const hasCategory = Boolean(category);
    const isUnknownCategoryError = hasCategory && ingestionResult.status === 400 && /Unknown category/i.test(ingestionResult.message ?? '');

    if (hasCategory && !isUnknownCategoryError) {
      const categoryCount = ingestionResult.counts?.[category];
      if (typeof categoryCount === 'number') {
        responseBody[`${category}ItemCount`] = categoryCount;
      }
    } else if (!hasCategory) {
      const countEntries = Object.entries(ingestionResult.counts ?? {});
      const countPayload = Object.fromEntries(
        countEntries.map(([key, value]) => [`${key}ItemCount`, value])
      );
      Object.assign(responseBody, countPayload);
    }

    if (ingestionResult.errors?.length) {
      responseBody.errors = ingestionResult.errors;
    }

    return new Response(JSON.stringify(responseBody), {
      status: ingestionResult.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Unhandled error in /writeData:", error);
    return new Response(JSON.stringify({
      success: false,
      message: "An unhandled error occurred during data processing.",
      error: error.message,
      details: error.stack,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
