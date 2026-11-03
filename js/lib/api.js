import { config } from '../config.js';
import { FIELDS, FORMATS, envelopes, idsWhere } from './core.js';

export async function jsonRequest(url, parameters = {}, signal, method = 'GET') {
  const body = new URLSearchParams({ f: 'json', ...parameters });
  const target = method === 'GET' ? `${url}${url.includes('?') ? '&' : '?'}${body}` : url;
  const response = await fetch(target, { credentials: 'omit', signal, ...(method === 'POST' ? { method, body } : {}) });
  if (!response.ok) throw new Error(`The data service returned HTTP ${response.status}. Please try again.`);
  const result = await response.json();
  if (result.error) throw new Error([result.error.message, ...(result.error.details || [])].filter(Boolean).join(' '));
  return result;
}
export class DataService {
  constructor() { this.url = `${config.serviceUrl}/${config.layerId}/query`; }
  query(parameters, signal) { return jsonRequest(this.url, parameters, signal, 'POST'); }
  async count(where, signal) { return (await this.query({ where, returnCountOnly: true }, signal)).count; }
  async ids(where, signal, geometry) {
    const result = await this.query({ where, returnIdsOnly: true, ...(geometry ? { geometry: JSON.stringify(geometry), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' } : {}) }, signal);
    if (result.objectIds === null) return [];
    if (!Array.isArray(result.objectIds)) throw new Error('The service did not return a feature selection.');
    return result.objectIds.sort((a, b) => a - b);
  }
  async extentIds(where, bounds, signal) {
    const lists = await Promise.all(envelopes(bounds).map(geometry => this.ids(where, signal, geometry)));
    return [...new Set(lists.flat())].sort((a, b) => a - b);
  }
  async search(where, offset = 0, signal) {
    const result = await this.query({ where, outFields: FIELDS.join(','), returnGeometry: false, orderByFields: 'Name ASC,Year ASC,AreaSqKM DESC,OBJECTID ASC', resultOffset: offset, resultRecordCount: 25 }, signal);
    if (!Array.isArray(result.features)) throw new Error('Invalid search response.');
    return result.features.map(feature => feature.attributes);
  }
  async feature(id, signal) {
    const result = await this.query({ where: idsWhere([id]), outFields: FIELDS.join(','), returnGeometry: false }, signal);
    if (!result.features?.length) throw new Error('This feature is no longer available in the source layer.');
    return result.features[0].attributes;
  }
  async extent(id, signal) {
    const result = await this.query({ where: idsWhere([id]), returnExtentOnly: true, outSR: 4326 }, signal);
    return result.extent;
  }
}
function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
function secureResultURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.arcgis.com')) throw new Error('The export service returned an unexpected URL.');
  return url;
}
export async function exportFile(format, where, { signal, geometry, progress = () => {} } = {}) {
  if (!Object.hasOwn(FORMATS, format)) throw new Error('Choose a supported file format.');
  const service = await jsonRequest(config.serviceUrl, {}, signal);
  if (!service.capabilities?.split(',').includes('Extract')) throw new Error('Exports are currently disabled by the data owner.');
  if (!service.supportedExportFormats?.split(',').includes(format)) throw new Error('This service does not support the selected format.');
  const parameters = { replicaName: 'cliopatria_export', layers: config.layerId, syncModel: 'none', returnAttachments: false, replicaSR: 4326, dataFormat: format, transportType: 'esriTransportTypeUrl', async: true };
  // The service's KMZ exporter requires native Web Mercator filter coordinates.
  // The spatial filter selects intersecting whole features; it does not clip.
  if (geometry) Object.assign(parameters, { geometry: JSON.stringify(geometry), geometryType:'esriGeometryEnvelope', inSR:3857 });
  if (where && where !== '1=1') parameters.layerQueries = JSON.stringify({ [config.layerId]: { where, queryOption: 'useFilter', useGeometry: true } });
  progress('Submitting your export…');
  let result = await jsonRequest(`${config.serviceUrl}/createReplica`, parameters, signal, 'POST');
  if (result.statusUrl) {
    const statusURL = secureResultURL(result.statusUrl);
    for (;;) {
      result = await jsonRequest(statusURL.href, {}, signal);
      if (result.status === 'Completed') break;
      if (['Failed', 'CompletedWithErrors', 'Cancelled', 'Canceled'].includes(result.status)) throw new Error('ArcGIS could not complete this export. Please try again.');
      progress('ArcGIS is preparing your file. You can continue using the map.');
      await delay(2000, signal);
    }
  }
  const url = result.resultUrl || result.URL || result.url;
  if (!url) throw new Error('The export completed without a download link.');
  return secureResultURL(url).href;
}
