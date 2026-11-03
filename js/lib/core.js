export const FIELDS = ['OBJECTID', 'Year', 'AreaSqKM', 'Name', 'Color', 'Type', 'Wikipedia'];
export const FORMATS = { geojson: 'GeoJSON', csv: 'CSV', shapefile: 'Shapefile ZIP', kml: 'KMZ' };
export const EMPTY = { type: 'FeatureCollection', features: [] };
export function formatYear(year) { return `${Math.abs(year).toLocaleString('en-US')} ${year < 0 ? 'BCE' : 'CE'}`; }
export function featureName(feature) { return feature.Name?.trim() || 'Unnamed region'; }
export function colorHex(value) {
  const color = String(value ?? '').replace(/^0x/i, '#');
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#82939A';
}
export function yearWhere(start, end = start) {
  if (![start, end].every(Number.isInteger) || start === 0 || end === 0 || start > end) throw new Error('Enter a valid year range. Use negative years for BCE; there is no year zero.');
  return start === end ? `Year = ${start}` : `Year >= ${start} AND Year <= ${end}`;
}
export function nameWhere(name) {
  const text = String(name).trim().slice(0, 120).toUpperCase().replaceAll("'", "''");
  return text ? `UPPER(Name) LIKE '%${text}%'` : '1=1';
}
export function andWhere(...conditions) { return conditions.filter(c => c && c !== '1=1').map(c => `(${c})`).join(' AND ') || '1=1'; }
function idTerms(ids) {
  const unique = [...new Set(ids)].sort((a, b) => a - b);
  if (!unique.every(id => Number.isSafeInteger(id) && id >= 0)) throw new Error('Invalid feature selection.');
  const terms = [], individual = [];
  for (let i = 0; i < unique.length;) {
    let end = i;
    while (end + 1 < unique.length && unique[end + 1] === unique[end] + 1) end++;
    if (end - i >= 4) terms.push(`OBJECTID BETWEEN ${unique[i]} AND ${unique[end]}`);
    else individual.push(...unique.slice(i, end + 1));
    i = end + 1;
  }
  // Short IN clauses avoid ArcGIS failures on very long SQL expressions.
  for (let offset = 0; offset < individual.length; offset += 250) terms.push(`OBJECTID IN (${individual.slice(offset, offset + 250).join(',')})`);
  return terms;
}
function joinTerms(terms) { return terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0] || '1=0'; }
export function idsWhere(ids) { return joinTerms(idTerms(ids)); }
export function idFilters(ids) {
  const filters = []; let group = [];
  for (const term of idTerms(ids)) {
    if (group.length && (joinTerms([...group, term]).length > 6000 || group.length >= 100)) { filters.push(joinTerms(group)); group = []; }
    group.push(term);
  }
  if (group.length) filters.push(joinTerms(group));
  return filters;
}
export function nearestYear(years, requested) {
  if (!Number.isFinite(requested)) return years.at(-1);
  return years.reduce((best, year) => Math.abs(year - requested) < Math.abs(best - requested) ? year : best, years[0]);
}
export function readUrl(search, years, defaults) {
  const params = new URLSearchParams(search);
  const value = key => params.has(key) ? Number(params.get(key)) : NaN;
  const year = nearestYear(years, value('year'));
  const longitude = value('lng'), latitude = value('lat'), zoom = value('zoom');
  return { year, center: Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(latitude) <= 85 ? [((longitude + 180) % 360 + 360) % 360 - 180, latitude] : defaults.center,
    zoom: Number.isFinite(zoom) ? Math.max(0, Math.min(10, zoom)) : defaults.zoom,
    basemap: Object.hasOwn(defaults.basemaps, params.get('basemap')) ? params.get('basemap') : 'gray',
    q: (params.get('q') || '').slice(0, 120), allYears: params.get('search') === 'all', labels: params.get('labels') !== 'off' };
}
export function wikipediaUrl(value) {
  const title = String(value || '').trim();
  if (!title) return null;
  if (/^https?:\/\//i.test(title)) {
    try { const url = new URL(title); return /(^|\.)wikipedia\.org$/i.test(url.hostname) ? `https://${url.host}${url.pathname}${url.search}${url.hash}` : null; } catch { return null; }
  }
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`;
}
// Split an antimeridian-crossing viewport into ordinary WGS84 envelopes.
export function envelopes(bounds) {
  let { west, east, south, north } = bounds;
  south = Math.max(-90, south); north = Math.min(90, north);
  if (east < west) east += 360;
  if (east - west >= 360) return [{ xmin: -180, xmax: 180, ymin: south, ymax: north, spatialReference: { wkid: 4326 } }];
  const width = east - west;
  west = ((west + 180) % 360 + 360) % 360 - 180;
  east = west + width;
  const pairs = east <= 180 ? [[west, east]] : [[west, 180], [-180, east - 360]];
  return pairs.map(([xmin, xmax]) => ({ xmin, xmax, ymin: south, ymax: north, spatialReference: { wkid: 4326 } }));
}
export function mercatorEnvelope(envelope) {
  const x = longitude => longitude * Math.PI * 6378137 / 180;
  const y = latitude => 6378137 * Math.log(Math.tan(Math.PI / 4 + Math.max(-85.05112878, Math.min(85.05112878, latitude)) * Math.PI / 360));
  return { xmin:x(envelope.xmin), ymin:y(envelope.ymin), xmax:x(envelope.xmax), ymax:y(envelope.ymax), spatialReference:{wkid:3857} };
}
