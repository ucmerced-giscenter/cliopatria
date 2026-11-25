import { colorHex } from './core.js';

export function isNamedPolity(feature) {
  return feature.Type === 'POLITY' && Boolean(feature.Name?.trim());
}

export function prepareSnapshot({ groups, year }) {
  const byId = new Map(), labels = [], unions = [], replacedIds = [];
  for (const group of groups) {
    for (const id of group.ids) byId.set(id, group);
    labels.push({ type: 'Feature', properties: { Name: group.name },
      geometry: { type: 'Point', coordinates: group.anchor } });
    if (group.geometry) {
      replacedIds.push(...group.ids);
      unions.push({ type: 'Feature', properties: { Name: group.name, Year: year, Type: 'POLITY',
        OBJECTID: group.ids[0], Color: colorHex(group.color) }, geometry: group.geometry });
    }
  }
  return { year, byId, replacedIds, labels: { type: 'FeatureCollection', features: labels },
    unions: { type: 'FeatureCollection', features: unions } };
}

const snapshots = new Map();
export function loadPolities(year, sourceHash) {
  const key = sourceHash + '/' + year;
  if (!snapshots.has(key)) {
    const pending = (async () => {
      const response = await fetch(new URL(`../../data/polity-display/${year}.json`, import.meta.url), { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('The polity groups for this snapshot could not load. Please try again.');
      const data = await response.json();
      if (data.sourceSHA256 !== sourceHash || data.year !== year) throw new Error('The polity groups and map tiles are from different releases.');
      return prepareSnapshot(data);
    })();
    snapshots.set(key, pending);
    if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    pending.catch(() => { if (snapshots.get(key) === pending) snapshots.delete(key); });
  }
  return snapshots.get(key);
}

export function makeSelection(feature, snapshot) {
  if (!isNamedPolity(feature)) return { ...feature, memberIds: [feature.OBJECTID] };
  const group = snapshot?.byId.get(feature.OBJECTID);
  if (!group || snapshot.year !== feature.Year || group.name !== feature.Name) {
    throw new Error('This source record does not match the grouped map snapshot.');
  }
  if (group.ids.length === 1) return { ...feature, memberIds: group.ids };
  return { ...feature, AreaSqKM: group.area, Wikipedia: group.wikipedia, memberIds: group.ids };
}

export function selectionNote(feature) {
  if (feature.memberIds?.length > 1) return `This selection includes ${feature.memberIds.length} source records.`;
  return feature.Name?.trim() ? '' : 'Some region polygons intentionally have no name in the source dataset.';
}
