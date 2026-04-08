import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCurlCommand } from '../src/helpers.js';

test('buildCurlCommand renders a copy-pasteable curl command for Folo requests', () => {
  const command = buildCurlCommand(
    'https://api.follow.is/entries',
    {
      'Content-Type': 'application/json',
      'Cookie': 'sid=abc123; token=xyz',
      'x-app-name': 'Folo Web',
    },
    {
      listId: '158437828119024640',
      view: 1,
      withContent: true,
    },
  );

  assert.match(command, /^curl 'https:\/\/api\.follow\.is\/entries' \\/);
  assert.match(command, /-X POST \\/);
  assert.match(command, /-H 'Content-Type: application\/json' \\/);
  assert.match(command, /-H 'Cookie: sid=abc123; token=xyz' \\/);
  assert.match(command, /-H 'x-app-name: Folo Web' \\/);
  assert.match(command, /--data-raw '\{"listId":"158437828119024640","view":1,"withContent":true\}'$/);
});
