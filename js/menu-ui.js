import { LAYER_ORDER, themes } from './config.js';
import { getRegionDisplayName, getMessage } from './lang.js';
import { regionColors, regionView } from './regions.js';
import { fillFeature, clearFeature, applyToRegionFeatures, setLayerVisibility, reorderLayers } from './map-layers.js';
import { updateProgress } from './progress.js';
import { getCurrentRegionQuery } from './commands.js';

let map;
let mapContainer;

// DOM要素
let menuContainer;
let menuToggle;
let menuTop;
let menuBottom;
let btnTheme;
let themePanel;
let btnLanguage;
let languagePanel;
let btnMaps;
let mapsPanel;
let btnLayers;
let layersPanel;
let btnRegions;
let regionControl;

// ==================
// メニュー開閉
// ==================

let topZIndex = 10;
function bringToFront(element) {
  element.style.zIndex = ++topZIndex;
}

let activePanel = null;
let activeBtn   = null;
let menuItems;

let outsideClickEnabled = true;

function setMenuVisible(visible) {
  const display = visible ? 'flex' : 'none';
  menuTop.style.display    = display;
  menuBottom.style.display = display;
}

function setToggleStyle(state) {
  if (state === 'open') {
    menuToggle.style.border       = '';
    menuToggle.style.borderStyle  = 'double';
  } else if (state === 'locked') {
    menuToggle.style.border       = '2px groove #e0dfdf';
    menuToggle.textContent = '✕';
  } else {
    menuToggle.style.border       = '';
    menuToggle.style.borderStyle = '';
    menuToggle.textContent = '☰';
  }
}

function hidePanels() {
  menuItems.forEach(([btn, panel]) => {
    panel.style.display = 'none';
    btn.classList.remove('active');
  });
  activePanel = null;
  activeBtn   = null;
}

function togglePanel(panel, btn) {
  const isOpen = panel.style.display !== 'none';
  hidePanels();
  if (!isOpen) {
    panel.style.display = 'block';
    btn.classList.add('active');
    activePanel = panel;
    activeBtn   = btn;
  }
}

function initMenuToggle() {
  menuToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menuTop.style.display !== 'none';

    if (!isOpen) {
      setMenuVisible(true);
      setToggleStyle('open');
      bringToFront(menuContainer);
      if (activePanel) {
        activePanel.style.display = 'block';
        activeBtn?.classList.add('active');
      }
    } else if (outsideClickEnabled) {
      outsideClickEnabled = false;
      setToggleStyle('locked');
    } else {
      outsideClickEnabled = true;
      setMenuVisible(false);
      setToggleStyle('');
      hidePanels();
    }
  });

  document.addEventListener('click', () => {
    if (!outsideClickEnabled) return;
    setMenuVisible(false);
    setToggleStyle('');
    hidePanels();
  });

  menuItems.forEach(([btn, panel]) => {
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(panel, btn); });
    panel.addEventListener('click', e => e.stopPropagation());
  });
}

// ==================
// レイヤーコントロール UI
// ==================

function initLayersPanel() {
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
      [`${key}-line`, `${key}-line-hitarea`].forEach(layerId => {
        if (map.getLayer(layerId)) map.setLayoutProperty(layerId, 'visibility', visibility);
      });
    });
  });
}

// ==================
// 地域コントロール UI
// ==================

const nestedChildren = {
  Asia: ['China Provinces', 'Japan Prefectures', 'Japan Old Provinces'],
  'North America': ['USA States'],
};

const childRegions = new Set(Object.values(nestedChildren).flat());

export function buildRegionControl() {
  regionControl.innerHTML = '';

  Object.entries(regionColors).forEach(([region, color]) => {
    if (childRegions.has(region)) return;

    const regionItem = createRegionItem(region, color);
    regionControl.appendChild(regionItem);

    if (nestedChildren[region]) {
      const childContainer = document.createElement('div');
      childContainer.className = 'region-children';

      nestedChildren[region].forEach(childRegion => {
        const childColor = regionColors[childRegion];
        const childItem = createRegionItem(childRegion, childColor);
        childItem.classList.add('region-child-item');
        childContainer.appendChild(childItem);
      });

      childContainer.style.display = 'none';
      regionControl.appendChild(childContainer);

      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'toggle-children-btn';
      toggleBtn.textContent = '▸';
      toggleBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = childContainer.style.display !== 'none';
        childContainer.style.display = isOpen ? 'none' : '';
        toggleBtn.textContent = isOpen ? '▸' : '▾';
        toggleBtn.style.opacity = isOpen ? '0.6' : '0.8';
      });

      const resetBtn = regionItem.querySelector('.reset-btn');
      resetBtn.insertAdjacentElement('afterend', toggleBtn);
    }
  });
}

function createRegionItem(region, color) {
  const regionItem = document.createElement('div');
  regionItem.className = 'region-item';
  regionItem.dataset.region = region;

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
    e.preventDefault();
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
  return regionItem;
}

export function updateRegionControlTexts() {
  regionControl.querySelectorAll('.region-item').forEach(item => {
    const region = item.dataset.region;
    item.querySelector('span:not(.color-box)').textContent = getRegionDisplayName(region);
  });
}

// ==================
// テーマコントロール UI
// ==================

function initThemePanel() {
  document.querySelectorAll('input[name="theme"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const theme = themes[e.target.value];
      map.setPaintProperty('background', 'background-color', theme.sea);
      mapContainer.classList.remove('theme-light', 'theme-dark');
      mapContainer.classList.add(`theme-${e.target.value}`);
    });
  });
}

// ==================
// 図法切り替え
// ==================

function initProjectionPanel() {
  document.querySelectorAll('input[name="projection"]').forEach(radio => {
    radio.addEventListener('change', e => {
      map.setProjection({ type: e.target.value });
    });
  });
}

// ==================
// 言語コントロール UI
// ==================

export function updateButtonTexts(currentLang) {
  document.querySelectorAll('[data-en][data-ja]').forEach(el => {
    const text = currentLang === 'ja' ? el.dataset.ja : el.dataset.en;
    if (el.tagName === 'INPUT') el.placeholder = text;
    else el.textContent = text;
  });
}

function initLanguagePanel(onLanguageChange) {
  document.querySelectorAll('input[name="language"]').forEach(radio => {
    radio.addEventListener('change', e => onLanguageChange(e.target.value));
  });
}

// ==================
// 初期化（エントリーポイント）
// ==================

export function initMenuUI(_map, _mapContainer, domRefs, {
  onLanguageChange,
}) {
  map           = _map;
  mapContainer  = _mapContainer;

  menuContainer = domRefs.menuContainer;
  menuToggle    = domRefs.menuToggle;
  menuTop       = domRefs.menuTop;
  menuBottom    = domRefs.menuBottom;
  btnTheme      = domRefs.btnTheme;
  themePanel    = domRefs.themePanel;
  btnLanguage   = domRefs.btnLanguage;
  languagePanel = domRefs.languagePanel;
  btnMaps       = domRefs.btnMaps;
  mapsPanel     = domRefs.mapsPanel;
  btnLayers     = domRefs.btnLayers;
  layersPanel   = domRefs.layersPanel;
  btnRegions    = domRefs.btnRegions;
  regionControl = domRefs.regionControl;

  menuItems = [
    [btnTheme,    themePanel],
    [btnLanguage, languagePanel],
    [btnMaps,     mapsPanel],
    [btnLayers,   layersPanel],
    [btnRegions,  regionControl],
  ];

  initMenuToggle();
  initLayersPanel();
  initThemePanel();
  initProjectionPanel();
  initLanguagePanel(onLanguageChange);
  buildRegionControl();
}

export { bringToFront };
