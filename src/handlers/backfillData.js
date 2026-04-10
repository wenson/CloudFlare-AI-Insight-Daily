import { enumerateDateRange, MAX_BACKFILL_DAYS, runSourceItemIngestion } from '../services/sourceItemIngestion.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export async function handleBackfillData(request, env) {
  if (request.method !== 'POST') {
    return jsonResponse(405, {
      success: false,
      message: 'Only POST is allowed for /backfillData.',
    });
  }

  if (!env?.FOLO_COOKIE) {
    return jsonResponse(500, {
      success: false,
      message: 'FOLO_COOKIE is required for backfill ingestion.',
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    console.error('Invalid backfill request payload:', error);
    return jsonResponse(400, {
      success: false,
      message: 'Request payload must be valid JSON.',
    });
  }

  const startDate = typeof payload?.startDate === 'string' ? payload.startDate.trim() : '';
  const endDate = typeof payload?.endDate === 'string' ? payload.endDate.trim() : '';
  if (!startDate || !endDate) {
    return jsonResponse(400, {
      success: false,
      message: 'startDate and endDate are required.',
    });
  }

  let dateRange;
  try {
    dateRange = enumerateDateRange(startDate, endDate, MAX_BACKFILL_DAYS);
  } catch (error) {
    return jsonResponse(400, {
      success: false,
      message: error?.message ?? 'Invalid date range.',
    });
  }

  const summary = {
    totalDays: dateRange.length,
    successDays: 0,
    partialFailureDays: 0,
    failedDays: 0,
  };
  const results = [];

  for (const date of dateRange) {
    let ingestionResult;
    try {
      ingestionResult = await runSourceItemIngestion(env, {
        date,
        mode: 'backfill',
        foloCookie: env.FOLO_COOKIE,
        requireFoloCookie: true,
        allowPartialSuccess: true,
      });
    } catch (error) {
      ingestionResult = {
        success: false,
        message: error?.message ?? 'Unexpected ingestion error.',
        errors: [error?.message].filter(Boolean),
      };
    }

    const errors = Array.isArray(ingestionResult?.errors) ? ingestionResult.errors : [];
    const success = Boolean(ingestionResult?.success);
    if (success) {
      summary.successDays += 1;
      if (errors.length > 0) {
        summary.partialFailureDays += 1;
      }
    } else {
      summary.failedDays += 1;
    }

    results.push({
      date,
      ...ingestionResult,
      errors,
      success,
    });
  }

  const overallSuccess = summary.failedDays === 0;
  const status = summary.failedDays === summary.totalDays ? 502 : 200;
  const message = overallSuccess
    ? `Backfill completed for ${summary.totalDays} day(s).`
    : summary.successDays > 0
      ? `${summary.failedDays} day(s) failed during backfill.`
      : 'Backfill failed for all requested days.';

  return jsonResponse(status, {
    success: overallSuccess,
    message,
    summary,
    results,
  });
}
