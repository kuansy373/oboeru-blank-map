export const LAYER_ORDER = ['countries', 'usaStates', 'chinaProvinces', 'japanPrefectures'];

export const REGION_TO_SOURCE = {
  'USA States':        'usaStates',
  'China Provinces':   'chinaProvinces',
  'Japan Prefectures': 'japanPrefectures',
};

export const SOURCE_KEY_TO_REGION = Object.fromEntries(
  Object.entries(REGION_TO_SOURCE).map(([region, sourceKey]) => [sourceKey, region])
);

export const GEOJSON_REGIONS = {
  ...Object.fromEntries(
    Object.entries(REGION_TO_SOURCE).map(([region, key]) => [
      region,
      { key, codeProp: 'id', nameProp: 'name' }
    ])
  ),
  'Default': { key: 'countries', codeProp: 'name', nameProp: 'name' },
};

export const themes = {
  light: { sea: '#fff' },
  dark:  { sea: '#000' },
};

export const ZOOM_LEVELS = [
  [5_000_000, 3], [1_000_000, 4], [100_000, 5], [10_000, 6],
  [1_000, 7], [100, 8], [10, 9], [5, 10], [1, 11], [0.5, 12], [0.1, 13], [0.05, 14]
];

export const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <rect x="9" y="9" width="13" height="13" rx="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;
