import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../src/helpers.js';

test('escapeHtml encodes HTML-sensitive characters', () => {
  assert.equal(
    escapeHtml(`Tom & "<Jerry>" 'Spike'`),
    'Tom &amp; &quot;&lt;Jerry&gt;&quot; &#039;Spike&#039;',
  );
});
