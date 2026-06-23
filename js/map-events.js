import { LAYER_ORDER } from './config.js';
import { getFeatureId, getRegion } from './utils.js';
import { getDisplayName, getRegionDisplayName } from './lang.js';
import { regionColors } from './regions.js';
import { geojsonData, filledFeatures, fillFeature, clearFeature } from './map-layers.js';

// maplibregl → CDN（グローバル）

let map;
let _updateProgress;
let _getCurrentRegionQuery;
const openCountryPopups = new Map();

// ==================
// ユーティリティ
// ==================

function isCoveredByUpperLayer(key, point) {
  const upperLayers = LAYER_ORDER.slice(LAYER_ORDER.indexOf(key) + 1).map(k => `${k}-fill`);
  return map.queryRenderedFeatures(point, { layers: upperLayers }).length > 0;
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

function createResetPopup(key, id, name, region, lngLat) {
  if (openCountryPopups.has(id)) {
    openCountryPopups.get(id).popup.setLngLat(lngLat);
    return;
  }

  const popup = buildPopup(lngLat, buildCountryPopupHTML(name, region, id));
  openCountryPopups.set(id, { popup, key, name, region });
  popup.on('close', () => openCountryPopups.delete(id));
}

function buildCountryPopupHTML(name, region, id) {
  return `
    <div class="popup-content">
      <div class="popup-name">${getDisplayName(name)}</div>
      <div class="popup-region">
        <span>${getRegionDisplayName(region)}</span>
        <button class="popup-reset-btn" data-feature-id="${id}"></button>
      </div>
    </div>
  `;
}

// ==================
// クリックイベント
// ==================

function toggleFeatureFill(key, e) {
  const feature   = e.features[0];
  const props     = feature.properties;
  const featureId = getFeatureId(key, feature);
  const name      = props.name || 'Unknown';
  const region    = getRegion(props, key);
  const fillColor = regionColors[region] || regionColors.Default;

  if (!filledFeatures[featureId]) {
    fillFeature(key, featureId, fillColor);
    _updateProgress(_getCurrentRegionQuery());
  } else {
    createResetPopup(key, featureId, name, region, e.lngLat);
  }
}

function closeAllPopupsExcept(excludeId = null) {
  for (const [id, { popup }] of openCountryPopups) {
    if (id !== excludeId) {
      popup.remove();
    }
  }
}

function registerCountryClickEvents() {
  LAYER_ORDER.forEach(key => {
    map.on('click', `${key}-fill`, e => {
      if (isCoveredByUpperLayer(key, e.point)) return;
      const featureId = getFeatureId(key, e.features[0]);
      closeAllPopupsExcept(featureId);
      toggleFeatureFill(key, e);
    });

    map.on('mouseenter', `${key}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', `${key}-fill`, () => { map.getCanvas().style.cursor = ''; });
  });

  map.on('click', e => {
    const fillLayers = LAYER_ORDER.map(k => `${k}-fill`);
    const features = map.queryRenderedFeatures(e.point, { layers: fillLayers });
    if (features.length === 0) {
      closeAllPopupsExcept();
    }
  });
}

// ==================
// 経線・緯線クリックイベント
// ==================

// Map: key=uniqueId, value={ layerId, sourceId }
const highlightedLines = new Map();
const highlightedLinePopups = new Map();

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
      highlightFeature: geojsonData.dateLine.features[0]
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
        : [[-180, degree], [180, degree]]
    }
  };

  return { uniqueId, highlightFeature };
}

function removeHighlightLine(uniqueId) {
  const info = highlightedLines.get(uniqueId);
  if (!info) return;

  highlightedLinePopups.get(uniqueId)?.remove();
  highlightedLinePopups.delete(uniqueId);

  if (map.getLayer(info.layerId))   map.removeLayer(info.layerId);
  if (map.getSource(info.sourceId)) map.removeSource(info.sourceId);
  highlightedLines.delete(uniqueId);
}

function addHighlightLine(uniqueId, highlightFeature, lngLat) {
  const hlLayerId  = `highlight-line-${uniqueId}`;
  const hlSourceId = `highlight-source-${uniqueId}`;

  map.addSource(hlSourceId, { type: 'geojson', data: highlightFeature });
  map.addLayer({ id: hlLayerId, type: 'line', source: hlSourceId,
    paint: { 'line-color': '#ff7171', 'line-width': 1.5 } });
  map.moveLayer(hlLayerId);

  const label = buildLineLabel(uniqueId);
  const popup = new maplibregl.Popup().setLngLat(lngLat)
    .setHTML(`<strong>${label}</strong>`).addTo(map);

  highlightedLines.set(uniqueId, { layerId: hlLayerId, sourceId: hlSourceId });
  highlightedLinePopups.set(uniqueId, popup);
}

function registerLineClickEvents() {
  const topLayers = LAYER_ORDER.flatMap(k => [`${k}-fill`, `${k}-line`]);
  ['meridians-line-hitarea', 'parallels-line-hitarea', 'dateLine-line-hitarea'].forEach(layerId => {
    const isDateLine = layerId === 'dateLine-line-hitarea';

    map.on('click', layerId, e => {
      const topFeatures = map.queryRenderedFeatures(e.point, { layers: topLayers });
      if (topFeatures.length > 0 || !e.features.length) return;

      if (isDateLine) {
        const meridianFeatures = map.queryRenderedFeatures(e.point, { layers: ['meridians-line-hitarea'] });
        if (meridianFeatures.length > 0) return;
      }

      const { uniqueId, highlightFeature } = getLineInfo(layerId, e.features[0]);

      if (highlightedLines.has(uniqueId)) {
        removeHighlightLine(uniqueId);
        return;
      }

      addHighlightLine(uniqueId, highlightFeature, e.lngLat);
    });

    map.on('mousemove', layerId, e => {
      const topFeatures = map.queryRenderedFeatures(e.point, { layers: topLayers });
      map.getCanvas().style.cursor = topFeatures.length === 0 ? 'pointer' : '';
    });

    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
}

export function refreshOpenPopups() {
  for (const [id, { popup, name, region }] of openCountryPopups) {
    popup.setHTML(buildCountryPopupHTML(name, region, id));
  }

  for (const [uniqueId, popup] of highlightedLinePopups) {
    const newLabel = buildLineLabel(uniqueId);
    popup.setHTML(`<strong>${newLabel}</strong>`);
  }
}

// ==================
// 初期化（エントリーポイント）
// ==================

function registerGlobalResetHandler() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('.popup-reset-btn');
    if (!btn) return;
    const id = btn.dataset.featureId;
    const entry = openCountryPopups.get(id);
    if (!entry) return;
    clearFeature(entry.key, id);
    entry.popup.remove();
    _updateProgress(_getCurrentRegionQuery());
  });
}

export function initMapEvents(_map, {
  updateProgress,
  getCurrentRegionQuery,
}) {
  map                  = _map;
  _updateProgress      = updateProgress;
  _getCurrentRegionQuery = getCurrentRegionQuery;
  registerGlobalResetHandler();
}

export function registerClickEvents() {
  registerCountryClickEvents();
  registerLineClickEvents();
}
