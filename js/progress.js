import { GEOJSON_REGIONS, REGION_TO_SOURCE, COPY_ICON } from './config.js';
import { normalize, toKatakana, copyToClipboard, getRegion } from './utils.js';
import { getDisplayName, getRegionDisplayName } from './lang.js';
import { countryRegions, regionColors } from './regions.js';
import { geojsonData, filledFeatures, findFeatureById, getSourcesForRegion, zoomToFeature, isLayerLoaded } from './map-layers.js';
import { buildActiveCommandsString } from './commands.js';

let progressDisplay;

const expandedLists = {};

const COUNTRY_LIST_SELECTOR = '[id^="country-list-"]';

// ==================
// 地域マッチング
// ==================

export function getMatchedRegions(query) {
  const searchTerms = query.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  if (searchTerms.length === 0) return [];
  const allRegions = [...Object.keys(countryRegions), 'Default', 'Commands']
    .filter(region => {
      const sourceKey = REGION_TO_SOURCE[region];
      return !sourceKey || isLayerLoaded(sourceKey);
    });
  return allRegions.filter(region => {
    const displayName = getRegionDisplayName(region);
    return searchTerms.some(term => {
      const termKana = toKatakana(term);
      return (
        region.toLowerCase().includes(term) ||
        displayName.toLowerCase().includes(term) ||
        toKatakana(displayName).includes(termKana)
      );
    });
  });
}

// ==================
// 国リスト構築
// ==================

function buildCountryList(region) {
  const filledIds = new Set(Object.keys(filledFeatures).map(normalize));

  if (GEOJSON_REGIONS[region]) {
    const { key, codeProp, nameProp } = GEOJSON_REGIONS[region];
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

  const codeToName = {};
  const source = geojsonData.countries ?? geojsonData.countriesLow;
  source?.features?.forEach(f => {
    if (f.properties.id) codeToName[f.properties.id] = f.properties.names;
  });

  return countryRegions[region].map(country => ({
    name: getDisplayName(codeToName[country] || country),
    code: country,
    filled: filledIds.has(normalize(country))
  }));
}

// ==================
// HTML構築
// ==================

function buildSectionWrapper(region, headerInnerHTML, bodyInnerHTML, headerExtraClass = '', listStyle = '') {
  const listId = `country-list-${region.replace(/\s+/g, '-')}`;
  const isExpanded = expandedLists[region] || false;

  return `
    <div class="region-progress-header${headerExtraClass ? ' ' + headerExtraClass : ''}">
      ${headerInnerHTML}
      <button class="toggle-list-btn" data-target="${listId}" data-region="${region}">${isExpanded ? '▲' : '▼'}</button>
    </div>
    <div id="${listId}" class="country-list${isExpanded ? '' : ' collapsed'}"${listStyle ? ` style="${listStyle}"` : ''}>
      ${bodyInnerHTML}
    </div>
  `;
}

function buildCommandsSectionHTML() {
  const activeCommands = buildActiveCommandsString();

  const activeCommandsHTML = activeCommands
    ? `<div class="command-active">
        <code>${activeCommands}</code>
        <button class="copy-btn" data-copy="${activeCommands}">${COPY_ICON}</button>
      </div>`
    : `<div class="command-active command-none">No active commands</div>`;

  const headerInner = `
    <div class="region-progress">
      <div class="region-progress-name commands-title">${getRegionDisplayName('Commands')}</div>
    </div>`;

  const bodyInner = `
    ${activeCommandsHTML}
    <div><a href="https://github.com/kuansy373/oboeru-blank-map#readme" target="_blank">${getDisplayName('README')}</a></div>
  `;

  return buildSectionWrapper('Commands', headerInner, bodyInner, 'commands-header');
}

function buildRegionSectionHTML(region) {
  const countryList = buildCountryList(region);
  const filledCount = countryList.filter(c => c.filled).length;
  const totalCount  = countryList.length;
  const color       = regionColors[region] || regionColors.Default;
  const hasUnfilled = countryList.some(c => !c.filled);

  const headerInner = `
    <div class="region-progress${hasUnfilled ? ' clickable' : ''}" data-region="${region}">
      <div class="region-progress-name" style="color:${color};">${getRegionDisplayName(region)}</div>
      <div class="region-progress-count">${filledCount} / ${totalCount}</div>
    </div>`;

  const bodyInner = countryList
    .map(c => `<div data-code="${c.code}" class="${c.filled ? 'filled' : ''}">${c.name}</div>`)
    .join('');

  return buildSectionWrapper(region, headerInner, bodyInner, '', `--region-color:${color};`);
}

function buildProgressHTML(matchedRegions) {
  return matchedRegions.map(region =>
    region === 'Commands'
      ? buildCommandsSectionHTML()
      : buildRegionSectionHTML(region)
  ).join('');
}

// ==================
// 進捗更新
// ==================

function findCountryDiv(e) {
  return e.target.closest(`${COUNTRY_LIST_SELECTOR} div`);
}

export function updateProgress(regionQuery) {
  if (!regionQuery) { progressDisplay.innerHTML = ''; return; }

  const scrollPositions = {};
  progressDisplay.querySelectorAll(COUNTRY_LIST_SELECTOR).forEach(list => {
    scrollPositions[list.id] = list.scrollTop;
  });

  const matchedRegions = getMatchedRegions(regionQuery);

  if (matchedRegions.length === 0) {
    progressDisplay.innerHTML = '<div style="color:#999; margin-top:8px;">No matching regions.</div>';
    return;
  }

  progressDisplay.innerHTML = buildProgressHTML(matchedRegions);

  progressDisplay.querySelectorAll(COUNTRY_LIST_SELECTOR).forEach(list => {
    if (scrollPositions[list.id] !== undefined) list.scrollTop = scrollPositions[list.id];
  });
}

// ==================
// イベント登録
// ==================

export function attachProgressEvents() {
  progressDisplay.addEventListener('click', e => {
    const regionProgress = e.target.closest('.region-progress');
    if (regionProgress) {
      const region = regionProgress.dataset.region;
      if (region === 'Commands') return;
      const countryList = buildCountryList(region);
      const unfilled = countryList.filter(c => !c.filled).map(c => c.code);
      if (unfilled.length === 0) return;
      const randomName = unfilled[Math.floor(Math.random() * unfilled.length)];
      const feature = findFeatureById(randomName, getSourcesForRegion(region));
      if (feature) zoomToFeature(feature);
      return;
    }

    const toggleBtn = e.target.closest('.toggle-list-btn');
    if (toggleBtn) {
      const listEl = document.getElementById(toggleBtn.dataset.target);
      const open = listEl.classList.contains('collapsed');
      listEl.classList.toggle('collapsed', !open);
      toggleBtn.textContent = open ? '▲' : '▼';
      expandedLists[toggleBtn.dataset.region] = open;
      return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      copyToClipboard(copyBtn, copyBtn.dataset.copy);
      return;
    }

    const countryDiv = findCountryDiv(e);
    if (countryDiv) {
      if (!countryDiv.dataset.code) return;
      const countryCode = countryDiv.dataset.code;
      const feature = findFeatureById(countryCode);
      if (feature) zoomToFeature(feature);
      else console.warn('国を特定できませんでした:', countryCode);
      return;
    }
  });
}

// ==================
// 初期化（エントリーポイント）
// ==================

export function initProgress(_progressDisplay) {
  progressDisplay       = _progressDisplay;
}
