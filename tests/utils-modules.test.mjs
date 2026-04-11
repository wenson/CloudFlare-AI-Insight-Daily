import test from 'node:test';
import assert from 'node:assert/strict';
import { getISODate, formatDateToChinese } from '../src/utils/date.js';
import { escapeHtml } from '../src/utils/html.js';
import { removeMarkdownCodeBlock } from '../src/utils/text.js';
import { buildCurlCommand } from '../src/utils/network.js';

test('date utils expose stable date formatting helpers', () => {
  assert.equal(getISODate(new Date('2026-04-10T08:00:00.000Z')), '2026-04-10');
  assert.equal(formatDateToChinese('2026-04-10T08:00:00.000Z'), '2026/4/10');
});

test('html and text utils expose shared escaping and markdown cleanup helpers', () => {
  assert.equal(escapeHtml('<tag attr="1">&</tag>'), '&lt;tag attr=&quot;1&quot;&gt;&amp;&lt;/tag&gt;');
  assert.equal(removeMarkdownCodeBlock('```json\n{"ok":true}\n```'), '{"ok":true}');
});

test('network utils expose curl redaction helpers', () => {
  const command = buildCurlCommand('https://example.com/api', {
    Cookie: 'secret-cookie',
    Authorization: 'Bearer secret-token',
  }, {
    ok: true,
  });

  assert.match(command, /\[REDACTED\]/);
  assert.doesNotMatch(command, /secret-cookie/);
  assert.doesNotMatch(command, /secret-token/);
});
