import { setLang, updateButtonTexts } from './lang.js';
import { initCommands, commands, parseInput, getCurrentRegionQuery, applyCommands, isZoomYMode, updateZoomYValue, isZoomXMode, updateZoomXValue } from './commands.js';
import { initMapLayers } from './map-layers.js';
import { initMapEvents, registerClickEvents, refreshOpenPopups } from './map-events.js';
import { initProgress, updateProgress, attachProgressEvents } from './progress.js';
import { initMenuUI, updateRegionControlTexts } from './menu-ui.js';
import { initSearchToggle } from './ui-toggles.js';

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
      refreshOpenPopups();
      updateProgress(getCurrentRegionQuery());
      updateRegionControlTexts();
      updateButtonTexts(lang);
    },
  });
  updateButtonTexts('en');

  initMapLayers(map, mapContainer, layersPanel, registerClickEvents);

  initSearchToggle({ searchToggle, searchContainer, closeButton });

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

  // ズームボタンのドラッグ（x/yモード時の位置調整）
  function setupZoomDrag(container, side) {
    let dragging = false;
    let startPointerX = 0; // 掴んだ瞬間の指のX座標
    let startPointerY = 0; // 掴んだ瞬間の指のY座標
    let startValX = 0;     // 掴んだ瞬間のボタンのx%
    let startValY = 0;     // 掴んだ瞬間のボタンのy%

    container.addEventListener('pointerdown', (e) => {
      if (!isZoomXMode() && !isZoomYMode()) return;
      dragging = true;

      startPointerX = e.clientX;
      startPointerY = e.clientY;

      // 現在のcssの値（%）をそのまま読み取って記録する
      startValX = parseFloat(container.style.left || container.style.right) || 0;
      startValY = parseFloat(container.style.bottom) || 0;

      container.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    container.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      e.preventDefault();

      if (isZoomYMode()) {
        const vh = window.innerHeight;
        const deltaY = startPointerY - e.clientY; // 上に動かすほどプラス
        const deltaPercentY = (deltaY / vh) * 100;
        updateZoomYValue(startValY + deltaPercentY);
      }

      if (isZoomXMode()) {
        const vw = window.innerWidth;
        const deltaX = e.clientX - startPointerX; // 右に動かすほどプラス
        const deltaPercentX = (deltaX / vw) * 100;

        // leftは右に動くほど値が増える、rightは右に動くほど値が減る
        const signedDelta = side === 'left' ? deltaPercentX : -deltaPercentX;
        updateZoomXValue(startValX + signedDelta);
      }

      applyCommands(updateProgress);
    });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { container.releasePointerCapture(e.pointerId); } catch (err) {}
    };

    container.addEventListener('pointerup', endDrag);
    container.addEventListener('pointercancel', endDrag);

    // ドラッグモード中は、ボタンのclick（ズーム操作）を抑制する
    container.addEventListener('click', (e) => {
      if (isZoomXMode() || isZoomYMode()) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
  }

  setupZoomDrag(zoomControlsLeft, 'left');
  setupZoomDrag(zoomControlsRight, 'right');

  // ズーム
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
    el.addEventListener('click', () => zoomAt(1));
  });

  [zoomOutLeft, zoomOutRight].forEach(el => {
    el.addEventListener('click', () => zoomAt(-1));
  });
});
