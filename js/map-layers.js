import { LAYER_Z_INDEX, LAYER_KEYS, REGION_TO_SOURCE, GRID_KEYS, ZOOM_LEVELS, themes } from './config.js';
import { normalize, getRegion, getFeatureId } from './utils.js';
import { geoPaths } from './regions.js';

// ==================
// モジュール内状態
// ==================

// initMapLayers() で初期化されるモジュールスコープのシングルトン
// 初期化前に他の関数を呼び出さないこと
let map;
let layersPanel;

export const geojsonData = {};
export const filledFeatures = {};

const featureIndex = {};

// ==================
// フィーチャーインデックス
// ==================

export function buildFeatureIndex(key, data) {
  const index = new Map();
  data.features.forEach(feature => {
    const { id } = feature.properties;
    if (id) index.set(normalize(id), feature);
  });
  featureIndex[key] = index;
}

export function findFeatureById(id, sources = LAYER_KEYS) {
  const n = normalize(id);
  for (const sourceKey of sources) {
    const feature = featureIndex[sourceKey]?.get(n);
    if (feature) return feature;
  }
  return null;
}

export function getSourcesForRegion(region) {
  const source = REGION_TO_SOURCE[region];
  return source ? [source] : undefined;
}

// ==================
// 色塗り操作
// ==================

export function fillFeature(key, featureId, color) {
  filledFeatures[featureId] = { color, layerId: key };
  map.setFeatureState({ source: key, id: featureId }, { fillColor: color });
}

export function clearFeature(key, featureId) {
  delete filledFeatures[featureId];
  map.removeFeatureState({ source: key, id: featureId });
}

export function applyToRegionFeatures(region, callback) {
  LAYER_KEYS.forEach(key => {
    const data = geojsonData[key];
    if (!data?.features) return;
    data.features.forEach(f => {
      if (getRegion(f.properties, key) !== region) return;
      const fId = getFeatureId(f);
      if (fId) callback(key, fId, f);
    });
  });
}

// ==================
// ズーム・フライト
// ==================

const shift = c => [c[0] < 0 ? c[0] + 360 : c[0], c[1]];

const shiftByType = {
  Point:              coords => shift(coords),
  LineString:         coords => coords.map(shift),
  MultiPoint:         coords => coords.map(shift),
  Polygon:            coords => coords.map(ring => ring.map(shift)),
  MultiLineString:    coords => coords.map(ring => ring.map(shift)),
  MultiPolygon:       coords => coords.map(poly => poly.map(ring => ring.map(shift))),
};

function shiftGeometry(coords, type) {
  return shiftByType[type]?.(coords) ?? coords;
}

function calcCenter(geometry) {
  const [minLng, , maxLng] = turf.bbox(geometry);
  if (maxLng - minLng <= 180) {
    return turf.centroid(geometry).geometry.coordinates;
  }
  const shifted = {
    type: geometry.type,
    coordinates: shiftGeometry(geometry.coordinates, geometry.type),
  };
  const [w, s, e, n] = turf.bbox(shifted);
  const cx = (w + e) / 2;
  return [cx > 180 ? cx - 360 : cx, (s + n) / 2];
}

export function zoomToFeature(feature) {
  if (!feature?.geometry) return;
  const { geometry } = feature;
  const center = calcCenter(geometry);
  const area = turf.area(geometry) / 1_000_000;
  const zoom = ZOOM_LEVELS.find(([t]) => area > t)?.[1] ?? 15;
  map.flyTo({ center, zoom, duration: 1000 });
}

// ==================
// レイヤー表示制御
// ==================

const LAYER_TYPES = ['fill', 'line'];

const LAYER_ID = {
  fill:    key => `${key}-fill`,
  line:    key => `${key}-line`,
  hitarea: key => `${key}-line-hitarea`,
};

// LAYER_TYPES のループを一本化するヘルパー
function forEachLayerId(key, fn) {
  LAYER_TYPES.forEach(type => {
    const id = LAYER_ID[type](key);
    if (map.getLayer(id)) fn(id);
  });
}

export function setLayerVisibility(key, visible) {
  const visibility = visible ? 'visible' : 'none';
  forEachLayerId(key, id => map.setLayoutProperty(id, 'visibility', visibility));
}

export function getCurrentLayerOrder() {
  return Object.entries(LAYER_Z_INDEX)
    .sort(([, a], [, b]) => a - b)
    .map(([key]) => key);
}

export function reorderLayers() {
  getCurrentLayerOrder().forEach(key => forEachLayerId(key, id => map.moveLayer(id)));
}

export function bringLayerToFront(key) {
  const maxZ = Math.max(...Object.values(LAYER_Z_INDEX));
  LAYER_Z_INDEX[key] = maxZ + 1;
}

export function isLayerLoaded(key) {
  return loadedLayers.has(key);
}

// ==================
// GeoJSONフェッチ・レイヤー追加
// ==================

async function fetchGeoJSON(key, path) {
  const res = await fetch(path);
  const data = await res.json();
  geojsonData[key] = data;
  return data;
}

function addPolygonLayer(key, data, visibility = 'none') {
  map.addSource(key, {
    type: 'geojson',
    data,
    buffer: 128,
    tolerance: 0.475,
    promoteId: 'id',
  });

  map.addLayer({
    id: LAYER_ID.fill(key),
    type: 'fill',
    source: key,
    layout: { visibility },
    paint: {
      'fill-color': ['case',
        ['!=', ['feature-state', 'fillColor'], null],
        ['feature-state', 'fillColor'],
        '#eaeaea'
      ],
      'fill-opacity': 1
    }
  });

  map.addLayer({
    id: LAYER_ID.line(key),
    type: 'line',
    source: key,
    paint: { 'line-color': '#888', 'line-width': 1 },
    layout: { visibility }
  });

  if (key === 'countries') {
    layersPanel.querySelector(`#layer_${key}`).checked = true;
  }
}

function addLineLayer(key, data, visibility = 'none') {
  map.addSource(key, { type: 'geojson', data });

  map.addLayer({
    id: LAYER_ID.hitarea(key),
    type: 'line',
    source: key,
    paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 10 },
    layout: { visibility }
  });

  map.addLayer({
    id: LAYER_ID.line(key),
    type: 'line',
    source: key,
    paint: { 'line-color': '#888', 'line-width': 1 },
    layout: { visibility }
  });
}

const addLayerFn = {
  polygon: addPolygonLayer,
  line:    addLineLayer,
};

function generateMeridians(step) {
  const features = [];
  for (let lon = -180; lon <= 180; lon += step) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lon, -90], [lon, 90]] }, properties: {} });
  }
  return { type: 'FeatureCollection', features };
}

function generateParallels(step) {
  const features = [];
  for (let lat = -90; lat <= 90; lat += step) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] }, properties: {} });
  }
  return { type: 'FeatureCollection', features };
}

const gridGenerators = {
  meridians: generateMeridians,
  parallels: generateParallels,
};

export function updateGridInterval(key, step) {
  map.getSource(key).setData(gridGenerators[key](step));
}

function addGridLayers() {
  GRID_KEYS.forEach(key => addLineLayer(key, gridGenerators[key](10)));
}

export function setLineLayerVisibility(key, visible) {
  const visibility = visible ? 'visible' : 'none';
  [`${key}-line`, `${key}-line-hitarea`].forEach(id => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility);
  });
}

// ==================
// マップ初期化（エントリーポイント）
// ==================

function setupStyle(mapContainer) {
  map.on('style.load', () => {
    map.setProjection({ type: 'mercator' });
    map.addLayer({
      id: 'background',
      type: 'background',
      paint: { 'background-color': themes.light.sea }
    });
    mapContainer.classList.add('theme-light');
  });
}

// ロード済みかどうかを管理
const loadedLayers = new Set(['countriesLow', 'countries', ...GRID_KEYS]);

export async function loadLayerOnDemand(key) {
  const entry = geoPaths.onDemand[key];
  if (!entry) return;

  if (loadedLayers.has(key)) {
    entry.type === 'line'
      ? setLineLayerVisibility(key, true)
      : setLayerVisibility(key, true);
    return;
  }

  try {
    const data = await fetchGeoJSON(key, entry.path);
    addLayerFn[entry.type](key, data);
    buildFeatureIndex(key, data);
    reorderLayers();
    entry.type === 'line'
      ? setLineLayerVisibility(key, true)
      : setLayerVisibility(key, true);
    loadedLayers.add(key);
  } catch (err) {
    console.error(`${key} のオンデマンドロードに失敗:`, err);
  }
}

async function loadInitialData(registerClickEvents) {
  const [, data] = await Promise.all([
    new Promise(resolve => map.on('load', resolve)),
    fetchGeoJSON('countriesLow', geoPaths.placeholder.path),
  ]);
  addPolygonLayer('countries', data, 'visible');
  buildFeatureIndex('countries', data);
  reorderLayers();
  addGridLayers();
  registerClickEvents();
}

function upgradeCountriesData() {
  fetchGeoJSON('countries', geoPaths.countries.path)
    .then(data => {
      map.getSource('countries').setData(data);
      buildFeatureIndex('countries', data);
      reorderLayers();
    })
    .catch(err => console.error('countries のロードに失敗:', err));
}

export async function initMapLayers(_map, _mapContainer, _layersPanel, registerClickEvents) {
  map = _map;
  layersPanel = _layersPanel;

  setupStyle(_mapContainer);
  try {
    await loadInitialData(registerClickEvents);
    upgradeCountriesData();
  } catch (err) {
    console.error('初期化失敗:', err);
  }
}
