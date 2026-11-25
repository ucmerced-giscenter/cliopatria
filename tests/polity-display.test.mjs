import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DataService } from '../js/lib/api.js';
import { featureDetails, makeSelection, selectionNote } from '../js/lib/core.js';
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

test('selecting a polity includes its exact source records across query pages', async () => {
  const a = { Name: "King's Isles", Year: 207, Type: 'POLITY', OBJECTID: 11, AreaSqKM: 20, Wikipedia: 'Island A', Wikidata: 'Q123', SeshatID: 'example' };
  const b = { ...a, OBJECTID: 42, AreaSqKM: 35, Wikipedia: 'Island B' };
  const api = new DataService();
  api.query = async params => {
    assert.equal(params.where, "(Year = 207) AND (Type = 'POLITY') AND (Name = 'King''s Isles')");
    assert.equal(params.returnGeometry, false);
    assert.equal(params.orderByFields, 'OBJECTID ASC');
    const first = params.resultOffset === 0;
    if (!first) assert.equal(params.resultOffset, 2);
    const rows = first ? [a, { ...b, OBJECTID: 12, Name: "KING'S ISLES" }] : [b];
    return { features: rows.map(attributes => ({ attributes })), exceededTransferLimit: first };
  };
  for (const clicked of [a, b]) {
    const selected = await api.selection(clicked);
    assert.deepEqual(selected.memberIds, [11, 42]);
    assert.equal(selectionNote(selected), 'This selection includes 2 source records.');
    assert.equal(selected.AreaSqKM, 55);
    assert.equal(selected.Wikipedia, null);
    assert.equal(selected.Wikidata, 'Q123');
    assert.equal(selected.SeshatID, 'example');
    assert.ok(featureDetails(selected).some(([label]) => label === 'Sum of source areas (km²)'));
  }
  assert.throws(() => makeSelection(a, [{ ...a, Year: 211 }, { ...a, Type: 'GROUP' }, b]), /no longer matches/);
});

test('unnamed polygons and named non-polities select only the clicked service record', async () => {
  for (const [Name, Type] of [[null, 'POLITY'], ['Delian League', 'GROUP']]) {
    const record = { OBJECTID: 15, Year: -450, Name, Type, AreaSqKM: 7 };
    const api = new DataService();
    api.query = async params => {
      assert.equal(params.where, 'OBJECTID IN (15)');
      return { features: [{ attributes: record }] };
    };
    const selected = await api.selection({ ...record, Name: Name ?? '' });
    assert.deepEqual(selected.memberIds, [15]);
    assert.match(selectionNote(selected), /includes 1 source record\./);
    assert.equal(selected.AreaSqKM, 7);
  }
});

test('both highlight layers follow the entire selection and clear together', () => {
  const history = Object.create(HistoryMap.prototype);
  const filters = new Map();
  history.searchIds = [];
  history.map = { getLayer: () => true, setFilter: (id, filter) => filters.set(id, filter) };
  for (const ids of [[101, 102], [103], []]) {
    if (ids.length) history.select(ids);
    else history.clearSelection();
    for (const layer of ['selection-halo', 'selection-outline']) {
      assert.deepEqual(filters.get(layer), ['in', ['get', 'OBJECTID'], ['literal', ids]]);
    }
  }
});
