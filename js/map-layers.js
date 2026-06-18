import { LAYER_ORDER, REGION_TO_SOURCE, ZOOM_LEVELS, themes } from './config.js';
import { normalize, getRegion, getFeatureId } from './utils.js';
import { geoUrls } from './regions.js';

// ==================
// モジュール内状態
// ==================

// initMapLayers() で受け取り、モジュール全体で共有する
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
    const { name, id } = feature.properties;
    if (name) index.set(normalize(name), feature);
    if (id)   index.set(normalize(id),   feature);
  });
  featureIndex[key] = index;
}

export function findFeatureByName(name, sources = LAYER_ORDER) {
  const n = normalize(name);
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
  LAYER_ORDER.forEach(key => {
    const data = geojsonData[key];
    if (!data?.features) return;
    data.features.forEach(f => {
      if (getRegion(f.properties, key) !== region) return;
      const fId = getFeatureId(key, f);
      if (fId) callback(key, fId, f);
    });
  });
}

// ==================
// ズーム・フライト
// ==================

function shiftGeometry(coords, type) {
  const shift = c => [c[0] < 0 ? c[0] + 360 : c[0], c[1]];
  if (type === 'Point')                              return shift(coords);
  if (type === 'LineString' || type === 'MultiPoint')     return coords.map(shift);
  if (type === 'Polygon'    || type === 'MultiLineString') return coords.map(ring => ring.map(shift));
  if (type === 'MultiPolygon') return coords.map(poly => poly.map(ring => ring.map(shift)));
  return coords;
}

export function zoomToFeature(feature) {
  if (!feature?.geometry) return;

  const bbox = turf.bbox(feature.geometry);
  const [minLng, , maxLng] = bbox;
  let center;

  if (maxLng - minLng > 180) {
    const shifted = {
      type: feature.geometry.type,
      coordinates: shiftGeometry(feature.geometry.coordinates, feature.geometry.type)
    };
    const sb = turf.bbox(shifted);
    const cx = (sb[0] + sb[2]) / 2;
    center = [cx > 180 ? cx - 360 : cx, (sb[1] + sb[3]) / 2];
  } else {
    center = turf.centroid(feature.geometry).geometry.coordinates;
  }

  const area = turf.area(feature.geometry) / 1_000_000;
  const zoom = ZOOM_LEVELS.find(([t]) => area > t)?.[1] ?? 15;
  map.flyTo({ center, zoom, duration: 1000 });
}

// ==================
// レイヤー表示制御
// ==================

const LAYER_TYPES = ['fill', 'line'];

export function setLayerVisibility(key, visible) {
  const visibility = visible ? 'visible' : 'none';
  LAYER_TYPES.forEach(type => {
    const layerId = `${key}-${type}`;
    if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
  });
}

export function reorderLayers() {
  LAYER_ORDER.forEach(key => {
    LAYER_TYPES.forEach(type => {
      const layerId = `${key}-${type}`;
      if (map.getLayer(layerId)) map.moveLayer(layerId);
    });
  });
}

// ==================
// GeoJSONフェッチ・レイヤー追加
// ==================

async function fetchGeoJSON(key, url) {
  const res = await fetch(url);
  const data = await res.json();
  geojsonData[key] = data;
  return { key, data };
}

export function addLayerToMap(key, data) {
  map.addSource(key, {
    type: 'geojson',
    data,
    promoteId: key === 'countries' ? 'name' : 'id'
  });

  map.addLayer({
    id: `${key}-fill`,
    type: 'fill',
    source: key,
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
    id: `${key}-line`,
    type: 'line',
    source: key,
    paint: { 'line-color': '#888', 'line-width': 1 }
  });

  if (key !== 'countries') setLayerVisibility(key, false);
  else layersPanel.querySelector(`#layer_${key}`).checked = true;
}

function generateMeridiansParallels() {
  const meridians = { type: 'FeatureCollection', features: [] };
  const parallels = { type: 'FeatureCollection', features: [] };

  for (let lon = -180; lon <= 180; lon += 10) {
    meridians.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lon, -90], [lon, 90]] }, properties: {} });
  }
  for (let lat = -90; lat <= 90; lat += 10) {
    parallels.features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] }, properties: {} });
  }
  return { meridians, parallels };
}

function addLineLayerPair(key, data, options = {}) {
  map.addSource(key, { type: 'geojson', data });
  map.addLayer({
    id: `${key}-line-hitarea`,
    type: 'line',
    source: key,
    paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 10 },
    layout: { visibility: options.visibility ?? 'none' }
  });
  map.addLayer({
    id: `${key}-line`,
    type: 'line',
    source: key,
    paint: { 'line-color': '#888', 'line-width': 1 },
    layout: { visibility: options.visibility ?? 'none' }
  });
}

function addGridLayers(gridData) {
  ['meridians', 'parallels'].forEach(key => addLineLayerPair(key, gridData[key]));
}

const addLayerFn = {
  polygon: (key, data) => addLayerToMap(key, data),
  line:    (key, data) => addLineLayerPair(key, data),
};

// ==================
// マップ初期化（エントリーポイント）
// ==================

export function initMapLayers(_map, _mapContainer, _layersPanel, registerClickEvents) {
  // モジュールスコープ変数に保存して他の関数から参照できるようにする
  map = _map;
  layersPanel = _layersPanel;

  map.on('style.load', () => {
    map.setProjection({ type: 'mercator' });
    map.addLayer({
      id: 'background',
      type: 'background',
      paint: { 'background-color': themes.light.sea }
    });
    _mapContainer.classList.add('theme-light');
  });

  const initialFetch = fetchGeoJSON('countriesLow', geoUrls.initial.countriesLow);
  const mapLoaded = new Promise(resolve => map.on('load', resolve));

  Promise.all([mapLoaded, initialFetch])
    .then(() => {
      addLayerToMap('countries', geojsonData.countriesLow);
      buildFeatureIndex('countries', geojsonData.countriesLow);
      reorderLayers();
      addGridLayers(generateMeridiansParallels());
      registerClickEvents();

      Object.entries(geoUrls.background).forEach(([key, { url, type }]) => {
        fetchGeoJSON(key, url).then(() => {
          if (key === 'countries') {
            map.getSource('countries').setData(geojsonData.countries);
            buildFeatureIndex('countries', geojsonData.countries);
          } else {
            addLayerFn[type](key, geojsonData[key]);
            buildFeatureIndex(key, geojsonData[key]);
          }
          reorderLayers();
        })
        .catch(err => console.error(`${key} のロードに失敗:`, err));
      });
    })
    .catch(err => console.error('初期化失敗:', err));
}
