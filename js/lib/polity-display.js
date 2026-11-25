const snapshots = new Map();

export function loadPolityLabels(year, sourceHash) {
  const url = new URL(`../../data/polity-display/${year}.json`, import.meta.url);
  url.searchParams.set('v', sourceHash);
  if (!snapshots.has(url.href)) {
    const pending = fetch(url, { signal: AbortSignal.timeout(15000) }).then(async response => {
      if (!response.ok) throw new Error('Polity names could not load for this snapshot.');
      const points = await response.json();
      if (points.type !== 'FeatureCollection' || !Array.isArray(points.features) || points.year !== year || points.sourceSHA256 !== sourceHash) {
        throw new Error('The polity labels and map tiles identify different snapshots or releases.');
      }
      return points;
    });
    snapshots.set(url.href, pending);
    if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
    pending.catch(() => {
      if (snapshots.get(url.href) === pending) snapshots.delete(url.href);
    });
  }
  return snapshots.get(url.href);
}
