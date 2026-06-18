import { setLang, updateButtonTexts } from './lang.js';
import { initCommands, commands, parseInput, getCurrentRegionQuery, applyCommands } from './commands.js';
import { initMapLayers } from './map-layers.js';
import { initMapEvents, registerClickEvents } from './map-events.js';
import { initProgress, updateProgress, attachProgressEvents } from './progress.js';
import { initMenuUI, updateRegionControlTexts, bringToFront } from './menu-ui.js';

document.addEventListener('DOMContentLoaded', () => {

  // ==================
  // マップ初期化
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

  // ==================
  // DOM参照
  // ==================

  const mapContainer    = document.getElementById('bm-worldmap');
  const searchToggle    = document.getElementById('search-toggle');
  const searchContainer = document.getElementById('search-container');
  const searchInput     = document.getElementById('search-input');
  const closeButton     = document.getElementById('close-button');
  const progressDisplay = document.getElementById('progress-display');
  const menuContainer   = document.getElementById('menu-container');
  const menuToggle      = document.getElementById('menu-toggle');
  const menuTop         = document.getElementById('menu-top');
  const menuBottom      = document.getElementById('menu-bottom');
  const btnTheme        = document.getElementById('btn-theme');
  const themePanel      = document.getElementById('theme-panel');
  const btnLanguage     = document.getElementById('btn-language');
  const languagePanel   = document.getElementById('language-panel');
  const btnMaps         = document.getElementById('btn-maps');
  const mapsPanel       = document.getElementById('maps-panel');
  const btnLayers       = document.getElementById('btn-layers');
  const layersPanel     = document.getElementById('layers-panel');
  const btnRegions      = document.getElementById('btn-regions');
  const regionControl   = document.getElementById('region-control');
  const zoomControlsLeft  = document.getElementById('zoom-controls-left');
  const zoomControlsRight = document.getElementById('zoom-controls-right');
  const zoomInLeft    = document.getElementById('zoom-in-left');
  const zoomInRight   = document.getElementById('zoom-in-right');
  const zoomOutLeft   = document.getElementById('zoom-out-left');
  const zoomOutRight  = document.getElementById('zoom-out-right');
  const aimOverlay    = document.getElementById('aim-overlay');
  const locDisplay    = document.getElementById('loc-display');

  // ==================
  // モジュール初期化
  // ==================

  initCommands(map, {
    searchInput,
    zoomControlsLeft, zoomControlsRight,
    zoomInLeft, zoomInRight,
    zoomOutLeft, zoomOutRight,
    aimOverlay, locDisplay,
  });

  initMapEvents(map, {
    updateProgress,
    getCurrentRegionQuery,
  });

  initProgress(progressDisplay, searchInput);

  initMenuUI(map, mapContainer, {
    menuContainer, menuToggle, menuTop, menuBottom,
    btnTheme, themePanel, btnLanguage, languagePanel,
    btnMaps, mapsPanel, btnLayers, layersPanel,
    btnRegions, regionControl,
  }, {
    updateProgress,
    getCurrentRegionQuery,
    onLanguageChange: (lang) => {
      setLang(lang);
      updateProgress(getCurrentRegionQuery());
      updateRegionControlTexts();
      updateButtonTexts(lang);
    },
  });
  updateButtonTexts('en');

  initMapLayers(map, mapContainer, layersPanel, registerClickEvents);


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
  // searchInput・マップイベント
  // ==================

  attachProgressEvents();
  searchContainer.addEventListener('click', e => e.stopPropagation());
  searchInput.addEventListener('input', () => applyCommands(updateProgress));

  map.on('move', () => {
    const { matched } = parseInput(searchInput.value);
    if (matched.loc) commands.find(c => c.name === 'loc').apply(matched.loc);
  });

  window.addEventListener('resize', () => {
    if (aimOverlay.style.display !== 'none') applyCommands(updateProgress);
  });

  // ==================
  // ズームコントロール
  // ==================

  function moveY(delta) {
    const raw   = searchInput.value;
    const match = raw.match(/\.y(-?\d*)/);
    if (!match) return;

    const current = match[1] === '' ? 50 : parseFloat(match[1]);
    const next    = Math.max(0, Math.min(100, current + delta));

    searchInput.value = raw.replace(/\.y-?\d*/, `.y${next}`);
    applyCommands(updateProgress);
  }

  function zoomAt(delta) {
    const canvas = map.getCanvas();
    const rect   = canvas.getBoundingClientRect();

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
