document.addEventListener('DOMContentLoaded', () => {

  // ==================
  // 定数・状態管理
  // ==================

  const map = new maplibregl.Map({
    container: 'bm-worldmap',
    style: {
      version: 8,
      sources: {},
      layers: [],
      glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf'
    },
    center: [0, 20],
    zoom: 1,
    attributionControl: false
  });

  map.doubleClickZoom.disable();
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.touchZoomRotate._tapDragZoom.disable();

  // レイヤー順（下から上）
  const LAYER_ORDER = ['countries', 'usaStates', 'chinaProvinces'];

  //
  const REGION_TO_SOURCE = {
    'USA States':      'usaStates',
    'China Provinces': 'chinaProvinces',
  };

  // GeoJSONデータ保持オブジェクト
  const geojsonData = {};

  // 色塗り管理オブジェクト: { [featureId]: { color, layerId } }
  const filledFeatures = {};

  // フィーチャ検索インデックス: { [sourceKey]: Map<normalizedKey, feature> }
  const featureIndex = {};

  // 国リストの開閉状態を保持
  const expandedLists = {};

  // ハイライトされた経線・緯線の管理 Map: key=uniqueId, value={ layerId, sourceId, degree }
  const highlightedLines = new Map();

  // テーマ
  const themes = {
    light: { sea: '#fff' },
    dark: { sea: '#000' }
  };

  // 言語
  let currentLang = 'en';

  const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>`;

  // ==================
  // DOM参照
  // ==================

  const mapContainer = document.getElementById('bm-worldmap');
  const menuContainer = document.getElementById('menu-container');
  const menuToggle = document.getElementById('menu-toggle');
  const menuTop = document.getElementById('menu-top');
  const menuBottom = document.getElementById('menu-bottom');
  const btnTheme = document.getElementById('btn-theme');
  const themePanel = document.getElementById('theme-panel');
  const btnLanguage = document.getElementById('btn-language');
  const languagePanel = document.getElementById('language-panel');
  const btnMaps = document.getElementById('btn-maps');
  const mapsPanel = document.getElementById('maps-panel');
  const btnLayers = document.getElementById('btn-layers');
  const layersPanel = document.getElementById('layers-panel');
  const btnRegions = document.getElementById('btn-regions');
  const regionControl = document.getElementById('region-control');
  const searchInput = document.getElementById('search-input');
  const closeButton = document.getElementById('close-button');
  const progressDisplay = document.getElementById('progress-display');
  const searchToggle = document.getElementById('search-toggle');
  const searchContainer = document.getElementById('search-container');
  const zoomControlsLeft  = document.getElementById('zoom-controls-left');
  const zoomControlsRight = document.getElementById('zoom-controls-right');
  const zoomInLeft   = document.getElementById('zoom-in-left');
  const zoomInRight  = document.getElementById('zoom-in-right');
  const zoomOutLeft  = document.getElementById('zoom-out-left');
  const zoomOutRight = document.getElementById('zoom-out-right');
  const aimOverlay = document.getElementById('aim-overlay')

  // ==================
  // ユーティリティ関数
  // ==================

  /** 文字列を正規化（前後空白除去・小文字化） */
  function normalize(name) {
    return name.trim().toLowerCase();
  }

  /** フィーチャのプロパティから地域名を返す */
  function getRegion(properties, key) {
    if (key === 'usaStates') return 'USA States';
    if (key === 'chinaProvinces') return 'China Provinces';
    const isoCode = properties['name'] || properties['ISO3166-1-Alpha-2'];
    const n = normalize(properties.name || '');
    for (const [region, list] of Object.entries(countryRegions)) {
      if (isoCode && list.includes(isoCode)) return region;
      if (list.some(c => normalize(c) === n)) return region;
    }
    return 'Default';
  }

  /** フィーチャIDを取得（usaStates は state_code、それ以外は name） */
  function getFeatureId(key, feature) {
    if (key === 'countries') {
      return feature.properties.name;
    }
    return feature.properties['iso3166-2'] || feature.properties.name;
  }

  /** GeoJSONロード後にインデックスを構築する */
  function buildFeatureIndex(key, data) {
    const index = new Map();
    data.features.forEach(feature => {
      const props = feature.properties;
      const candidates = [
        props.name, props.NAME, props.ADMIN, props.ADMIN_EN,
        props.state_code, props['ISO3166-1-Alpha-2'], props['iso3166-2']
      ];
      candidates.forEach(v => {
        if (v) index.set(normalize(v), feature);
      });
    });
    featureIndex[key] = index;
  }

  /** 名前またはコードからフィーチャを検索 */
  function findFeatureByName(name, sources = LAYER_ORDER) {
    const n = normalize(name);
    for (const sourceKey of sources) {
      const feature = featureIndex[sourceKey]?.get(n);
      if (feature) return feature;
    }
    return null;
  }

  //
  function getSourcesForRegion(region) {
    const source = REGION_TO_SOURCE[region];
    return source ? [source] : undefined;
  }

  // ひらがな→カナ変換
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
  }

  // クリップボードへコピー
  async function copyToClipboard(button, text) {
    if (button.dataset.copying) return;
    try {
      button.dataset.copying = 'true';
      await navigator.clipboard.writeText(text);
      button.innerHTML = '✓';
      setTimeout(() => {
        button.innerHTML = COPY_ICON;
        delete button.dataset.copying;
      }, 1500);
    } catch (err) {
      console.error('コピーに失敗しました:', err);
      delete button.dataset.copying;
    }
  }
  // ==================
  // 色塗り操作
  // ==================

  /** フィーチャに色を塗り、filledFeatures に登録する */
  function fillFeature(key, featureId, color) {
    filledFeatures[featureId] = { color, layerId: key };
    map.setFeatureState({ source: key, id: featureId }, { fillColor: color });
  }

  /** フィーチャの色塗りを解除し、filledFeatures から削除する */
  function clearFeature(key, featureId) {
    delete filledFeatures[featureId];
    map.removeFeatureState({ source: key, id: featureId });
  }

  /** ある地域に属する全フィーチャに対して操作を行う共通処理 */
  function applyToRegionFeatures(region, callback) {
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
  // マップ操作
  // ==================

  /** 座標を 0–360° 系にシフトする補助関数 */
  function shiftGeometry(coords, type) {
    const shift = c => [c[0] < 0 ? c[0] + 360 : c[0], c[1]];
    if (type === 'Point')                          return shift(coords);
    if (type === 'LineString' || type === 'MultiPoint')  return coords.map(shift);
    if (type === 'Polygon'    || type === 'MultiLineString') return coords.map(ring => ring.map(shift));
    if (type === 'MultiPolygon') return coords.map(poly => poly.map(ring => ring.map(shift)));
    return coords;
  }

  /** フィーチャにズームインする */
  const ZOOM_LEVELS = [
    [5_000_000, 3], [1_000_000, 4], [100_000, 5], [10_000, 6],
    [1_000, 7], [100, 8], [10, 9], [5, 10], [1, 11], [0.5, 12], [0.1, 13], [0.05, 14]
  ];

  function zoomToFeature(feature) {
    if (!feature?.geometry) return;

    const bbox = turf.bbox(feature.geometry);
    const [minLng, , maxLng] = bbox;
    let center;

    if (maxLng - minLng > 180) {
      // 日付変更線をまたぐ場合：0–360° 系で中心を求めてから戻す
      const shifted = { type: feature.geometry.type, coordinates: shiftGeometry(feature.geometry.coordinates, feature.geometry.type) };
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

  /** レイヤーの表示・非表示を切り替える */
  function setLayerVisibility(key, visible) {
    const visibility = visible ? 'visible' : 'none';
    ['fill', 'line'].forEach(type => {
      const layerId = `${key}-${type}`;
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
    });
  }

  /** レイヤーの重ね順を整理する（LAYER_ORDER 順に再配置） */
  function reorderLayers() {
    LAYER_ORDER.forEach(key => {
      ['fill', 'line'].forEach(type => {
        const layerId = `${key}-${type}`;
        if (map.getLayer(layerId)) map.moveLayer(layerId);
      });
    });
  }


  // ==================
  // レイヤークリックイベント
  // ==================

  function isCoveredByUpperLayer(key, point) {
    const upperLayers = LAYER_ORDER.slice(LAYER_ORDER.indexOf(key) + 1).map(k => `${k}-fill`);
    return upperLayers.some(l => map.queryRenderedFeatures(point, { layers: [l] }).length > 0);
  }

  function createResetPopup(key, id, name, region, lngLat) {
    const popup = new maplibregl.Popup()
      .setLngLat(lngLat)
      .setHTML(`
        <div class="popup-content">
          <div class="popup-name">${getDisplayName(name)}</div>
          <div class="popup-region">
            <span>${getRegionDisplayName(region)}</span>
            <button id="resetColorBtn" class="popup-reset-btn"></button>
          </div>
        </div>
      `)
      .addTo(map);

    setTimeout(() => {
      document.getElementById('resetColorBtn')?.addEventListener('click', () => {
        clearFeature(key, id);
        popup.remove();
        updateProgress(getCurrentRegionQuery());
      });
    }, 0);
  }

  function toggleFeatureFill(key, e) {
    const feature   = e.features[0];
    const props     = feature.properties;
    const featureId = getFeatureId(key, feature);
    const id        = featureId || props.id || props.name || props.NAME;
    const name      = props.name || props.NAME || props.ADMIN || props.ADMIN_EN || 'Unknown';
    const region    = getRegion(props, key);
    const fillColor = regionColors[region] || regionColors.Default;

    if (!filledFeatures[id]) {
      fillFeature(key, id, fillColor);
      updateProgress(getCurrentRegionQuery());
    } else {
      createResetPopup(key, id, name, region, e.lngLat);
    }
  }

  function registerCountryClickEvents() {
    LAYER_ORDER.forEach(key => {
      map.on('click', `${key}-fill`, e => {
        if (isCoveredByUpperLayer(key, e.point)) return;
        toggleFeatureFill(key, e);
      });

      map.on('mouseenter', `${key}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', `${key}-fill`, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  function getLineInfo(layerId, feature) {
    const isMeridian = layerId === 'meridians-line-hitarea';
    const isDateLine = layerId === 'dateLine-line-hitarea';

    if (isDateLine) {
      return {
        uniqueId: 'date_line',
        label: getDisplayName('International Date Line'),
        highlightFeature: geojsonData.dateLine.features[0]
      };
    }

    const coords = feature.geometry.coordinates;
    const degree = Math.round(isMeridian ? coords[0][0] : coords[0][1]);
    const uniqueId = (isMeridian ? 'lon_' : 'lat_') + degree;
    const label = getDisplayName(isMeridian ? 'Lng: ' : 'Lat: ') + degree + '°';
    const highlightFeature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: isMeridian
          ? [[degree, -85.0511], [degree, 85.0511]]
          : [[-180, degree], [180, degree]]
      }
    };

    return { uniqueId, label, highlightFeature };
  }

  function registerLineClickEvents() {
    ['meridians-line-hitarea', 'parallels-line-hitarea', 'dateLine-line-hitarea'].forEach(layerId => {
      const isDateLine = layerId === 'dateLine-line-hitarea';

      map.on('click', layerId, e => {
        const topFeatures = map.queryRenderedFeatures(e.point, {
          layers: ['countries-fill', 'countries-line', 'usaStates-fill', 'usaStates-line']
        });
        if (topFeatures.length > 0 || !e.features.length) return;

        if (isDateLine) {
          const meridianFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['meridians-line-hitarea']
          });
          if (meridianFeatures.length > 0) return;
        }

        const { uniqueId, label, highlightFeature } = getLineInfo(layerId, e.features[0]);

        const hlLayerId  = `highlight-line-${uniqueId}`;
        const hlSourceId = `highlight-source-${uniqueId}`;

        if (highlightedLines.has(uniqueId)) {
          if (map.getLayer(hlLayerId))   map.removeLayer(hlLayerId);
          if (map.getSource(hlSourceId)) map.removeSource(hlSourceId);
          highlightedLines.delete(uniqueId);
          return;
        }

        map.addSource(hlSourceId, { type: 'geojson', data: highlightFeature });
        map.addLayer({ id: hlLayerId, type: 'line', source: hlSourceId, paint: { 'line-color': '#ff7171', 'line-width': 1.5 } });
        map.moveLayer(hlLayerId);
        highlightedLines.set(uniqueId, { layerId: hlLayerId, sourceId: hlSourceId });

        new maplibregl.Popup().setLngLat(e.lngLat).setHTML(`<strong>${label}</strong>`).addTo(map);
      });

      map.on('mousemove', layerId, e => {
        const topFeatures = map.queryRenderedFeatures(e.point, {
          layers: ['countries-fill', 'countries-line', 'usaStates-fill', 'usaStates-line']
        });
        map.getCanvas().style.cursor = topFeatures.length === 0 ? 'pointer' : '';
      });

      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    });
  }

  function registerClickEvents() {
    registerCountryClickEvents();
    registerLineClickEvents();
  }

  // ==================
  // GeoJSONロード
  // ==================

  async function fetchGeoJSON(key, url) {
    const res = await fetch(url);
    const data = await res.json();
    geojsonData[key] = data;
    return { key, data };
  }

  function addLayerToMap(key, data) {
    map.addSource(key, {
      type: 'geojson',
      data,
      promoteId: key === 'countries' ? 'name' : 'iso3166-2'

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

  // 経線・緯線
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

  function addGridLayers(gridData) {
    ['meridians', 'parallels'].forEach(key => {
      map.addSource(key, { type: 'geojson', data: gridData[key] });

      map.addLayer({
        id: `${key}-line-hitarea`,
        type: 'line',
        source: key,
        paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 10 },
        layout: { visibility: 'none' }
      });

      map.addLayer({
        id: `${key}-line`,
        type: 'line',
        source: key,
        paint: { 'line-color': '#888', 'line-width': 1 },
        layout: { visibility: 'none' }
      });
    });
  }

  // 日付変更線
  function addLineLayer(key, data) {
    map.addSource(key, { type: 'geojson', data });
    map.addLayer({
      id: `${key}-line-hitarea`,
      type: 'line',
      source: key,
      paint: { 'line-color': 'rgba(0,0,0,0)', 'line-width': 10 },
      layout: { visibility: 'none' }
    });
    map.addLayer({
      id: `${key}-line`,
      type: 'line',
      source: key,
      paint: { 'line-color': '#888', 'line-width': 1 },
      layout: { visibility: 'none' }
    });
  }

  const addLayerFn = {
    polygon: (key, data) => addLayerToMap(key, data),
    line:    (key, data) => addLineLayer(key, data),
  };

  // ==================
  // マップロード
  // ==================

  map.on('style.load', () => {
    map.setProjection({ type: 'mercator' });
    map.addLayer({
      id: 'background',
      type: 'background',
      paint: { 'background-color': themes.light.sea }
    });
    mapContainer.classList.add('theme-light');
  });

  // countriesLow とmapロードを並走させ、両方揃ったら初期表示
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

  // ==================
  // レイヤーコントロール UI
  // ==================

  // GeoJSON レイヤーのチェックボックス
  LAYER_ORDER.forEach(key => {
    const cb = layersPanel.querySelector(`#layer_${key}`);
    cb?.addEventListener('change', e => {
      setLayerVisibility(key, e.target.checked);
      reorderLayers();
    });
  });

  ['meridians', 'parallels', 'dateLine'].forEach(key => {
    const cb = layersPanel.querySelector(`#layer_${key}`);
    cb?.addEventListener('change', e => {
      const visibility = e.target.checked ? 'visible' : 'none';

      if (map.getLayer(`${key}-line`)) {
        map.setLayoutProperty(`${key}-line`, 'visibility', visibility);
        map.setLayoutProperty(`${key}-line-hitarea`, 'visibility', visibility);
      }
    });
  });

  // ==================
  // 地域コントロール UI
  // ==================

  function buildRegionControl() {
    regionControl.innerHTML = '';

    Object.entries(regionColors).forEach(([region, color]) => {
      const regionItem = document.createElement('div');
      regionItem.className = 'region-item';
      regionItem.dataset.region = region; // 追加

      const colorBox = document.createElement('span');
      colorBox.className = 'color-box';
      colorBox.style.background = color;

      const label = document.createElement('span');
      label.textContent = getRegionDisplayName(region);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'reset-btn';

      colorBox.addEventListener('click', e => {
        e.stopPropagation();
        applyToRegionFeatures(region, (key, fId) => fillFeature(key, fId, color));
        updateProgress(getCurrentRegionQuery());
      });

      label.addEventListener('click', e => {
        e.stopPropagation();
        const view = regionView[region];
        if (view) map.flyTo({ center: view.center, zoom: view.zoom, speed: 0.8, curve: 1.2, essential: true });
        else alert(`${getRegionDisplayName(region)} ${getMessage('noViewSettings')}`);
      });

      resetBtn.addEventListener('click', e => {
        e.stopPropagation();
        applyToRegionFeatures(region, (key, fId) => clearFeature(key, fId));
        updateProgress(getCurrentRegionQuery());
      });

      regionItem.append(colorBox, label, resetBtn);
      regionControl.appendChild(regionItem);
    });
  }

  function updateRegionControlTexts() {
    regionControl.querySelectorAll('.region-item').forEach(item => {
      const region = item.dataset.region;
      item.querySelector('span:not(.color-box)').textContent = getRegionDisplayName(region);
    });
  }

  buildRegionControl();

  // ==================
  // テーマコントロール UI
  // ==================

  function applyTheme(themeName) {
    const theme = themes[themeName];
    map.setPaintProperty('background', 'background-color', theme.sea);
    mapContainer.classList.remove('theme-light', 'theme-dark');
    mapContainer.classList.add(`theme-${themeName}`);
  }

  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', e => applyTheme(e.target.value));
  });

  // ==================
  // 言語コントロール UI
  // ==================

  // 英語-日本語切り替え
  function updateButtonTexts() {
    document.querySelectorAll('[data-en][data-ja]').forEach(el => {
      const text = currentLang === 'ja' ? el.dataset.ja : el.dataset.en;
      if (el.tagName === 'INPUT') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });
  }
  updateButtonTexts();

  function getMessage(key) {
    return messages[key][currentLang];
  }

  function getDisplayName(name) {
    return currentLang === 'ja' ? (translations[name] || name) : name;
  }

  function getRegionDisplayName(region) {
    if (currentLang === 'ja') return regionNameJa[region] || region;
    return region;
  }

  document.querySelectorAll('input[name="language"]').forEach(radio => {
    radio.addEventListener('change', e => {
      currentLang = e.target.value;
      updateProgress(getCurrentRegionQuery());
      updateRegionControlTexts();
      updateButtonTexts();
    });
  });

  // ==================
  // メニュー開閉
  // ==================

  // z-indexの動的管理
  let topZIndex = 10;
  function bringToFront(element) {
    element.style.zIndex = ++topZIndex;
  }

  let activePanel = null;
  let activeBtn = null;

  const menuItems = [
    [btnTheme,    themePanel],
    [btnLanguage, languagePanel],
    [btnMaps,     mapsPanel],
    [btnLayers,   layersPanel],
    [btnRegions,  regionControl],
  ];

  function hidePanels() {
    menuItems.forEach(([btn, panel]) => {
      panel.style.display = 'none';
      btn.classList.remove('active');
    });
  }

  function closeAllPanels() {
    hidePanels();
    activePanel = null;
    activeBtn = null;
  }

  function togglePanel(panel, btn) {
    const isOpen = panel.style.display !== 'none';
    closeAllPanels();
    if (!isOpen) {
      panel.style.display = 'block';
      btn.classList.add('active');
      activePanel = panel;
      activeBtn = btn;
    }
  }

  menuToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menuTop.style.display !== 'none';
    menuTop.style.display = isOpen ? 'none' : 'flex';
    menuBottom.style.display = isOpen ? 'none' : 'flex';
    bringToFront(menuContainer);
    if (isOpen) {
      hidePanels();
    } else if (activePanel) {
      activePanel.style.display = 'block';
      activeBtn?.classList.add('active');
    }
  });

  document.addEventListener('click', () => {
    menuTop.style.display = 'none';
    menuBottom.style.display = 'none';
    hidePanels();
  });

  menuItems.forEach(([btn, panel]) => {
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(panel, btn); });
    panel.addEventListener('click', e => e.stopPropagation());
  });

  // ==================
  // 図法切り替え
  // ==================

  document.querySelectorAll('input[name="projection"]').forEach(radio => {
    radio.addEventListener('change', e => {
      map.setProjection({ type: e.target.value });
    });
  });

  // ==================
  // 検索トグル
  // ==================

  searchToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = getComputedStyle(searchContainer).display !== 'none';
    searchContainer.style.display = isOpen ? 'none' : 'block';
    bringToFront(searchContainer);
  });

  closeButton.addEventListener('click', () => {
    searchContainer.style.display = 'none';
  });

  // ==================
  // コマンド定義
  // ==================

  const commands = [
    {
      name: 'zm',
      pattern: /;zm(\.[lr])?(\.y-?\d*)?(\.[lr])?(\.y-?\d*)*[,;]?/,
      apply(token) {
        const parts = token.replace(/^;/, '').replace(/,$/, '').split('.').filter(Boolean);

        let showLeft  = true;
        let showRight = true;
        let yVal      = 50;
        let yMode     = false;

        parts.forEach(part => {
          if (part === 'zm') return;
          if (part === 'r') { showLeft  = false; return; }
          if (part === 'l') { showRight = false; return; }
          if (part === 'y') { yMode = true; return; }
          const yMatch = part.match(/^y(-?\d+)$/);
          if (yMatch) { yVal = Math.max(0, Math.min(100, parseFloat(yMatch[1]))); yMode = true; return; }
        });

        // yMode終了
        if (token.endsWith(',')) yMode = false;

        zoomControlsLeft.style.display    = showLeft  ? 'flex' : 'none';
        zoomControlsRight.style.display   = showRight ? 'flex' : 'none';
        zoomControlsLeft.style.bottom     = `${yVal}%`;
        zoomControlsRight.style.bottom    = `${yVal}%`;
        zoomControlsLeft.style.transform  = 'translateY(50%)';
        zoomControlsRight.style.transform = 'translateY(50%)';

        setZoomBtnText(yMode ? '↑' : '+', yMode ? '↓' : '-');
      },
      reset() {
        zoomControlsLeft.style.display  = 'none';
        zoomControlsRight.style.display = 'none';
        setZoomBtnText('+', '-');
      }
    },
    {
      name: 'aim',
      pattern: /;aim(\.[whs]\d+|\.o\d+)*[,;]?/,
      apply(token) {
        const parts = token.replace(/^;/, '').replace(/,$/, '').split('.').filter(Boolean);

        let w = 24;
        let h = 24;

        parts.forEach(part => {
          if (part === 'aim') return;
          const sMatch = part.match(/^s(\d+)$/);
          if (sMatch) { w = parseInt(sMatch[1]); h = parseInt(sMatch[1]); return; }
          const wMatch = part.match(/^w(\d+)$/);
          if (wMatch) { w = parseInt(wMatch[1]); return; }
          const hMatch = part.match(/^h(\d+)$/);
          if (hMatch) { h = parseInt(hMatch[1]); return; }
          const oMatch = part.match(/^o(\d+)$/);
          if (oMatch) { aimOverlay.style.opacity = parseInt(oMatch[1]) / 100; return; }
        });

        aimOverlay.style.display = 'block';
        aimOverlay.style.width  = `${Math.min(w, window.innerWidth)}px`;
        aimOverlay.style.height = `${Math.min(h, window.innerHeight)}px`;
      },
      reset() {
        aimOverlay.style.display = 'none';
        aimOverlay.style.opacity = '1';
      }
    },
    {
      name: 'loc',
      pattern: /;loc(\.\d+)?[,;]?/,
      apply(token) {
        const parts = token.replace(/^;/, '').replace(/[,;]$/, '').split('.').filter(Boolean);
        const digits = parts[1] !== undefined ? parseInt(parts[1]) : 0;

        const center = map.getCenter();
        const zoom = map.getZoom().toFixed(digits);
        const lng = center.lng.toFixed(digits);
        const lat = center.lat.toFixed(digits);
        locDisplay.textContent = `center: [${lng}, ${lat}], zoom: ${zoom}`;
        locDisplay.style.display = 'block';
      },
      reset() {
        locDisplay.style.display = 'none';
      }
    },
  ];

  function setZoomBtnText(inText, outText) {
    zoomInLeft.textContent  = inText;
    zoomInRight.textContent = inText;
    zoomOutLeft.textContent  = outText;
    zoomOutRight.textContent = outText;
  }

  function applyCommands() {
    const { matched, regionQuery } = parseInput(searchInput.value);
    commands.forEach(cmd => {
      if (matched[cmd.name]) cmd.apply(matched[cmd.name]);
      else cmd.reset();
    });
    updateProgress(regionQuery);
  }

  // ==================
  // 入力パース
  // ==================

  function parseInput(raw) {
    const normalized = raw.replace(/;/g, ',;');
    let regionPart = normalized;
    const matched = {};

    commands.forEach(cmd => {
      const m = regionPart.match(cmd.pattern);
      if (m) {
        matched[cmd.name] = m[0];
        const replacement = m[0].endsWith(',') ? ',' : '';
        regionPart = regionPart.slice(0, m.index) + replacement + regionPart.slice(m.index + m[0].length);
      }
    });

    const regionQuery = regionPart
      .split(',')
      .map(t => t.trim())
      .filter(t => t && !t.startsWith(';'))
      .join(',');

    return { matched, regionQuery };
  }

  function getCurrentRegionQuery() {
    return parseInput(searchInput.value).regionQuery;
  }

  // ==================
  // 進捗表示
  // ==================

  /** 検索クエリにマッチする地域名の配列を返す */
  function getMatchedRegions(query) {
    const searchTerms = query.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (searchTerms.length === 0) return [];
    const allRegions = [...Object.keys(countryRegions), 'Default', 'Commands'];
    return allRegions.filter(region =>
      searchTerms.some(term => {
        const termKana = toKatakana(term);
        return (
          region.toLowerCase().includes(term) ||
          getRegionDisplayName(region).toLowerCase().includes(term) ||
          toKatakana(getRegionDisplayName(region)).includes(termKana)
        );
      })
    );
  }

  /** 地域に属する国リストを返す */
  function buildCountryList(region) {
    const filledIds = new Set(Object.keys(filledFeatures).map(normalize));

    // GeoJSONから直接収集する地域
    const geoJsonRegions = {
      ...Object.fromEntries(
        Object.entries(REGION_TO_SOURCE).map(([region, key]) => [
          region,
          { key, codeProp: 'iso3166-2', nameProp: 'name' }
        ])
      ),
      'Default': { key: 'countries', codeProp: 'name', nameProp: 'name' },
    };

    if (geoJsonRegions[region]) {
      const { key, codeProp, nameProp } = geoJsonRegions[region];
      const items = [];
      const seenCodes = new Set();
      geojsonData[key]?.features?.forEach(f => {
        if (region === 'Default' && getRegion(f.properties, key) !== 'Default') return;
        const code = f.properties[codeProp];
        const name = f.properties[nameProp];
        if (code && !seenCodes.has(code)) {
          seenCodes.add(code);
          items.push({ code, name });
        }
      });
      return items.map(({ code, name }) => ({
        name: getDisplayName(name),
        code,
        filled: filledIds.has(normalize(code))
      }));
    }

    // countryRegionsから収集する地域
    return countryRegions[region].map(country => {
      const displayName = getDisplayName(country);
      return { name: displayName, code: country, filled: filledIds.has(normalize(country)) };
    });
  }

  /** Commands セクションのHTMLを生成する */
  function buildCommandsSectionHTML() {
    const raw = searchInput.value;
    const activeCommands = commands
      .map(cmd => {
        const m = raw.match(cmd.pattern);
        if (!m) return null;
        return { token: m[0].replace(/,$/, ''), index: m.index };
      })
      .filter(Boolean)
      .sort((a, b) => a.index - b.index)
      .map(({ token }) => token)
      .join('')
      .replace(/;;+/g, ';');

    const activeCommandsHTML = activeCommands
      ? `<div class="command-active">
          <code>${activeCommands}</code>
          <button class="copy-btn" data-copy="${activeCommands}">${COPY_ICON}</button>
        </div>`
      : `<div class="command-active command-none">No active commands</div>`;

    const listId = 'country-list-Commands';
    const isExpanded = expandedLists['Commands'] || false;

    return `
      <div class="region-progress-header commands-header">
        <div class="region-progress" style="cursor:default;">
          <div class="region-progress-name commands-title">${getRegionDisplayName('Commands')}</div>
        </div>
        <button class="toggle-list-btn" data-target="${listId}" data-region="Commands">${isExpanded ? '▲' : '▼'}</button>
      </div>
      <div id="${listId}" class="country-list" style="display:${isExpanded ? 'block' : 'none'};">
        ${activeCommandsHTML}
        <div><a href="https://github.com/kuansy373/anki-world-map#readme" target="_blank">${getDisplayName('README')}</a></div>
      </div>
    `;
  }

  /** 地域セクション1件分のHTMLを生成する */
  function buildRegionSectionHTML(region) {
    const countryList = buildCountryList(region);
    const filledCount = countryList.filter(c => c.filled).length;
    const totalCount = countryList.length;
    const color = regionColors[region] || regionColors.Default;
    const listId = `country-list-${region.replace(/\s+/g, '-')}`;
    const isExpanded = expandedLists[region] || false;
    const hasUnfilled = countryList.some(c => !c.filled);

    return `
      <div class="region-progress-header">
        <div class="region-progress" data-region="${region}" style="cursor:${hasUnfilled ? 'pointer' : 'default'};">
          <div class="region-progress-name" style="color:${color};">${getRegionDisplayName(region)}</div>
          <div class="region-progress-count">${filledCount} / ${totalCount}</div>
        </div>
        <button class="toggle-list-btn" data-target="${listId}" data-region="${region}">${isExpanded ? '▲' : '▼'}</button>
      </div>
      <div id="${listId}" class="country-list" style="display:${isExpanded ? 'block' : 'none'};">
        ${countryList.map(c => `<div data-code="${c.code}" style="color:${c.filled ? color : '#aaa'};">${c.name}</div>`).join('')}
      </div>
    `;
  }

  /** マッチした地域リストから進捗表示用のHTML文字列を生成する */
  function buildProgressHTML(matchedRegions) {
    return matchedRegions.map(region =>
      region === 'Commands'
        ? buildCommandsSectionHTML()
        : buildRegionSectionHTML(region)
    ).join('');
  }

  /** progressDisplay にイベントを登録する */
  function attachProgressEvents() {
    progressDisplay.addEventListener('click', e => {
      // .region-progress のクリック
      const regionProgress = e.target.closest('.region-progress');
      if (regionProgress) {
        const region = regionProgress.dataset.region;
        if (region === 'Commands') return;
        const countryList = buildCountryList(region);
        const unfilled = countryList.filter(c => !c.filled).map(c => c.code);
        if (unfilled.length === 0) return;
        const randomName = unfilled[Math.floor(Math.random() * unfilled.length)];
        const feature = findFeatureByName(randomName, getSourcesForRegion(region));
        if (feature) zoomToFeature(feature);
        return;
      }

      // .toggle-list-btn のクリック
      const toggleBtn = e.target.closest('.toggle-list-btn');
      if (toggleBtn) {
        const listEl = document.getElementById(toggleBtn.dataset.target);
        const open = listEl.style.display === 'none';
        listEl.style.display = open ? 'block' : 'none';
        toggleBtn.textContent = open ? '▲' : '▼';
        expandedLists[toggleBtn.dataset.region] = open;
        return;
      }

      // コマンドコピー
      const copyBtn = e.target.closest('.copy-btn');
      if (copyBtn) {
        copyToClipboard(copyBtn, copyBtn.dataset.copy);
        return;
      }

      // 国名 div のクリック
      const countryDiv = e.target.closest('[id^="country-list-"] div');
      if (countryDiv) {
        if (!countryDiv.dataset.code) return;
        const countryCode = countryDiv.dataset.code || countryDiv.textContent.trim();
        const regionId = countryDiv.closest('[id^="country-list-"]').id.replace('country-list-', '').replace(/-/g, ' ');
        const region = Object.keys(countryRegions).find(r => r.toLowerCase() === regionId.toLowerCase()) || 'Default';
        const feature = findFeatureByName(countryCode, getSourcesForRegion(region));
        if (feature) zoomToFeature(feature);
        else console.warn('国を特定できませんでした:', countryCode);
        return;
      }
    });

    progressDisplay.addEventListener('mouseover', e => {
      const countryDiv = e.target.closest('[id^="country-list-"] div');
      if (countryDiv) {
        countryDiv.dataset.origColor = countryDiv.style.color;
        countryDiv.style.color = '#000';
      }
    });

    progressDisplay.addEventListener('mouseout', e => {
      const countryDiv = e.target.closest('[id^="country-list-"] div');
      if (countryDiv && countryDiv.dataset.origColor) {
        countryDiv.style.color = countryDiv.dataset.origColor;
      }
    });
  }

  /** 進捗表示を更新する **/
  function updateProgress(regionQuery) {
    if (!regionQuery) { progressDisplay.innerHTML = ''; return; }

    // スクロール位置を保存
    const scrollPositions = {};
    progressDisplay.querySelectorAll('[id^="country-list-"]').forEach(list => {
      scrollPositions[list.id] = list.scrollTop;
    });

    const matchedRegions = getMatchedRegions(regionQuery);

    if (matchedRegions.length === 0) {
      progressDisplay.innerHTML = '<div style="color:#999; margin-top:8px;">No matching regions.</div>';
      return;
    }

    progressDisplay.innerHTML = buildProgressHTML(matchedRegions);

    // スクロール位置を復元
    progressDisplay.querySelectorAll('[id^="country-list-"]').forEach(list => {
      if (scrollPositions[list.id] !== undefined) list.scrollTop = scrollPositions[list.id];
    });
  }


  // ==================
  // searchInput イベント等
  // ==================

  attachProgressEvents();
  searchContainer.addEventListener('click', e => e.stopPropagation());
  searchInput.addEventListener('input', applyCommands);

  map.on('move', () => {
    const { matched } = parseInput(searchInput.value);
    if (matched.loc) commands.find(c => c.name === 'loc').apply(matched.loc);
  });

  window.addEventListener('resize', () => {
    if (aimOverlay.style.display !== 'none') applyCommands();
  });

  // ==================
  // ズームコントロール
  // ==================

  function moveY(delta) {
    const raw = searchInput.value;
    const match = raw.match(/\.y(-?\d*)/);
    if (!match) return;

    const current = match[1] === '' ? 50 : parseFloat(match[1]);
    const next    = Math.max(0, Math.min(100, current + delta));

    searchInput.value = raw.replace(/\.y-?\d*/, `.y${next}`);

    applyCommands();
  }


  function zoomAt(delta) {
    const canvas  = map.getCanvas();
    const rect    = canvas.getBoundingClientRect();

    let x, y;
    if (aimOverlay.style.display !== 'none') {
      const aimRect = aimOverlay.getBoundingClientRect();
      x = aimRect.left + aimRect.width  / 2 - rect.left;
      y = aimRect.top  + aimRect.height / 2 - rect.top;
    } else {
      x = rect.width  / 2;
      y = rect.height / 2;
    }

    map.easeTo({
      zoom: map.getZoom() + delta,
      around: map.unproject([x, y])
    });
  }

  [zoomInLeft, zoomInRight].forEach(el => {
    el.addEventListener('click', () => {
      if (el.textContent === '↑') moveY(1);
      else zoomAt(1);
    });
  });
  [zoomOutLeft, zoomOutRight].forEach(el => {
    el.addEventListener('click', () => {
      if (el.textContent === '↓') moveY(-1);
      else zoomAt(-1);
    });
  });
});
