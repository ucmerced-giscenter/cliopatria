// Public URLs and presentation settings. No account credentials are required for data.
export const config = {
  itemId: '8eae64c12ac047d3933d43e449c8e551',
  serviceUrl: 'https://services2.arcgis.com/wx8u046p68e0iGuj/arcgis/rest/services/Aligned_Cliopatria_v1.1_WGS84/FeatureServer',
  layerId: 0,
  manifestUrl: './data/manifest.json',
  sourceLayer: 'polities',
  version: 'Aligned Cliopatria v1.1',
  repositoryUrl: 'https://github.com/ucmerced-giscenter/cliopatria',
  repositoryPrivate: true,
  defaultCenter: [20, 28],
  defaultZoom: 1.5,
  animationInterval: 2000,
  // The user-supplied public basemap key is in basemap-key.js. Restrict it to deployment origins.
  basemaps: { gray: 'arcgis/light-gray', topographic: 'arcgis/topographic', imagery: 'arcgis/imagery', plain: null }
};
