import { config } from '../config.js';
import { basemapKey } from '../basemap-key.js';
import { EMPTY, featureName, featureDetails, wikipediaUrl } from './core.js';
import { loadPolities, selectionNote } from './polity-display.js';

const paintLayers = [
  ['polities-fill', 'fill', { 'fill-color': ['get', 'Color'], 'fill-opacity': 0.68, 'fill-opacity-transition': { duration: 0 } }],
  ['polities-outline', 'line', { 'line-color': '#25342f', 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 5, 0.8, 10, 1.2] }],
  ['search-outline', 'line', { 'line-color': '#005fcc', 'line-width': 2.5 }],
  ['selection-halo', 'line', { 'line-color': '#ffffff', 'line-width': 6 }],
  ['selection-outline', 'line', { 'line-color': '#101c16', 'line-width': 3 }]
];
const labelLayers = ['other-labels', 'polities-labels'];
const layerIds = [...paintLayers.flatMap(([id]) => [id, id + '-union']), ...labelLayers];
const idFilter = ids => ['in', ['get', 'OBJECTID'], ['literal', ids]];
const attribution = 'Aligned boundaries: Erin Mutch, UC Merced GIS Center · Source: Cliopatria; original maps by Tollefson';
function baseStyle(name) {
  if (name === 'plain' || !basemapKey) return { version: 8, glyphs: `https://basemaps-api.arcgis.com/arcgis/rest/services/World_Basemap_v2/VectorTileServer/resources/fonts/{fontstack}/{range}.pbf?token=${encodeURIComponent(basemapKey)}`, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f1f0e9' } }] };
  return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/${config.basemaps[name]}?token=${encodeURIComponent(basemapKey)}`;
}
export class HistoryMap {
  constructor(manifest, view, callbacks) {
    if (!window.maplibregl || !window.pmtiles) throw new Error('The map libraries could not load. Search and downloads remain available.');
    this.manifest = manifest;
    this.callbacks = callbacks;
    this.year = view.year;
    this.labels = view.labels;
    this.searchIds = [];
    this.selectedIds = [];
    this.basemap = view.basemap;
    this.projection = view.projection;
    this.styleReady = false;
    this.sourceRevision = 0;
    this.protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', this.protocol.tile);
    this.map = new maplibregl.Map({ container: 'map', style: baseStyle(this.basemap), center: view.center, zoom: view.zoom, maxZoom: 10, minZoom: 0,
      dragRotate: false, pitchWithRotate: false, fadeDuration: 0, maxTileCacheSize: 64, attributionControl: false,
      canvasContextAttributes: { antialias: false }, renderWorldCopies: true });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    for (const id of ['basemap-control', 'share-control', 'legend-control']) {
      const control = document.getElementById(id);
      this.map.addControl({
        onAdd() { control.hidden = false; return control; },
        onRemove() { control.remove(); }
      }, 'top-right');
    }
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left');
    this.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: attribution }), 'bottom-right');
    this.map.on('style.load', () => {
      this.styleReady = true;
      this.map.setProjection({ type: this.projection });
      this.install();
    });
    if (view.projection === 'globe') {
      // Restore the shared camera after the flat startup constraints are lifted,
      // unless the user has already moved the map.
      const center = this.map.getCenter(), zoom = this.map.getZoom();
      this.map.once('style.load', () => {
        const current = this.map.getCenter();
        if (this.projection === 'globe' && current.lat === center.lat && current.lng === center.lng && this.map.getZoom() === zoom) {
          this.map.jumpTo({ center: view.center, zoom: view.zoom });
        }
      });
    }
    this.map.on('idle', () => callbacks.loaded?.());
    this.map.on('moveend', () => callbacks.moved?.());
    this.map.on('error', event => {
      if (event.error?.name === 'AbortError' || /signal.*abort/i.test(event.error?.message || '')) return;
      callbacks.error?.('Some map tiles could not load. Check your connection or try a different basemap.');
      if (!this.styleReady && this.basemap !== 'plain') {
        this.basemap = 'plain';
        this.styleReady = false;
        this.map.setStyle(baseStyle('plain'), { diff: false });
        callbacks.basemapFallback?.();
      }
    });
    const hitLayers = ['polities-fill', 'polities-fill-union'];
    this.map.on('click', hitLayers, event => {
      const matches = new Map();
      for (const { properties } of event.features || []) {
        if (properties.Year !== this.year) continue;
        const key = this.snapshot?.byId.get(properties.OBJECTID)?.ids[0] ?? properties.OBJECTID;
        if (!matches.has(key)) matches.set(key, properties);
      }
      const candidates = [...matches.values()];
      if (candidates.length) callbacks.selected?.(candidates[0], event.lngLat, candidates);
    });
    this.map.on('mouseenter', hitLayers, () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', hitLayers, () => { this.map.getCanvas().style.cursor = ''; });
  }
  async install() {
    const revision = ++this.sourceRevision;
    const entry = this.manifest.years.find(item => item.year === this.year);
    this.popup?.remove();
    for (const id of [...layerIds].reverse()) if (this.map.getLayer(id)) this.map.removeLayer(id);
    for (const id of [this.historySource, 'polity-unions', 'polity-anchors']) {
      if (id && this.map.getSource(id)) this.map.removeSource(id);
    }
    this.historySource = null;
    this.snapshot = null;
    if (!entry) return;
    let snapshot;
    try {
      snapshot = await loadPolities(entry.year, this.manifest.sourceSHA256);
    } catch (error) {
      if (revision === this.sourceRevision && this.styleReady) this.callbacks.error?.(error.message);
    }
    if (revision !== this.sourceRevision || !this.styleReady) return;
    this.snapshot = snapshot;
    const url = new URL(entry.url, document.baseURI).href;
    // In-flight tile work from a discarded snapshot must never target its replacement.
    this.historySource = `history-${this.year}-${revision}`;
    this.map.addSource(this.historySource, { type: 'vector', url: `pmtiles://${url}`, minzoom: this.manifest.minZoom, maxzoom: this.manifest.maxZoom, attribution });
    const layer = { source: this.historySource, 'source-layer': config.sourceLayer };
    this.map.addSource('polity-unions', { type: 'geojson', data: snapshot?.unions ?? EMPTY, tolerance: 0 });
    this.map.addSource('polity-anchors', { type: 'geojson', data: snapshot?.labels ?? EMPTY, buffer: 0 });
    this.rawFilter = ['!', idFilter(snapshot?.replacedIds ?? [])];
    for (const [id, type, paint] of paintLayers) {
      const isOutlineHighlight = id === 'search-outline' || id.startsWith('selection-');
      this.map.addLayer({ id, type, ...layer, paint, filter: isOutlineHighlight ? idFilter([]) : this.rawFilter });
      this.map.addLayer({ id: id + '-union', type, source: 'polity-unions', paint, ...(isOutlineHighlight && { filter: idFilter([]) }) });
    }
    // Basemap styles supply different font stacks. Reuse an available one when possible.
    const fonts = this.map.getStyle().layers.filter(item => item.type === 'symbol' && Array.isArray(item.layout?.['text-font'])).map(item => item.layout['text-font']);
    const font = fonts.find(stack => stack.every(name => typeof name === 'string') && stack.some(name => /regular/i.test(name))) || fonts[0] || ['Ubuntu Regular'];
    const symbol = { type: 'symbol', minzoom: 2, layout: { 'text-field': ['get', 'Name'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13], 'text-max-width': 12, 'text-padding': 5, visibility: this.labels ? 'visible' : 'none' },
      paint: { 'text-color': '#14241d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } };
    const hasName = ['!=', ['get', 'Name'], ''];
    this.map.addLayer({ id: 'other-labels', ...symbol, ...layer,
      filter: snapshot ? ['all', hasName, ['!=', ['get', 'Type'], 'POLITY']] : hasName });
    this.map.addLayer({ id: 'polities-labels', ...symbol, source: 'polity-anchors' });
    this.updateHighlights();
  }
  setYear(year) {
    this.year = year;
    this.selectedIds = [];
    this.searchIds = [];
    if (this.styleReady) this.install();
  }
  setBasemap(name) {
    this.basemap = name; this.styleReady = false;
    // A complete style reload reliably emits style.load so historical layers
    // are restored after changing providers with different source definitions.
    this.map.setStyle(baseStyle(name), { diff: false });
  }
  setProjection(type) {
    this.projection = type;
    if (this.styleReady) this.map.setProjection({ type });
  }
  setLabels(enabled) {
    this.labels = enabled;
    for (const id of labelLayers) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none');
  }
  highlight(ids) { this.searchIds = ids; this.updateHighlights(); }
  select(ids) { this.selectedIds = ids; this.updateHighlights(); }
  updateHighlights() {
    if (!this.map.getLayer('search-outline')) return;
    for (const [layers, ids] of [[['search-outline'], this.searchIds], [['selection-halo', 'selection-outline'], this.selectedIds]]) {
      const representatives = new Set();
      for (const id of ids) {
        const group = this.snapshot?.byId.get(id);
        if (group?.geometry) representatives.add(group.ids[0]);
      }
      for (const layer of layers) {
        this.map.setFilter(layer, ['all', this.rawFilter, idFilter(ids)]);
        this.map.setFilter(layer + '-union', idFilter([...representatives]));
      }
    }
  }
  showPopup(properties, lngLat) {
    this.popup?.remove();
    if (!lngLat) return;
    const content = document.createElement('div'); content.className = 'feature-popup';
    const title = document.createElement('h3'); title.textContent = featureName(properties);
    const details = document.createElement('dl');
    for (const [label, value] of featureDetails(properties)) {
      const term = document.createElement('dt'), definition = document.createElement('dd');
      term.textContent = label; definition.textContent = value; details.append(term, definition);
    }
    content.append(title, details);
    const wiki = wikipediaUrl(properties.Wikipedia);
    if (wiki) {
      const link = document.createElement('a'); link.href = wiki;
      link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = 'Read on Wikipedia ↗';
      link.setAttribute('aria-label', `Read about ${featureName(properties)} on Wikipedia (opens in a new tab)`);
      content.append(link);
    }
    const noteText = selectionNote(properties);
    if (noteText) {
      const note = document.createElement('p'); note.className = 'small';
      note.textContent = noteText;
      content.append(note);
    }
    this.popup = new maplibregl.Popup({ focusAfterOpen: false, maxWidth: 'min(300px, calc(100vw - 32px))' }).setLngLat(lngLat).setDOMContent(content).addTo(this.map);
  }
  clearSelection() { this.selectedIds = []; this.popup?.remove(); this.updateHighlights(); }
  fit(extent) {
    if (extent) this.map.fitBounds([[extent.xmin, extent.ymin], [extent.xmax, extent.ymax]], { padding: 55, maxZoom: 6, duration: 0 });
  }
  reset() { this.map.jumpTo({ center: config.defaultCenter, zoom: config.defaultZoom }); }
  view() { const center = this.map.getCenter(); return { longitude: center.lng, latitude: center.lat, zoom: this.map.getZoom() }; }
  bounds() { const b = this.map.getBounds(); return { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }; }
  isLoaded() { return !!this.historySource && !!this.map.getSource(this.historySource) && this.map.isSourceLoaded(this.historySource); }
}
