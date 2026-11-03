# Cliopatria — aligned historical polity boundaries

Interactive map of the aligned Cliopatria dataset: polities, rulers' territories, peoples and events from 3400 BCE to 2024 CE, one feature per polity per panel year. Built and hosted by the GIS Center, UC Merced Library.

Cliopatria (Bennett, Mutch, Chalstrey et al., *Scientific Data* 2025) was machine-generated from scanned historical atlases. This release realigns the boundaries to a common coastline, resolves overlaps and duplicates, and generalizes to a 3 km tolerance so the data can be served and downloaded at practical sizes.

**Live map:** https://<org>.github.io/cliopatria/ (in development)
**Data:** ArcGIS Online hosted feature layer — <item https://arcg.is/1Kb5by5> · field dictionary in `docs/`

## Status
Development. Coverage 3400 BCE–1000 CE is reviewed and corrected; CE 1000–2024 will be appended when its review is complete. Attribute values may still change.

## Stack
- MapLibre GL JS, static site on GitHub Pages
- Data served from an ArcGIS Online hosted feature layer (per-year GeoJSON queries); PMTiles planned
- No build step; plain HTML/JS

## MVP
- [ ] Map with basemap selector
- [ ] Year slider (269 panels)
- [ ] Search by polity name
- [ ] Popup with Wikipedia link
- [ ] Fill colour from the `Color` field
- [ ] GeoJSON download
- [ ] Citation page and GitHub link

## License
Code: MIT. Data: CC BY 4.0, derived from Cliopatria v0.0.1 (CC BY 4.0, https://doi.org/10.5281/zenodo.13363121).

## Citation
Bennett, J. S., Mutch, E., Tollefson, A., et al. (2025). Cliopatria – A geospatial database of world-wide political entities from 3400BCE to 2024CE. *Scientific Data* 12, 247. Aligned release: GIS Center, UC Merced Library, 2026.
