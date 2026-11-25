import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { HistoryMap } from '../js/lib/map.js';
import { loadPolityLabels } from '../js/lib/polity-display.js';

const data = new URL('../data/', import.meta.url);

test('each v1.2 snapshot supplies exactly one point per named polity', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', data)));
  let total = 0;
  for (const year of manifest.yearValues) {
    const panel = JSON.parse(await readFile(new URL(`polity-display/${year}.json`, data)));
    assert.equal(panel.type, 'FeatureCollection');
    assert.equal(panel.year, year);
    assert.equal(panel.sourceSHA256, manifest.sourceSHA256);
    const names = new Set();
    for (const { properties: { Name }, geometry } of panel.features) {
      assert.ok(Name.trim() && !names.has(Name), `${year}: ${Name}`);
      names.add(Name);
      assert.equal(geometry.type, 'Point');
      const [lon, lat] = geometry.coordinates;
      assert.ok(Math.abs(lon) <= 180 && Math.abs(lat) <= 90);
    }
    total += names.size;
  }
  assert.equal(total, 41422);
});

test('a failed label lookup can retry without accepting a stale release', async t => {
  const request = t.mock.method(globalThis, 'fetch');
  const response = sourceSHA256 => Response.json({ type: 'FeatureCollection', year: 207, sourceSHA256, features: [] });
  request.mock.mockImplementationOnce(async () => response('old'));
  await assert.rejects(loadPolityLabels(207, 'new'), /different snapshots or releases/);
  request.mock.mockImplementationOnce(async () => response('new'));
  assert.equal((await loadPolityLabels(207, 'new')).sourceSHA256, 'new');
});

test('changing polygons replaces the selected OBJECTID in both highlight layers', () => {
  const history = Object.create(HistoryMap.prototype);
  const filters = new Map();
  history.searchIds = [];
  history.map = { getLayer: () => true, setFilter: (id, filter) => filters.set(id, filter) };
  for (const id of [101, 102]) {
    history.select(id);
    for (const layer of ['selection-halo', 'selection-outline']) {
      assert.deepEqual(filters.get(layer), ['==', ['get', 'OBJECTID'], id]);
    }
  }
});
