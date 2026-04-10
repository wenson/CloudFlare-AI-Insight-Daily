import { runFoloWebhookIngestion } from '../services/foloWebhookIngestion.js';

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

let runWebhookIngestion = runFoloWebhookIngestion;

export function __setRunFoloWebhookIngestion(fn) {
  runWebhookIngestion = fn;
}

export function __resetRunFoloWebhookIngestion() {
  runWebhookIngestion = runFoloWebhookIngestion;
}

export async function handleFoloWebhook(request, env) {
  if (request.method !== 'POST') {
    return Response.json(
      {
        success: false,
        message: 'Method Not Allowed',
        errors: ['Only POST is supported for this endpoint.'],
      },
      { status: 405, headers: JSON_HEADERS },
    );
  }

  const configuredToken = typeof env?.FOLO_WEBHOOK_TOKEN === 'string' ? env.FOLO_WEBHOOK_TOKEN.trim() : '';
  if (!configuredToken) {
    return Response.json(
      {
        success: false,
        message: 'FOLO webhook is not configured.',
        errors: ['Missing FOLO_WEBHOOK_TOKEN configuration.'],
      },
      { status: 503, headers: JSON_HEADERS },
    );
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token !== configuredToken) {
    return Response.json(
      {
        success: false,
        message: 'Unauthorized webhook token.',
        errors: ['Invalid token.'],
      },
      { status: 401, headers: JSON_HEADERS },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        success: false,
        message: 'Invalid webhook JSON payload.',
        errors: ['Request body must be valid JSON.'],
      },
      { status: 400, headers: JSON_HEADERS },
    );
  }

  let result;
  try {
    result = await runWebhookIngestion(env, payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result = {
      status: 500,
      success: false,
      accepted: true,
      matched: false,
      message: 'Webhook ingestion failed unexpectedly.',
      errors: [errorMessage || 'Unknown ingestion error.'],
    };
  }

  const status = Number.isInteger(result?.status) ? result.status : 500;
  const logPayload = {
    event: 'folo-webhook-ingestion',
    matched: result?.matched === true,
    matchKey: result?.matchKey ?? null,
    matchValue: result?.matchValue ?? null,
    sourceKey: result?.sourceKey ?? null,
    sourceType: result?.sourceType ?? result?.category ?? null,
    status,
    upsertedCount: Number.isInteger(result?.upsertedCount) ? result.upsertedCount : 0,
    errors: Array.isArray(result?.errors) ? result.errors : [],
  };
  if (status >= 500) {
    console.error(JSON.stringify(logPayload));
  } else {
    console.log(JSON.stringify(logPayload));
  }

  return Response.json(result ?? { success: false, status: 500 }, {
    status,
    headers: JSON_HEADERS,
  });
}
