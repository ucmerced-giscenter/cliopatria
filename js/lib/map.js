import { config } from '../config.js';
import { basemapKey } from '../basemap-key.js';
import { featureName, featureDetails, wikipediaUrl } from './core.js';

const layerIds = ['polities-fill', 'polities-outline', 'search-outline', 'selection-halo', 'selection-outline', 'polities-labels'];
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
    this.selectedId = -1;
    this.basemap = view.basemap;
    this.styleReady = false;
    this.protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', this.protocol.tile);
    this.map = new maplibregl.Map({ container: 'map', style: baseStyle(this.basemap), center: view.center, zoom: view.zoom, maxZoom: 10, minZoom: 0,
      dragRotate: false, pitchWithRotate: false, fadeDuration: 0, maxTileCacheSize: 64, attributionControl: false,
      canvasContextAttributes: { antialias: false }, renderWorldCopies: true });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-left');
    this.map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: attribution }), 'bottom-right');
    this.map.on('style.load', () => { this.styleReady = true; this.install(); });
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
    this.map.on('click', 'polities-fill', event => {
      const candidates = [...new Map((event.features || []).map(feature => [feature.properties.OBJECTID, feature.properties])).values()];
      if (candidates.length) callbacks.selected?.(candidates[0], event.lngLat, candidates);
    });
    this.map.on('mouseenter', 'polities-fill', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'polities-fill', () => { this.map.getCanvas().style.cursor = ''; });
  }
  install() {
    const entry = this.manifest.years.find(item => item.year === this.year);
    if (!entry) return;
    this.popup?.remove();
    for (const id of [...layerIds].reverse()) if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource('history')) this.map.removeSource('history');
    const url = new URL(entry.url, document.baseURI).href;
    this.map.addSource('history', { type: 'vector', url: `pmtiles://${url}`, minzoom: this.manifest.minZoom, maxzoom: this.manifest.maxZoom, attribution });
    const layer = { source: 'history', 'source-layer': config.sourceLayer };
    this.map.addLayer({ id: 'polities-fill', type: 'fill', ...layer, paint: { 'fill-color': ['get', 'Color'], 'fill-opacity': 0.68, 'fill-opacity-transition': { duration: 0 } } });
    this.map.addLayer({ id: 'polities-outline', type: 'line', ...layer, paint: { 'line-color': '#25342f', 'line-opacity': 0.65, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.25, 5, 0.8, 10, 1.2] } });
    this.map.addLayer({ id: 'search-outline', type: 'line', ...layer, paint: { 'line-color': '#005fcc', 'line-width': 2.5 } });
    this.map.addLayer({ id: 'selection-halo', type: 'line', ...layer, paint: { 'line-color': '#ffffff', 'line-width': 6 } });
    this.map.addLayer({ id: 'selection-outline', type: 'line', ...layer, paint: { 'line-color': '#101c16', 'line-width': 3 } });
    // Basemap styles supply different font stacks. Reuse an available one when possible.
    const fonts = this.map.getStyle().layers.filter(item => item.type === 'symbol' && Array.isArray(item.layout?.['text-font'])).map(item => item.layout['text-font']);
    const font = fonts.find(stack => stack.every(name => typeof name === 'string') && stack.some(name => /regular/i.test(name))) || fonts[0] || ['Ubuntu Regular'];
    this.map.addLayer({ id: 'polities-labels', type: 'symbol', ...layer, minzoom: 2,
      filter: ['!=', ['get', 'Name'], ''], layout: { 'text-field': ['get', 'Name'], 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 6, 13], 'text-max-width': 12, 'text-padding': 5, visibility: this.labels ? 'visible' : 'none' },
      paint: { 'text-color': '#14241d', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } });
    this.updateHighlights();
  }
  setYear(year) {
    this.year = year;
    this.selectedId = -1;
    this.searchIds = [];
    // A year can change while the previous year's tiles are still loading.
    // isStyleLoaded() also waits for those tiles, so it would lose fast slider changes.
    if (this.styleReady) this.install();
  }
  setBasemap(name) {
    this.basemap = name; this.styleReady = false;
    // A complete style reload reliably emits style.load so historical layers
    // are restored after changing providers with different source definitions.
    this.map.setStyle(baseStyle(name), { diff: false });
  }
  setLabels(enabled) { this.labels = enabled; if (this.map.getLayer('polities-labels')) this.map.setLayoutProperty('polities-labels', 'visibility', enabled ? 'visible' : 'none'); }
  highlight(ids) { this.searchIds = ids; this.updateHighlights(); }
  select(id) { this.selectedId = id; this.updateHighlights(); }
  updateHighlights() {
    if (!this.map.getLayer('search-outline')) return;
    this.map.setFilter('search-outline', ['in', ['get', 'OBJECTID'], ['literal', this.searchIds]]);
    for (const id of ['selection-halo', 'selection-outline']) this.map.setFilter(id, ['==', ['get', 'OBJECTID'], this.selectedId]);
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
    if (!properties.Name?.trim()) {
      const note = document.createElement('p'); note.className = 'small';
      note.textContent = 'Some region polygons intentionally have no name in the source dataset.';
      content.append(note);
    }
    this.popup = new maplibregl.Popup({ focusAfterOpen: false, maxWidth: 'min(300px, calc(100vw - 32px))' }).setLngLat(lngLat).setDOMContent(content).addTo(this.map);
  }
  clearSelection() { this.selectedId = -1; this.popup?.remove(); this.updateHighlights(); }
  fit(extent) {
    if (extent) this.map.fitBounds([[extent.xmin, extent.ymin], [extent.xmax, extent.ymax]], { padding: 55, maxZoom: 6, duration: 0 });
  }
  reset() { this.map.jumpTo({ center: config.defaultCenter, zoom: config.defaultZoom }); }
  view() { const center = this.map.getCenter(); return { longitude: center.lng, latitude: center.lat, zoom: this.map.getZoom() }; }
  bounds() { const b = this.map.getBounds(); return { west: b.getWest(), east: b.getEast(), south: b.getSouth(), north: b.getNorth() }; }
  isLoaded() { return !!this.map.getSource('history') && this.map.isSourceLoaded('history'); }
}
