import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { makeSelection, prepareSnapshot, selectionNote } from '../js/lib/polity-display.js';

async function panel(year) {
  return prepareSnapshot(JSON.parse(await readFile(new URL(`../data/polity-display/${year}.json`, import.meta.url))));
}

test('Sicily and Sardinia share one label and the same 35 source records in 207 CE', async () => {
  const snapshot = await panel(207);
  const rome = { Year: 207, Name: 'Roman Empire', Type: 'POLITY' };
  const sicily = makeSelection({ ...rome, OBJECTID: 6173 }, snapshot);
  const sardinia = makeSelection({ ...rome, OBJECTID: 6179 }, snapshot);
  assert.equal(snapshot.labels.features.filter(f => f.properties.Name === rome.Name).length, 1);
  assert.deepEqual(sicily.memberIds, sardinia.memberIds);
  assert.equal(sicily.memberIds.length, 35);
  assert.equal(sicily.AreaSqKM, sardinia.AreaSqKM);
  assert.match(selectionNote(sicily), /35 source records/);
  assert.throws(() => makeSelection({ ...rome, Year: 117, OBJECTID: 6173 }, snapshot));
});

test('only touching or overlapping polity groups replace their original display boundaries', async () => {
  const snapshot = await panel(-331);
  const union = snapshot.unions.features.find(f => f.properties.Name === 'Nanda Empire');
  const ids = snapshot.byId.get(union.properties.OBJECTID).ids;
  assert.equal(ids.length, 3);
  assert.ok(ids.every(id => snapshot.replacedIds.includes(id)));
  const rome = await panel(207);
  assert.ok(!rome.replacedIds.includes(6173));
  assert.ok(!rome.replacedIds.includes(6179));
});

test('unnamed regions and other feature types stay individually selectable', () => {
  for (const [Name, Type] of [['', 'POLITY'], ['Roman Empire', 'GROUP']]) {
    const selected = makeSelection({ Year: 207, OBJECTID: 5, Name, Type });
    assert.deepEqual(selected.memberIds, [5]);
  }
});
