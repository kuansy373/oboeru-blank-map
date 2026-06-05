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

  // レイヤー順（下から上）
  const LAYER_ORDER = ['countries', 'usaStates', 'chinaProvinces' ];

  // GeoJSONデータを保持するオブジェクト
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

  // ==================
  // DOM参照
  // ==================

  const mapContainer    = document.getElementById('bm-worldmap');
  const menuToggle    = document.getElementById('menu-toggle');
  const menuButtons = document.getElementById('menu-buttons');
  const menuAllButtons = document.getElementById('menu-all-buttons');
  const btnTheme   = document.getElementById('btn-theme');
  const themePanel = document.getElementById('theme-panel');
  const btnLanguage    = document.getElementById('btn-language');
  const languagePanel = document.getElementById('language-panel');
  const btnMaps = document.getElementById('btn-maps');
  const mapsPanel = document.getElementById('maps-panel');
  const btnLayers = document.getElementById('btn-layers');
  const layersPanel   = document.getElementById('layers-panel');
  const btnRegions    = document.getElementById('btn-regions');
  const regionControl   = document.getElementById('region-control');
  const searchInput     = document.getElementById('search-input');
  const closeButton     = document.getElementById('close-button');
  const progressDisplay = document.getElementById('progress-display');
  const searchToggle = document.getElementById('search-toggle');
  const searchContainer = document.getElementById('search-container');


  // ==================
  // ユーティリティ関数
  // ==================

  /** 文字列を正規化（前後空白除去・小文字化） */
  function normalize(name) {
    return name.trim().toLowerCase();
  }

  /** フィーチャのプロパティから地域名を返す */
  function getRegion(properties) {
    if (properties.state_code && countryRegions['USA States'].includes(properties.state_code)) {
      return 'USA States';
    }
    const isoCode = properties['name'] || properties['ISO3166-1-Alpha-2'];
    if (isoCode) {
      for (const [region, list] of Object.entries(countryRegions)) {
        if (list.includes(isoCode)) return region;
      }
    }
    const n = normalize(properties.name || '');
    for (const [region, list] of Object.entries(countryRegions)) {
      if (list.some(c => normalize(c) === n)) return region;
    }
    return 'Default';
  }

  /** フィーチャIDを取得（usaStates は state_code、それ以外は name） */
  function getFeatureId(key, feature) {
    return key === 'usaStates'
      ? feature.properties.state_code
      : (feature.properties['name'] || feature.id || feature.properties.id);
  }

  /** GeoJSONロード後にインデックスを構築する */
  function buildFeatureIndex(key, data) {
    const index = new Map();
    data.features.forEach(feature => {
      const props = feature.properties;
      const candidates = [
        props.name, props.NAME, props.ADMIN, props.ADMIN_EN,
        props.state_code, props['ISO3166-1-Alpha-2']
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

  // ひらがな→カナ変換
  function toKatakana(str) {
    return str.replace(/[\u3041-\u3096]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    );
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
        if (getRegion(f.properties) !== region) return;
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
    const zoomLevels = [
      [5_000_000, 3], [1_000_000, 4], [100_000, 5], [10_000, 6],
      [1_000, 7], [100, 8], [10, 9], [5, 10], [1, 11], [0.5, 12], [0.1, 13], [0.05, 14]
    ];
    const zoom = zoomLevels.find(([t]) => area > t)?.[1] ?? 15;
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

  function registerClickEvents() {
    // ---- 国・州 ----
    LAYER_ORDER.forEach(key => {
      map.on('click', `${key}-fill`, e => {
        const feature = e.features[0];
        const props   = feature.properties;

        // 上位レイヤーのフィーチャがある場合は無視
        const upperLayers = LAYER_ORDER.slice(LAYER_ORDER.indexOf(key) + 1).map(k => `${k}-fill`);
        if (upperLayers.some(l => map.queryRenderedFeatures(e.point, { layers: [l] }).length > 0)) return;

        const featureId = getFeatureId(key, feature);
        const id        = featureId || props.id || props.name || props.NAME;
        const name      = props.name || props.NAME || props.ADMIN || props.ADMIN_EN || 'Unknown';
        const region    = getRegion(props);
        const fillColor = regionColors[region] || regionColors.Default;

        if (!filledFeatures[id]) {
          fillFeature(key, id, fillColor);
          updateProgress();
        } else {
          // 塗り済みの場合：ポップアップでリセット可能にする
          const popup = new maplibregl.Popup()
            .setLngLat(e.lngLat)
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
              updateProgress();
            });
          }, 0);
        }
      });

      map.on('mouseenter', `${key}-fill`, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', `${key}-fill`, () => { map.getCanvas().style.cursor = ''; });
    });

    // ---- 経線・緯線 ----
    ['meridians-line-hitarea', 'parallels-line-hitarea', 'dateLine-line-hitarea'].forEach(layerId => {
      const isMeridian = layerId === 'meridians-line-hitarea';
      const isDateLine = layerId === 'dateLine-line-hitarea';

      map.on('click', layerId, e => {
        // 上位レイヤー（国・州）が存在する場合は無視
        const topFeatures = map.queryRenderedFeatures(e.point, {
          layers: ['countries-fill', 'countries-line', 'usaStates-fill', 'usaStates-line']
        });

        if (topFeatures.length > 0 || !e.features.length) return;

        // 日付変更線と180°経線なら、経線優先
        if (isDateLine) {
          const meridianFeatures = map.queryRenderedFeatures(e.point, {
            layers: ['meridians-line-hitarea']
          });

          if (meridianFeatures.length > 0) return;
        }

        let degree;
        let label;
        let uniqueId;

        if (isDateLine) {
          degree = 180;
          label = getDisplayName('International Date Line');
          uniqueId = 'date_line';
        } else {
          const coords = e.features[0].geometry.coordinates;
          degree = Math.round(isMeridian ? coords[0][0] : coords[0][1]);
          label = getDisplayName(isMeridian ? 'Lng: ' : 'Lat: ') + degree + '°';
          uniqueId = (isMeridian ? 'lon_' : 'lat_') + degree;
        }

        const hlLayerId  = `highlight-line-${uniqueId}`;
        const hlSourceId = `highlight-source-${uniqueId}`;

        // 既存ハイライトを解除
        if (highlightedLines.has(uniqueId)) {
          if (map.getLayer(hlLayerId))   map.removeLayer(hlLayerId);
          if (map.getSource(hlSourceId)) map.removeSource(hlSourceId);
          highlightedLines.delete(uniqueId);
          return;
        }

        // 新規ハイライト追加
        const highlightFeature = isDateLine
          ? geojsonData.dateLine.features[0]
          : {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: isMeridian
                  ? [[degree, -85.0511], [degree, 85.0511]]
                  : [[-180, degree], [180, degree]]
              }
            };

        map.addSource(hlSourceId, { type: 'geojson', data: highlightFeature });
        map.addLayer({ id: hlLayerId, type: 'line', source: hlSourceId, paint: { 'line-color': '#ff7171', 'line-width': 1.5 } });
        map.moveLayer(hlLayerId);
        highlightedLines.set(uniqueId, { layerId: hlLayerId, sourceId: hlSourceId, degree });

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
      promoteId: key === 'usaStates'     ? 'state_code'
               : key === 'chinaProvinces' ? 'name'
               : 'name'
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
    else document.getElementById(`layer_${key}`).checked = true;
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

      const colorBox = document.createElement('span');
      colorBox.className = 'color-box';
      colorBox.style.background = color;

      const label = document.createElement('span');
      label.textContent = getRegionDisplayName(region);

      const resetBtn = document.createElement('button');
      resetBtn.className = 'reset-btn';

      // 色ボックスクリック：地域全体を塗りつぶす
      colorBox.addEventListener('click', e => {
        e.stopPropagation();
        applyToRegionFeatures(region, (key, fId) => fillFeature(key, fId, color));
        updateProgress();
      });

      // 地域名クリック：その地域にズーム
      label.addEventListener('click', e => {
        e.stopPropagation();
        const view = regionView[region];
        if (view) map.flyTo({ center: view.center, zoom: view.zoom, speed: 0.8, curve: 1.2, essential: true });
          else alert(`${getRegionDisplayName(region)} ${getMessage('noViewSettings')}`);
      });

      // リセットボタン：地域全体の色塗りを解除
      resetBtn.addEventListener('click', e => {
        e.stopPropagation();
        applyToRegionFeatures(region, (key, fId) => clearFeature(key, fId));
        updateProgress();
      });

      regionItem.append(colorBox, label, resetBtn);
      regionControl.appendChild(regionItem);
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
    radio.addEventListener('change', e => {
      applyTheme(e.target.value);
    });
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
    if (currentLang === 'ja') return translations[name] || name;
    return name;
  }

  function getRegionDisplayName(region) {
    if (currentLang === 'ja') return regionNameJa[region] || region;
    return region;
  }

  document.querySelectorAll('input[name="language"]').forEach(radio => {
    radio.addEventListener('change', e => {
      currentLang = e.target.value;
      updateProgress();
      buildRegionControl();
      updateButtonTexts();
    });
  });

  // ==================
  // メニュー開閉
  // ==================

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
    const isOpen = menuAllButtons.style.display !== 'none';
    menuAllButtons.style.display = isOpen ? 'none' : 'flex';
    menuButtons.style.display = isOpen ? 'none' : 'flex';
    if (isOpen) {
      hidePanels();
    } else if (activePanel) {
      activePanel.style.display = 'block';
      activeBtn?.classList.add('active');
    }
  });

  document.addEventListener('click', () => {
    menuAllButtons.style.display = 'none';
    menuButtons.style.display = 'none';
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
      if (e.target.value === 'globe') {
        map.setProjection({ type: 'globe' });
      } else {
        map.setProjection({ type: 'mercator' });
      }
    });
  });

  // ==================
  // 検索・トグルボタン
  // ==================

  searchToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = getComputedStyle(searchContainer).display !== 'none';
    searchContainer.style.display = isOpen ? 'none' : 'block';
  });

  searchInput.addEventListener('input', updateProgress);

  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    searchContainer.style.display = 'none';
  });


  // ==================
  // 進捗表示
  // ==================

  /** 検索クエリにマッチする地域名の配列を返す */
  function getMatchedRegions(query) {
    const searchTerms = query.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    if (searchTerms.length === 0) return [];
    const allRegions = [...Object.keys(countryRegions), 'Default'];
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
    if (region !== 'Default') {
      return countryRegions[region].map(country => {
        let displayName = country;
        if (region === 'USA States' && geojsonData.usaStates?.features) {
          const match = geojsonData.usaStates.features.find(f => f.properties.state_code === country);
          if (match?.properties.name) displayName = match.properties.name;
        }
        displayName = getDisplayName(displayName);
        const filled = Object.keys(filledFeatures).some(id => normalize(country) === normalize(id) || country === id);
        return { name: displayName, code: country, filled };
      });
    }
    // Default 地域：GeoJSONから直接収集
    const defaultIds = new Set();
    geojsonData.countries?.features?.forEach(f => {
      if (getRegion(f.properties) === 'Default') defaultIds.add(f.properties.name || f.id);
    });
    return [...defaultIds].map(id => ({
      name: id,
      code: id,
      filled: Object.keys(filledFeatures).some(fid => normalize(id) === normalize(fid) || id === fid)
    }));
  }

  /** マッチした地域リストから進捗表示用のHTML文字列を生成する */
  function buildProgressHTML(matchedRegions) {
    return matchedRegions.map(region => {
      const countryList = buildCountryList(region);
      const filledCount = countryList.filter(c => c.filled).length;
      const totalCount = countryList.length;
      const color = regionColors[region] || regionColors.Default;
      const listId = `country-list-${region.replace(/\s+/g, '-')}`;
      const isExpanded = expandedLists[region] || false;
      const hasUnfilled = countryList.some(c => !c.filled);
      return `
        <div class="region-progress-wrapper">
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
        </div>
      `;
    }).join('');
  }

  /** progressDisplay にイベントを登録する */
  function attachProgressEvents() {
    // 地域クリック：ランダムな未塗り国へズーム
    progressDisplay.querySelectorAll('.region-progress').forEach(elem => {
      elem.addEventListener('click', () => {
        const region = elem.dataset.region;
        const countryList = buildCountryList(region);
        const unfilled = countryList.filter(c => !c.filled).map(c => c.code);
        if (unfilled.length === 0) return;
        const randomName = unfilled[Math.floor(Math.random() * unfilled.length)];
        const feature = findFeatureByName(randomName, region === 'USA States' ? ['usaStates'] : undefined);
        if (feature) zoomToFeature(feature);
      });
    });

    // 国名クリック：その国へズーム
    progressDisplay.querySelectorAll('[id^="country-list-"] div').forEach(elem => {
      elem.style.cursor = 'pointer';
      elem.addEventListener('mouseenter', () => { elem.dataset.origColor = elem.style.color; elem.style.color = '#000'; });
      elem.addEventListener('mouseleave', () => { if (elem.dataset.origColor) elem.style.color = elem.dataset.origColor; });
      elem.addEventListener('click', e => {
        e.stopPropagation();
        const countryCode = elem.dataset.code || elem.textContent.trim();
        const regionId = elem.closest('[id^="country-list-"]').id.replace('country-list-', '').replace(/-/g, ' ');
        const region = Object.keys(countryRegions).find(r => r.toLowerCase() === regionId.toLowerCase()) || 'Default';
        const feature = findFeatureByName(countryCode, region === 'USA States' ? ['usaStates'] : undefined);
        if (feature) zoomToFeature(feature);
        else console.warn('国を特定できませんでした:', countryCode);
      });
    });

    // 国リストの開閉トグル
    progressDisplay.querySelectorAll('.toggle-list-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const listEl = document.getElementById(btn.dataset.target);
        const open = listEl.style.display === 'none';
        listEl.style.display = open ? 'block' : 'none';
        btn.textContent = open ? '▲' : '▼';
        expandedLists[btn.dataset.region] = open;
      });
    });
  }

  /** 進捗表示を更新する **/
  function updateProgress() {
    // スクロール位置を保存
    const scrollPositions = {};
    progressDisplay.querySelectorAll('[id^="country-list-"]').forEach(list => {
      scrollPositions[list.id] = list.scrollTop;
    });

    const searchQuery = searchInput.value.trim();
    if (!searchQuery) { progressDisplay.innerHTML = ''; return; }

    const matchedRegions = getMatchedRegions(searchQuery);
    if (matchedRegions.length === 0) {
      progressDisplay.innerHTML = '<div style="color:#999; margin-top:8px;">No matching regions.</div>';
      return;
    }

    progressDisplay.innerHTML = buildProgressHTML(matchedRegions);
    attachProgressEvents();

    // スクロール位置を復元
    progressDisplay.querySelectorAll('[id^="country-list-"]').forEach(list => {
      if (scrollPositions[list.id] !== undefined) list.scrollTop = scrollPositions[list.id];
    });
  }
});
