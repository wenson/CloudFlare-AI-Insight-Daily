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

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token || token !== env.FOLO_WEBHOOK_TOKEN) {
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

  const result = await runWebhookIngestion(env, payload);
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
