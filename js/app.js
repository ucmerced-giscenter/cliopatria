import { config } from './config.js';
import { DataService, exportFile } from './lib/api.js';
import { FORMATS, formatYear, featureName, colorHex, yearWhere, nameWhere, andWhere, idsWhere, idFilters, envelopes, mercatorEnvelope, readUrl, wikipediaUrl } from './lib/core.js';
import { HistoryMap } from './lib/map.js';

const $ = id => document.getElementById(id);
const api = new DataService();
let manifest, years, year, engine, selected, querySpec, queryRows = [], queryTotal = 0;
let searchController, highlightController, selectionController, exportController;
let searchRevision = 0, selectionRevision = 0, sliderTimer, playbackTimer, playing = false, mapError = false;
let overlapCandidates = [], overlapPoint;

function status(id, message, error = false) { $(id).textContent = message; $(id).dataset.error = String(error); }
function updateUrl() {
  if (!years) return;
  const params = new URLSearchParams();
  params.set('year', year);
  if (engine) {
    const view = engine.view();
    params.set('lng', view.longitude.toFixed(4)); params.set('lat', view.latitude.toFixed(4)); params.set('zoom', view.zoom.toFixed(2));
  }
  if ($('basemap').value !== 'gray') params.set('basemap', $('basemap').value);
  if (!$('labels').checked) params.set('labels', 'off');
  if (querySpec) {
    if (querySpec.term) params.set('q', querySpec.term);
    if (querySpec.allYears) params.set('search', 'all');
  }
  history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
}
function updateScopeOptions() {
  $('download-scope').querySelector('[value=selected]').disabled = !selected;
  $('download-scope').querySelector('[value=search]').disabled = !querySpec;
  $('download-scope').querySelector('[value=extent]').disabled = !engine;
  if ((!selected && $('download-scope').value === 'selected') || (!querySpec && $('download-scope').value === 'search')) $('download-scope').value = 'time';
  updateExportControls();
}
function clearSelection() {
  selectionController?.abort(); selectionRevision++;
  selected = null; engine?.clearSelection();
  $('selection-empty').hidden = false; $('feature-detail').hidden = true; $('overlap-options').hidden = true;
  status('selection-status', '');
  updateScopeOptions();
  for (const button of $('search-results').querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
}
function renderYear() {
  const index = years.indexOf(year);
  $('year-slider').value = index;
  $('year-slider').setAttribute('aria-valuetext', formatYear(year));
  $('year-select').value = year;
  $('previous').disabled = index === 0; $('next').disabled = index === years.length - 1;
  $('panel-count').textContent = `Snapshot ${index + 1} of ${years.length} · no year zero`;
  const entry = manifest.years[index];
  status('map-status', `${formatYear(year)} · ${entry.count.toLocaleString()} feature${entry.count === 1 ? '' : 's'}`);
}
function stopPlayback() {
  playing = false; clearTimeout(playbackTimer);
  $('play').textContent = 'Play'; $('play').setAttribute('aria-pressed', 'false');
}
function changeYear(value, { playback = false, search = true } = {}) {
  if (!years.includes(value)) return;
  clearTimeout(sliderTimer);
  if (!playback) stopPlayback();
  year = value; mapError = false;
  clearSelection(); renderYear(); engine?.setYear(year); updateUrl();
  if (querySpec && search) {
    if (!querySpec.allYears) runSearch(false);
    else updateHighlights();
  }
}
function schedulePlayback() {
  clearTimeout(playbackTimer);
  if (!playing) return;
  playbackTimer = setTimeout(() => {
    if (!playing) return;
    if (document.hidden || years.indexOf(year) === years.length - 1) { stopPlayback(); return; }
    if (engine && !engine.isLoaded()) { schedulePlayback(); return; }
    changeYear(years[years.indexOf(year) + 1], { playback: true });
    schedulePlayback();
  }, config.animationInterval);
}
async function updateHighlights() {
  highlightController?.abort();
  if (!querySpec || !engine) { engine?.highlight([]); return; }
  const controller = highlightController = new AbortController();
  const requestedYear = year;
  try {
    const ids = await api.ids(andWhere(nameWhere(querySpec.term), yearWhere(requestedYear)), controller.signal);
    if (!controller.signal.aborted && year === requestedYear) engine.highlight(ids);
  } catch (error) { if (error.name !== 'AbortError') status('search-status', 'Results are available, but map highlighting could not be refreshed.', true); }
}
function searchPredicate(spec = querySpec) { return andWhere(nameWhere(spec.term), spec.allYears ? null : yearWhere(spec.year)); }
function renderResults() {
  const list = $('search-results'); list.replaceChildren();
  for (const feature of queryRows) {
    const item = document.createElement('li');
    const button = document.createElement('button'); button.type = 'button'; button.className = 'result-button';
    button.dataset.objectid = feature.OBJECTID;
    button.setAttribute('aria-pressed', String(selected?.OBJECTID === feature.OBJECTID));
    const title = document.createElement('strong');
    const swatch = document.createElement('i'); swatch.className = 'swatch'; swatch.style.backgroundColor = colorHex(feature.Color); swatch.setAttribute('aria-hidden', 'true');
    title.append(swatch, document.createTextNode(featureName(feature)));
    const detail = document.createElement('span'); detail.textContent = `${formatYear(feature.Year)} · ${feature.Type || 'Feature'}${Number.isFinite(feature.AreaSqKM) ? ` · ${feature.AreaSqKM.toLocaleString(undefined, { maximumFractionDigits: 1 })} km²` : ''}`;
    button.append(title, detail); button.addEventListener('click', () => selectFeature(feature, null, true));
    item.append(button); list.append(item);
  }
  $('more-results').hidden = queryRows.length >= queryTotal;
}
async function runSearch(more = false) {
  searchController?.abort();
  const revision = ++searchRevision;
  const controller = searchController = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Search timed out. Please try again.', 'TimeoutError')), 30000);
  if (!more) {
    querySpec = { term: $('search-input').value.trim(), allYears: $('search-years').value === 'all', year };
    queryRows = []; queryTotal = 0; renderResults();
  }
  const where = searchPredicate();
  status('search-status', 'Searching the source dataset…');
  $('search-button').disabled = true; $('more-results').disabled = true;
  updateScopeOptions(); updateUrl();
  try {
    const [rows, count] = await Promise.all([api.search(where, queryRows.length, controller.signal), more ? queryTotal : api.count(where, controller.signal)]);
    if (revision !== searchRevision) return;
    queryRows.push(...rows); queryTotal = count;
    renderResults();
    status('search-status', count ? `${queryRows.length.toLocaleString()} of ${count.toLocaleString()} results. Select a result to view its details.` : 'No matching features. Try a different name or search all years.');
    updateHighlights();
  } catch (error) { if (revision === searchRevision && error.name !== 'AbortError') status('search-status', error.message, true); }
  finally { clearTimeout(timer); if (revision === searchRevision) { $('search-button').disabled = false; $('more-results').disabled = false; } }
}
async function selectFeature(candidate, point, zoomToFeature = false) {
  stopPlayback();
  if (Number(candidate.Year) !== year) changeYear(Number(candidate.Year), { search: false });
  selectionController?.abort();
  const revision = ++selectionRevision;
  const controller = selectionController = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('Feature lookup timed out. Please select it again.', 'TimeoutError')), 30000);
  status('selection-status', 'Loading feature information…');
  try {
    const [feature, extent] = await Promise.all([api.feature(Number(candidate.OBJECTID), controller.signal), zoomToFeature ? api.extent(Number(candidate.OBJECTID), controller.signal) : null]);
    if (revision !== selectionRevision) return;
    if (feature.Year !== year) throw new Error('The source layer has changed since these map tiles were prepared. Please check the source item.');
    selected = feature;
    $('selection-empty').hidden = true; $('feature-detail').hidden = false;
    $('feature-name').textContent = featureName(feature);
    const fields = $('feature-fields'); fields.replaceChildren();
    for (const [label, value] of [['Year', formatYear(feature.Year)], ['Area (km²)', Number.isFinite(feature.AreaSqKM) ? feature.AreaSqKM.toLocaleString(undefined, { maximumFractionDigits: 1 }) : 'Not supplied'], ['Type', feature.Type || 'Not supplied']]) {
      const term = document.createElement('dt'), definition = document.createElement('dd'); term.textContent = label; definition.textContent = value; fields.append(term, definition);
    }
    const wiki = wikipediaUrl(feature.Wikipedia); $('wikipedia-link').hidden = !wiki;
    if (wiki) $('wikipedia-link').href = wiki; else $('wikipedia-link').removeAttribute('href');
    $('feature-note').textContent = feature.Name?.trim() ? '' : 'Some region polygons intentionally have no name in the source dataset.';
    engine?.select(feature.OBJECTID); engine?.showPopup(feature, point);
    if (extent) engine?.fit(extent);
    status('selection-status', `Selected ${featureName(feature)}, ${formatYear(feature.Year)}.`);
    updateScopeOptions(); renderResults(); updateHighlights();
  } catch (error) { if (revision === selectionRevision && error.name !== 'AbortError') status('selection-status', error.message, true); }
  finally { clearTimeout(timer); }
}
function mapSelection(candidate, point, candidates) {
  overlapCandidates = candidates; overlapPoint = point;
  $('overlap-options').hidden = candidates.length < 2;
  $('overlap-select').replaceChildren(...candidates.map(feature => new Option(`${featureName(feature)} · ${feature.Type || 'Feature'}`, feature.OBJECTID)));
  selectFeature(candidate, point);
}
function updateExportControls() {
  const timed = ['time', 'extent'].includes($('download-scope').value);
  $('download-time').hidden = !timed;
  $('download-range').hidden = !timed || $('download-period').value !== 'range';
  for (const input of $('download-range').querySelectorAll('input')) input.disabled = $('download-range').hidden;
}
function exportPeriod() {
  const period = $('download-period').value;
  if (period === 'all') return { where: '1=1', description: 'all years' };
  if (period === 'current') return { where: yearWhere(year), description: formatYear(year) };
  const first = Number($('range-start').value), last = Number($('range-end').value);
  const where = yearWhere(first, last);
  if (first < years[0] || last > years.at(-1)) throw new Error(`Choose years between ${formatYear(years[0])} and ${formatYear(years.at(-1))}.`);
  return { where, description: `${formatYear(first)}–${formatYear(last)}` };
}
async function prepareDownload(event) {
  event.preventDefault();
  if ($('generate-download').disabled) return;
  const scope = $('download-scope').value, format = $('download-format').value;
  const controller = exportController = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('The export is taking too long. Try a smaller range or try again later.', 'TimeoutError')), 15 * 60 * 1000);
  $('generate-download').disabled = true; $('cancel-download').hidden = false; $('download-link').hidden = true; $('download-link').removeAttribute('href');
  $('download-parts').replaceChildren();
  status('download-status', 'Checking the selected features…');
  try {
    // Capture all criteria before the first await; later map movements do not alter this request.
    let where, description, count, filters, exportGeometry;
    if (scope === 'selected') {
      if (!selected) throw new Error('Select a feature first.');
      where = idsWhere([selected.OBJECTID]); description = `${featureName(selected)}, ${formatYear(selected.Year)}`;
    } else if (scope === 'search') {
      if (!querySpec) throw new Error('Run a search first.');
      where = searchPredicate(); description = `search “${querySpec.term || 'all features'}”, ${querySpec.allYears ? 'all years' : formatYear(querySpec.year)}`;
    } else if (scope === 'all') { where = '1=1'; description = 'entire dataset, all years'; }
    else {
      const period = exportPeriod(); where = period.where; description = period.description;
      if (scope === 'extent') {
        if (!engine) throw new Error('The map must be available to export its extent.');
        const bounds = engine.bounds(); description = `visible map extent, ${description}`;
        const ids = await api.extentIds(where, bounds, controller.signal);
        count = ids.length;
        // If the viewport includes every feature in this period, use the short
        // temporal predicate. Otherwise retain the exact selected IDs.
        const periodCount = await api.count(where, controller.signal);
        const boxes = envelopes(bounds);
        if (count === periodCount) filters = [where];
        else if (boxes.length === 1) { filters = [where]; exportGeometry = mercatorEnvelope(boxes[0]); }
        else filters = idFilters(ids); // Avoid duplicates across split antimeridian envelopes.
      }
    }
    if (count === undefined) count = await api.count(where, controller.signal);
    if (!count) throw new Error('No features match this selection. Choose a different year, range, or area.');
    const summary = `${count.toLocaleString()} feature${count === 1 ? '' : 's'} · ${description}`;
    const started = performance.now();
    filters ||= [where];
    for (let index = 0; index < filters.length; index++) {
      const part = filters.length > 1 ? `Part ${index + 1} of ${filters.length}. ` : '';
      const url = await exportFile(format, filters[index], { signal: controller.signal, geometry:exportGeometry, progress: message => status('download-status', `${summary}. ${part}${message}`) });
      const link = index === 0 ? $('download-link') : document.createElement('a');
      link.href = url; link.textContent = `Download ${FORMATS[format]}${filters.length > 1 ? ` · part ${index + 1} of ${filters.length}` : ''} ↗`;
      link.className = 'button-link'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.hidden = false;
      // Optional integration hook. No analytics is enabled by default.
      link.onclick = () => { window.plausible?.(`Download ${FORMATS[format]}`); };
      if (index) $('download-parts').append(link);
    }
    status('download-status', `${summary}. ${filters.length > 1 ? `All ${filters.length} parts are ready. Download each part to obtain the complete selection.` : `${FORMATS[format]} is ready.`} (${((performance.now() - started) / 1000).toFixed(1)} s to prepare).`);
  } catch (error) { status('download-status', `${error.name === 'AbortError' ? 'Stopped waiting. ArcGIS may still finish this export.' : error.message}${!$('download-link').hidden ? ' Links already shown contain only the completed parts.' : ''}`, error.name !== 'AbortError'); }
  finally { clearTimeout(timer); $('generate-download').disabled = false; $('cancel-download').hidden = true; }
}
async function initialize() {
  try {
    const response = await fetch(config.manifestUrl);
    if (!response.ok) throw new Error('The map snapshot list could not load. Reload the page or consult the source dataset.');
    manifest = await response.json();
    years = manifest.yearValues || manifest.years.map(entry => entry.year);
    if (!years.length || !manifest.complete) throw new Error('The map data build is not complete.');
    const view = readUrl(location.search, years, { center: config.defaultCenter, zoom: config.defaultZoom, basemaps: config.basemaps });
    year = view.year;
    $('year-select').replaceChildren(...years.map(value => new Option(formatYear(value), value)));
    $('year-select').disabled = false; $('year-slider').disabled = false; $('play').disabled = false;
    $('year-slider').max = years.length - 1;
    $('first-year').textContent = formatYear(years[0]); $('last-year').textContent = formatYear(years.at(-1));
    for (const id of ['range-start', 'range-end']) { $(id).min = years[0]; $(id).max = years.at(-1); }
    $('basemap').value = view.basemap; $('labels').checked = view.labels; $('search-input').value = view.q; $('search-years').value = view.allYears ? 'all' : 'current';
    renderYear();
    try {
      engine = new HistoryMap(manifest, view, { selected: mapSelection, moved: updateUrl, loaded: () => {
        if (!mapError) { const count = manifest.years[years.indexOf(year)].count; status('map-status', `${formatYear(year)} · ${count.toLocaleString()} feature${count === 1 ? '' : 's'}`); }
      },
        error: message => { mapError = true; stopPlayback(); status('map-status', message, true); },
        basemapFallback: () => { $('basemap').value = 'plain'; mapError = false; } });
    } catch (error) { $('map-failure').hidden = false; status('map-status', error.message, true); }
    $('year-slider').addEventListener('input', () => {
      stopPlayback(); clearTimeout(sliderTimer);
      const value = years[Number($('year-slider').value)];
      $('year-slider').setAttribute('aria-valuetext', formatYear(value));
      sliderTimer = setTimeout(() => changeYear(value), 120);
    });
    $('year-slider').addEventListener('change', () => changeYear(years[Number($('year-slider').value)]));
    $('year-select').addEventListener('change', () => changeYear(Number($('year-select').value)));
    $('previous').addEventListener('click', () => changeYear(years[years.indexOf(year) - 1]));
    $('next').addEventListener('click', () => changeYear(years[years.indexOf(year) + 1]));
    $('play').addEventListener('click', () => {
      if (playing) { stopPlayback(); return; }
      if (year === years.at(-1)) changeYear(years[0]);
      playing = true; $('play').textContent = 'Pause'; $('play').setAttribute('aria-pressed', 'true'); schedulePlayback();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopPlayback(); });
    $('basemap').addEventListener('change', () => { mapError = false; engine?.setBasemap($('basemap').value); updateUrl(); });
    $('labels').addEventListener('change', () => { engine?.setLabels($('labels').checked); updateUrl(); });
    $('reset-view').addEventListener('click', () => engine?.reset());
    $('copy-link').addEventListener('click', async () => {
      updateUrl();
      try { await navigator.clipboard.writeText(location.href); $('copy-link').textContent = 'Link copied'; setTimeout(() => { $('copy-link').textContent = 'Copy map link'; }, 1800); }
      catch { status('map-status', 'Copy the address from your browser to share this map view.'); }
    });
    $('search-form').addEventListener('submit', event => { event.preventDefault(); stopPlayback(); runSearch(); });
    $('more-results').addEventListener('click', () => runSearch(true));
    $('clear-search').addEventListener('click', () => {
      searchController?.abort(); highlightController?.abort(); searchRevision++;
      querySpec = null; queryRows = []; queryTotal = 0; $('search-input').value = ''; engine?.highlight([]); renderResults(); updateScopeOptions(); updateUrl();
      $('search-button').disabled = false; status('search-status', 'Search cleared. Leave the name blank to browse features.');
    });
    $('clear-selection').addEventListener('click', clearSelection);
    $('overlap-select').addEventListener('change', () => { const feature = overlapCandidates.find(item => item.OBJECTID === Number($('overlap-select').value)); if (feature) selectFeature(feature, overlapPoint); });
    $('download-scope').addEventListener('change', updateExportControls); $('download-period').addEventListener('change', updateExportControls);
    $('download-form').addEventListener('submit', prepareDownload); $('cancel-download').addEventListener('click', () => exportController?.abort());
    updateScopeOptions(); updateUrl();
    if (view.q) runSearch();
  } catch (error) { status('map-status', error.message, true); status('search-status', 'The snapshot list is unavailable. See Help or open the source dataset.', true); }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true }); else initialize();
