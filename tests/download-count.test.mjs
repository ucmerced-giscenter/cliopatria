import assert from 'node:assert/strict';
import test from 'node:test';
import { DataService } from '../js/lib/api.js';

const where = 'Year >= 117 AND Year <= 127';

test('a visible-extent count applies the period and the intersecting map rectangle', async () => {
  const api = new DataService();
  api.query = async params => {
    assert.equal(params.where, where);
    assert.equal(params.returnCountOnly, true);
    assert.equal(params.spatialRel, 'esriSpatialRelIntersects');
    assert.deepEqual(JSON.parse(params.geometry), {
      xmin: 10, xmax: 20, ymin: 30, ymax: 50, spatialReference: { wkid: 4326 }
    });
    return { count: 9 };
  };
  assert.equal(await api.extentCount(where, { west: 10, east: 20, south: 30, north: 50 }), 9);
});

test('a feature on both sides of the antimeridian counts once in the export preview', async () => {
  const api = new DataService();
  api.query = async params => {
    assert.equal(params.where, where);
    assert.equal(params.returnIdsOnly, true);
    const box = JSON.parse(params.geometry);
    return { objectIds: box.xmin === -180 ? [2, 3] : [1, 2] };
  };
  assert.equal(await api.extentCount(where, { west: 170, east: -170, south: -20, north: 20 }), 3);
});
