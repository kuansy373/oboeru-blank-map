import { LAYER_KEYS, DYNAMIC_FRONT_KEYS, GRID_KEYS, REGION_TO_SOURCE, SOURCE_KEY_TO_REGION, themes } from './config.js';
import { getRegionDisplayName, getMessage } from './lang.js';
import { regionColors, regionView, geoPaths } from './regions.js';
import { fillFeature, clearFeature, applyToRegionFeatures, setLayerVisibility, reorderLayers, bringLayerToFront, updateGridInterval, loadLayerOnDemand, setLineLayerVisibility } from './map-layers.js';
import { updateProgress } from './progress.js';
import { getCurrentRegionQuery } from './commands.js';
import { initMenuToggle } from './ui-toggles.js';

let map;
let mapContainer;
let domRefs;

// ==================
// レイヤーコントロール UI
// ==================

const lazyKeys = new Set(Object.keys(geoPaths.onDemand));

function initLayersPanel() {
  LAYER_KEYS.forEach(key => {
    const cb = domRefs.layersPanel.querySelector(`#layer_${key}`);
    if (!cb) return;

    cb.addEventListener('change', async e => {
      if (lazyKeys.has(key)) {
        if (e.target.checked) {
          await loadLayerOnDemand(key);
          addLazyRegionItem(SOURCE_KEY_TO_REGION[key]);
          updateProgress(getCurrentRegionQuery());
        } else {
          setLayerVisibility(key, false);
        }
      } else {
        setLayerVisibility(key, e.target.checked);
      }

      if (e.target.checked && DYNAMIC_FRONT_KEYS.includes(key)) {
        bringLayerToFront(key);
      }
      reorderLayers();
    });
  });

  [...GRID_KEYS, 'dateLine'].forEach(key => {
    const cb = domRefs.layersPanel.querySelector(`#layer_${key}`);
    cb?.addEventListener('change', e => {
      if (e.target.checked && lazyKeys.has(key)) {
        loadLayerOnDemand(key);
      } else {
        setLineLayerVisibility(key, e.target.checked);
      }
    });
  });

  const template = document.getElementById('grid-interval-options');
  GRID_KEYS.forEach(key => {
    const select = document.getElementById(`${key}-interval`);
    select.appendChild(template.content.cloneNode(true));
    select.addEventListener('change', e => {
      updateGridInterval(key, Number(e.target.value));
    });
  });
}

function isLazyRegion(region) {
  const sourceKey = REGION_TO_SOURCE[region];
  return sourceKey ? lazyKeys.has(sourceKey) : false;
}

function addLazyRegionItem(region) {
  if (!region || !regionColors[region]) return;
  if (domRefs.regionControl.querySelector(`.region-item[data-region="${region}"]`)) return;

  const regionItem = createRegionItem(region, regionColors[region]);

  const parentRegion = Object.entries(nestedChildren)
    .find(([, children]) => children.includes(region))?.[0];

  if (parentRegion) {
    regionItem.classList.add('region-child-item');
    const parentItem = domRefs.regionControl.querySelector(`.region-item[data-region="${parentRegion}"]`);
    const childContainer = parentItem?.nextElementSibling;

    if (childContainer) {
      childContainer.appendChild(regionItem);
      addToggleButton(parentItem, childContainer)
    }
  } else {
    domRefs.regionControl.appendChild(regionItem);
  }
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
  domRefs.regionControl.innerHTML = '';

  Object.entries(regionColors).forEach(([region, color]) => {
    if (childRegions.has(region)) return;
    if (isLazyRegion(region)) return;

    const regionItem = createRegionItem(region, color);
    domRefs.regionControl.appendChild(regionItem);

    if (nestedChildren[region]) {
      appendChildRegions(region, regionItem);
    }
  });
}

function appendChildRegions(region, regionItem) {
  const childContainer = document.createElement('div');
  childContainer.className = 'region-children';

  nestedChildren[region].forEach(childRegion => {
    if (isLazyRegion(childRegion)) return;

    const childItem = createRegionItem(childRegion, regionColors[childRegion]);
    childItem.classList.add('region-child-item');
    childContainer.appendChild(childItem);
  });

  childContainer.style.display = 'none';
  domRefs.regionControl.appendChild(childContainer);

  if (childContainer.children.length > 0) {
    addToggleButton(regionItem, childContainer);
  }
}

function addToggleButton(regionItem, childContainer) {
  if (regionItem.querySelector('.toggle-children-btn')) return;

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'toggle-children-btn';
  toggleBtn.textContent = '▸';
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = childContainer.style.display !== 'none';
    childContainer.style.display = isOpen ? 'none' : '';
    toggleBtn.textContent = isOpen ? '▸' : '▾';
    toggleBtn.style.opacity = isOpen ? '' : '0.65';
  });

  regionItem.querySelector('.reset-btn').insertAdjacentElement('afterend', toggleBtn);
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

  regionItem.addEventListener('click', e => e.stopPropagation());

  colorBox.addEventListener('click', () => {
    applyToRegionFeatures(region, (key, fId) => fillFeature(key, fId, color));
    updateProgress(getCurrentRegionQuery());
  });

  label.addEventListener('click', e => {
    e.preventDefault();
    const view = regionView[region];
    if (view) map.flyTo({ center: view.center, zoom: view.zoom, speed: 0.8, curve: 1.2, essential: true });
    else alert(`${getRegionDisplayName(region)} ${getMessage('noViewSettings')}`);
  });

  resetBtn.addEventListener('click', () => {
    applyToRegionFeatures(region, (key, fId) => clearFeature(key, fId));
    updateProgress(getCurrentRegionQuery());
  });

  regionItem.append(colorBox, label, resetBtn);
  return regionItem;
}

export function updateRegionControlTexts() {
  domRefs.regionControl.querySelectorAll('.region-item').forEach(item => {
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

export function initMenuUI(_map, _mapContainer, _domRefs, {
  onLanguageChange,
}) {
  map          = _map;
  mapContainer = _mapContainer;
  domRefs      = _domRefs;

  const menuItems = [
    [domRefs.btnTheme,    domRefs.themePanel],
    [domRefs.btnLanguage, domRefs.languagePanel],
    [domRefs.btnMaps,     domRefs.mapsPanel],
    [domRefs.btnLayers,   domRefs.layersPanel],
    [domRefs.btnRegions,  domRefs.regionControl],
  ];
  initMenuToggle(domRefs, menuItems);
  initLayersPanel();
  initThemePanel();
  initProjectionPanel();
  initLanguagePanel(onLanguageChange);
  buildRegionControl();
}
