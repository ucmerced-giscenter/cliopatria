// Public URLs and presentation settings. No account credentials are required for data.
export const config = {
  itemId: '735e05986b18429ea53637ea86e2a574',
  serviceUrl: 'https://services2.arcgis.com/wx8u046p68e0iGuj/arcgis/rest/services/Aligned_Cliopatria_v1_2_WGS84/FeatureServer',
  layerId: 0,
  manifestUrl: './data/manifest.json?v=1.2',
  sourceLayer: 'polities',
  version: 'Aligned Cliopatria v1.2',
  repositoryUrl: 'https://github.com/ucmerced-giscenter/cliopatria',
  repositoryPrivate: false,
  defaultCenter: [20, 28],
  defaultZoom: 1.5,
  animationInterval: 2000,
  // The user-supplied public basemap key is in basemap-key.js. Restrict it to deployment origins.
  basemaps: {
    gray: 'arcgis/light-gray',
    topographic: 'arcgis/topographic',
    imagery: 'arcgis/imagery',
    osm: 'open/osm-style',
    'osm-relief': 'open/osm-style-relief',
    plain: null
  }
};
