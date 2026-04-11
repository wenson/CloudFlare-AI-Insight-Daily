export async function fetchData(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}, url: ${url}`);
  }
  return response.json();
}

function shellEscapeSingleQuoted(value) {
  return String(value).replace(/'/g, `'\\''`);
}

const REDACTED = '[REDACTED]';
const SENSITIVE_HEADER_KEYS = new Set(['cookie', 'authorization']);

function sanitizeHeaderValue(key, value) {
  if (typeof value !== 'string') return value;
  return SENSITIVE_HEADER_KEYS.has(key.toLowerCase()) ? REDACTED : value;
}

export function redactSensitiveHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key, sanitizeHeaderValue(key, value)]),
  );
}

export function buildCurlCommand(url, headers, body) {
  const safeHeaders = redactSensitiveHeaders(headers);
  const headerFlags = Object.entries(safeHeaders)
    .map(([key, value]) => `-H '${shellEscapeSingleQuoted(`${key}: ${value}`)}'`)
    .join(' \\\n  ');

  return [
    `curl '${shellEscapeSingleQuoted(url)}' \\`,
    '  -X POST \\',
    headerFlags ? `  ${headerFlags} \\` : '',
    `  --data-raw '${shellEscapeSingleQuoted(JSON.stringify(body))}'`,
  ].filter(Boolean).join('\n');
}

export function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:108.0) Gecko/20100101 Firefox/108.0',
    'Mozilla/5.0 (X11; Linux x86_64; rv:108.0) Gecko/20100101 Firefox/108.0',
  ];
  return userAgents[Math.floor(Math.random() * userAgents.length)];
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
