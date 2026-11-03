# Cliopatria

A simple historical map of the aligned Cliopatria dataset, covering 3400 BCE–1497 CE. Plain HTML, CSS, and JavaScript with MapLibre, yearly PMTiles, and public ArcGIS services for search and downloads.

## Run locally

1. Open this `final_work` folder in VS Code.
2. Right-click `index.html` and select **Open with Live Server**.
3. Use the local HTTP address opened by Live Server.

No installation, build command, or custom backend is required. Use Live Server instead of opening the HTML file directly. Internet access is needed for Esri basemaps, search, feature details, and exports.

## Folder structure

```text
final_work/
├── index.html          Map, timeline, search, and downloads
├── about.html          Project and dataset information
├── cite.html           Citations
├── help.html           User instructions
├── developer.html      Service endpoints and field dictionary
├── favicon.svg
├── css/
│   └── styles.css
├── js/
│   ├── app.js          Main application
│   ├── config.js       Dataset URLs and map defaults
│   ├── basemap-key.js  Public Esri browser key
│   ├── cite.js         Citation tools
│   └── lib/            Map, queries, exports, and shared helpers
├── data/
│   ├── manifest.json   Available years and tile locations
│   └── years/          333 yearly .pmtiles files
├── vendor/             MapLibre, PMTiles, and their licenses
├── .gitignore
├── .nojekyll           Static hosting on GitHub Pages
└── README.md
```

## Data and hosting

The PMTiles files total about **48.6 MiB** on disk. The map requests tiles for the selected year as needed; it does not load the entire dataset on startup. Search and downloads use the hosted ArcGIS feature layer. Exports preserve whole polygons.

Use this folder's contents as the website/repository root and preserve the directory structure. There is no separate build output. Hosting must support HTTP byte-range requests (`206 Partial Content`) for PMTiles. Keep the display tiles and hosted feature layer on the same dataset release, especially if feature IDs change.

The public browser key is in `js/basemap-key.js`; configure its allowed domains for the eventual host. Confirm the project's code/data licensing and final credits before public release. Third-party library licenses are included in `vendor/`. Analytics are not enabled.

This folder contains the runnable website. Development tools, tests, large source files, and review reports remain in the original workspace for later review.
