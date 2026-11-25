# Cliopatria — aligned historical polity boundaries

Interactive map of polities, rulers' territories, peoples and events from 3400 BCE to 2024 CE. Built and hosted by the GIS Center, UC Merced Library.

Cliopatria (Bennett, Mutch, Chalstrey et al., *Scientific Data* 2025) was machine-generated from scanned historical atlases. This release realigns the boundaries to a common coastline, resolves overlaps and duplicates, and generalizes to a 3 km tolerance so the data can be served and downloaded at practical sizes.

[Live map](https://ucmerced-giscenter.github.io/cliopatria/) · [v1.2 release and GeoJSON](https://github.com/ucmerced-giscenter/cliopatria/releases/tag/v1.2-dev) · [ArcGIS feature layer](https://ucmerced.maps.arcgis.com/home/item.html?id=735e05986b18429ea53637ea86e2a574) · [Field dictionary](developer.html#field-dictionary)

## Status

This branch uses Aligned Cliopatria v1.2. It contains 159,681 polygon records across 508 snapshots. Multiple polygons can represent the same polity in a snapshot. The new Wikidata and SeshatID fields link records to external identifiers when available.

## Stack

- MapLibre GL JS renders one PMTiles archive per snapshot.
- ArcGIS Online provides search, feature details and downloads. Map features use the hosted layer’s OBJECTIDs.
- Static HTML and JavaScript run without an application build step. Local previews need an HTTP server with byte-range support for PMTiles.

## License

See the repository [license](LICENSE) for code reuse. Data are licensed under CC BY 4.0. The aligned v1.2 release draws its external identifiers from [upstream Cliopatria v0.2.1](https://github.com/Seshat-Global-History-Databank/cliopatria/releases/tag/v0.2.1).

## Citation

Bennett, J. S., Mutch, E., Tollefson, A., et al. (2025). Cliopatria – A geospatial database of world-wide political entities from 3400BCE to 2024CE. *Scientific Data* 12, 247. Aligned release: GIS Center, UC Merced Library, 2026.
