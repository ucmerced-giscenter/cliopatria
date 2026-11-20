import assert from 'node:assert/strict';
import test from 'node:test';
import { readUrl } from '../js/lib/core.js';

const years = [-14, -1, 1, 117, 127, 1497];
const defaults = { center: [20, 28], zoom: 1.5, basemaps: { plain: null } };
function time(query) {
  const { start, end, year } = readUrl(query, years, defaults);
  return [start, end, year];
}

test('range endpoints keep calendar-year precision and only recorded snapshots can be displayed', () => {
  assert.deepEqual(time(''), [-14, 1497, 1497]);
  assert.deepEqual(time('?from=116&to=125&year=127'), [116, 125, 117]);
  assert.deepEqual(time('?from=118&to=126&year=117'), [118, 126, null]);
  assert.deepEqual(time('?from=-1&to=1&year=-1'), [-1, 1, -1]);
  assert.deepEqual(time('?from=127&to=127'), [127, 127, 127]);
});

test('invalid bounds recover and legacy search links retain their original scope', () => {
  for (const query of ['from=0', 'from=-15', 'from=127&to=117', 'to=1.5']) {
    assert.deepEqual(time('?' + query), [-14, 1497, 1497]);
  }
  assert.deepEqual(time('?year=117&q=Roman'), [117, 117, 117]);
  assert.deepEqual(time('?year=117&q=Roman&search=all'), [-14, 1497, 117]);
  assert.deepEqual(time('?from=-14&to=1497&year=117&q=Roman'), [-14, 1497, 117]);
});

test('single-year links restore the snapshot independently of the saved range', () => {
  const query = '?coverage=year&from=118&to=126&year=127&q=Roman';
  assert.equal(readUrl(query, years, defaults).singleYear, true);
  assert.deepEqual(time(query), [118, 126, 127]);
  assert.deepEqual(time('?coverage=year&year=117&q=Roman'), [-14, 1497, 117]);
  assert.equal(readUrl('?from=117&to=127', years, defaults).singleYear, false);
  assert.deepEqual(time('?from=118&to=126&year=127'), [118, 126, null]);
});
