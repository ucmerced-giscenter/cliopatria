import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';
import { config } from '../js/config.js';
import { FIELDS, featureDetails } from '../js/lib/core.js';

const site = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL(config.manifestUrl, site), 'utf8'));

test('the v1.2 timeline, map archives and query service describe the same release', () => {
  assert.equal(manifest.version, '1.2');
  assert.equal(manifest.sourceItemId, config.itemId);
  assert.equal(manifest.sourceURL, `${config.serviceUrl}/${config.layerId}`);
  assert.equal(manifest.complete, true);
  assert.equal(manifest.years.length, 508);
  assert.deepEqual(manifest.yearValues, manifest.years.map(entry => entry.year));
  assert.deepEqual([manifest.yearValues[0], manifest.yearValues.at(-1)], [-3400, 2024]);
  assert.equal(manifest.years.reduce((total, entry) => total + entry.count, 0), 159681);
  for (const entry of manifest.years) {
    assert.equal(entry.nativeFeatureCount, entry.count, String(entry.year));
    assert.equal(statSync(new URL(entry.url, site)).size, entry.bytes, entry.url);
  }
});

test('feature queries request both external IDs and details display whichever IDs exist', () => {
  assert.ok(FIELDS.includes('Wikidata') && FIELDS.includes('SeshatID'));
  const record = { Year: 2024, Wikidata: 'Q889', SeshatID: 'af_afghanistan_rep' };
  const details = Object.fromEntries(featureDetails(record));
  assert.equal(details.Wikidata, record.Wikidata);
  assert.equal(details['Seshat ID'], record.SeshatID);
  const early = Object.fromEntries(featureDetails({ Year: -3400, Wikidata: 'Q2345840', SeshatID: null }));
  assert.equal(early.Wikidata, 'Q2345840');
  assert.ok(!('Seshat ID' in early));
});
