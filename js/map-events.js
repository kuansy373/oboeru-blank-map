import { LAYER_KEYS } from './config.js';
import { getFeatureId, getRegion } from './utils.js';
import { getDisplayName, getRegionDisplayName } from './lang.js';
import { regionColors } from './regions.js';
import { geojsonData, filledFeatures, fillFeature, clearFeature, getCurrentLayerOrder } from './map-layers.js';

// maplibregl → CDN（グローバル）

let map;
let _updateProgress;
let _getCurrentRegionQuery;

// ==================
// ユーティリティ
// ==================

function isCoveredByUpperLayer(key, point) {
  const order = getCurrentLayerOrder();
  const upperLayers = order
    .slice(order.indexOf(key) + 1)
    .map(k => `${k}-fill`)
    .filter(id => map.getLayer(id));
  if (upperLayers.length === 0) return false;
  return map.queryRenderedFeatures(point, { layers: upperLayers }).length > 0;
}

function getLoadedPolygonLayers() {
  return getCurrentLayerOrder()
    .flatMap(key => [`${key}-fill`, `${key}-line`])
    .filter(id => map.getLayer(id));
}

// ==================
// ポップアップ
// ==================

function buildPopup(lngLat, html) {
  return new maplibregl.Popup({ closeOnClick: false })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
}

function createPopupManager() {
  const popups = new Map();

  return {
    has: id => popups.has(id),
    get: id => popups.get(id),

    open(id, lngLat, html, meta = {}) {
      if (popups.has(id)) {
        popups.get(id).popup.setLngLat(lngLat);
        return;
      }
      const popup = buildPopup(lngLat, html);
      popups.set(id, { popup, ...meta });
      popup.on('close', () => popups.delete(id));
    },

    remove(id) {
      popups.get(id)?.popup.remove();
      popups.delete(id);
    },

    closeAllExcept(excludeId = null) {
      for (const [id, { popup }] of popups) {
        if (id !== excludeId) popup.remove();
      }
    },

    refreshHtml(htmlBuilder) {
      for (const [id, entry] of popups) {
        entry.popup.setHTML(htmlBuilder(id, entry));
      }
    },
  };
}

const countryPopups = createPopupManager();
const linePopups = createPopupManager();

function buildPopupTemplate({ name, extra = '', resetAttr }) {
  return `
    <div class="popup-content">
      <div class="popup-name">${name}</div>
      <div class="popup-region">
        ${extra}
        <button class="popup-reset-btn" ${resetAttr}></button>
      </div>
    </div>
  `;
}

function buildCountryPopupHTML(name, region, id) {
  return buildPopupTemplate({
    name: getDisplayName(name),
    extra: `<span>${getRegionDisplayName(region)}</span>`,
    resetAttr: `data-feature-id="${id}"`,
  });
}

function buildLinePopupHTML(uniqueId) {
  return buildPopupTemplate({
    name: buildLineLabel(uniqueId),
    resetAttr: `data-line-id="${uniqueId}"`,
  });
}

// ==================
// クリックイベント（国・地域）
// ==================

function closeAllPopups(excludeCountryId = null) {
  countryPopups.closeAllExcept(excludeCountryId);
  linePopups.closeAllExcept();
}

function parseProperties(props) {
  const result = { ...props };
  if (typeof result.names === 'string') {
    result.names = JSON.parse(result.names);
  }
  return result;
}

function toggleFeatureFill(key, e) {
  const feature   = e.features[0];
  const props     = parseProperties(feature.properties);
  const featureId = getFeatureId(feature);
  const name      = props.names || 'Unknown';
  const region    = getRegion(props, key);
  const fillColor = regionColors[region] || regionColors.Default;

  if (!filledFeatures[featureId]) {
    fillFeature(key, featureId, fillColor);
    _updateProgress(_getCurrentRegionQuery());
  } else {
    countryPopups.open(featureId, e.lngLat, buildCountryPopupHTML(name, region, featureId), { key, name, region });
  }
}

function registerCountryClickEvents() {
  LAYER_KEYS.forEach(key => {
    map.on('click', `${key}-fill`, e => {
      if (isCoveredByUpperLayer(key, e.point)) return;
      const featureId = getFeatureId(e.features[0]);
      closeAllPopups(featureId);
      toggleFeatureFill(key, e);
    });

    map.on('mouseenter', `${key}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', `${key}-fill`, () => { map.getCanvas().style.cursor = ''; });
  });

  map.on('click', e => {
    const fillLayers = LAYER_KEYS
      .map(k => `${k}-fill`)
      .filter(id => map.getLayer(id));
    const features = map.queryRenderedFeatures(e.point, { layers: fillLayers });
    if (features.length === 0) {
      closeAllPopups();
    }
  });
}

// ==================
// 経線・緯線クリックイベント
// ==================

// Map: key=uniqueId, value={ layerId, sourceId }
const highlightedLines = new Map();

function buildLineLabel(uniqueId) {
  if (uniqueId === 'date_line') return getDisplayName('International Date Line');
  const [prefix, deg] = uniqueId.startsWith('lon_')
    ? ['Lng: ', uniqueId.slice(4)]
    : ['Lat: ', uniqueId.slice(4)];
  return getDisplayName(prefix) + deg + '°';
}

function getLineInfo(layerId, feature) {
  if (layerId === 'dateLine-line-hitarea') {
    return {
      uniqueId: 'date_line',
      highlightFeature: geojsonData.dateLine.features[0],
    };
  }

  const isMeridian = layerId === 'meridians-line-hitarea';
  const coords = feature.geometry.coordinates;
  const degree = Math.round(isMeridian ? coords[0][0] : coords[0][1]);
  const uniqueId = (isMeridian ? 'lon_' : 'lat_') + degree;
  const highlightFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: isMeridian
        ? [[degree, -85.0511], [degree, 85.0511]]
        : [[-180, degree], [180, degree]],
    },
  };

  return { uniqueId, highlightFeature };
}

function removeHighlightLine(uniqueId) {
  const info = highlightedLines.get(uniqueId);
  if (!info) return;

  linePopups.remove(uniqueId);

  if (map.getLayer(info.layerId))   map.removeLayer(info.layerId);
  if (map.getSource(info.sourceId)) map.removeSource(info.sourceId);
  highlightedLines.delete(uniqueId);
}

function addHighlightLine(uniqueId, highlightFeature) {
  const hlLayerId  = `highlight-line-${uniqueId}`;
  const hlSourceId = `highlight-source-${uniqueId}`;

  map.addSource(hlSourceId, { type: 'geojson', data: highlightFeature });
  map.addLayer({
    id: hlLayerId,
    type: 'line',
    source: hlSourceId,
    paint: { 'line-color': '#ff7171', 'line-width': 1.5 },
  });
  map.moveLayer(hlLayerId);

  highlightedLines.set(uniqueId, { layerId: hlLayerId, sourceId: hlSourceId });
}

function registerLineClickEvents() {
  ['meridians-line-hitarea', 'parallels-line-hitarea', 'dateLine-line-hitarea'].forEach(layerId => {
    const isDateLine = layerId === 'dateLine-line-hitarea';

    map.on('click', layerId, e => {
      const topFeatures = map.queryRenderedFeatures(e.point, { layers: getLoadedPolygonLayers() });
      if (topFeatures.length > 0 || !e.features.length) return;

      if (isDateLine) {
        const meridianFeatures = map.queryRenderedFeatures(e.point, { layers: ['meridians-line-hitarea'] });
        if (meridianFeatures.length > 0) return;
      }

      const { uniqueId, highlightFeature } = getLineInfo(layerId, e.features[0]);

      if (highlightedLines.has(uniqueId)) {
        linePopups.open(uniqueId, e.lngLat, buildLinePopupHTML(uniqueId));
      } else {
        linePopups.closeAllExcept(uniqueId);
        addHighlightLine(uniqueId, highlightFeature);
      }
    });

    map.on('mousemove', layerId, e => {
      const topFeatures = map.queryRenderedFeatures(e.point, { layers: getLoadedPolygonLayers() });
      map.getCanvas().style.cursor = topFeatures.length === 0 ? 'pointer' : '';
    });

    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
}

export function refreshOpenPopups() {
  countryPopups.refreshHtml((id, { name, region }) => buildCountryPopupHTML(name, region, id));
  linePopups.refreshHtml(id => buildLinePopupHTML(id));
}

// ==================
// 初期化（エントリーポイント）
// ==================

// リセットボタンの dataset キー → 処理 のマッピング
const resetHandlers = {
  featureId: id => {
    const entry = countryPopups.get(id);
    if (!entry) return;
    clearFeature(entry.key, id);
    countryPopups.remove(id);
    _updateProgress(_getCurrentRegionQuery());
  },
  lineId: id => removeHighlightLine(id),
};

function registerGlobalResetHandler() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.popup-reset-btn');
    if (!btn) return;

    for (const [datasetKey, handler] of Object.entries(resetHandlers)) {
      if (btn.dataset[datasetKey]) {
        handler(btn.dataset[datasetKey]);
        return;
      }
    }
  });
}

export function initMapEvents(_map, { updateProgress, getCurrentRegionQuery }) {
  map                    = _map;
  _updateProgress        = updateProgress;
  _getCurrentRegionQuery = getCurrentRegionQuery;
  registerGlobalResetHandler();
}

export function registerClickEvents() {
  registerCountryClickEvents();
  registerLineClickEvents();
}
