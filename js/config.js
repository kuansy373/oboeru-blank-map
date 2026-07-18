export const LAYER_Z_INDEX = {
  countries:         0,
  antarctica:        1,
  usaStates:         1,
  chinaProvinces:    1,
  japanPrefectures:  1,
  japanOldProvinces: 1,
};

export const LAYER_KEYS = Object.keys(LAYER_Z_INDEX);

export const DYNAMIC_FRONT_KEYS = ['japanPrefectures', 'japanOldProvinces'];

export const REGION_TO_SOURCE = {
  'Antarctica':        'antarctica',
  'USA States':        'usaStates',
  'China Provinces':   'chinaProvinces',
  'Japan Prefectures': 'japanPrefectures',
  'Japan Old Provinces': 'japanOldProvinces',
};

export const SOURCE_KEY_TO_REGION = Object.fromEntries(
  Object.entries(REGION_TO_SOURCE).map(([region, sourceKey]) => [sourceKey, region])
);

export const GRID_KEYS = ['meridians', 'parallels'];

export const GEOJSON_REGIONS = {
  ...Object.fromEntries(
    Object.entries(REGION_TO_SOURCE).map(([region, key]) => [
      region,
      { key, codeProp: 'id', nameProp: 'names' }
    ])
  ),
  'Default': { key: 'countries', codeProp: 'id', nameProp: 'names' },
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

export const PIN_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="95 80 115 145">
<g transform="translate(305, 0) scale(-1, 1)">
  <path class="st0" d="M168.14,181.73c-7.37-32.32,3.25-65.79,9.66-62.64l8.08,3.98l6.52-13.25L149.8,88.85l-6.52,13.25l8.08,3.98
    c5.09,2.93-17.88,31.72-43.75,45.85L168.14,181.73z"/>
  <line class="st1" x1="116.06" y1="211.15" x2="136.59" y2="169.43"/>
</g>
</svg>`;
