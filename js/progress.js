import { GEOJSON_REGIONS, REGION_TO_SOURCE, COPY_ICON } from './config.js';
import { normalize, toKatakana, copyToClipboard, getRegion } from './utils.js';
import { getDisplayName, getRegionDisplayName } from './lang.js';
import { countryRegions, regionColors } from './regions.js';
import { geojsonData, filledFeatures, findFeatureById, getSourcesForRegion, zoomToFeature, isLayerLoaded } from './map-layers.js';
import { buildActiveCommandsString } from './commands.js';

let progressDisplay;

const expandedLists = {};

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

function buildCommandsSectionHTML() {
  const activeCommands = buildActiveCommandsString();

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
      <div><a href="https://github.com/kuansy373/oboeru-blank-map#readme" target="_blank">${getDisplayName('README')}</a></div>
    </div>
  `;
}

function buildRegionSectionHTML(region) {
  const countryList = buildCountryList(region);
  const filledCount = countryList.filter(c => c.filled).length;
  const totalCount  = countryList.length;
  const color       = regionColors[region] || regionColors.Default;
  const listId      = `country-list-${region.replace(/\s+/g, '-')}`;
  const isExpanded  = expandedLists[region] || false;
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

export function updateProgress(regionQuery) {
  if (!regionQuery) { progressDisplay.innerHTML = ''; return; }

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

  progressDisplay.querySelectorAll('[id^="country-list-"]').forEach(list => {
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
      const open = listEl.style.display === 'none';
      listEl.style.display = open ? 'block' : 'none';
      toggleBtn.textContent = open ? '▲' : '▼';
      expandedLists[toggleBtn.dataset.region] = open;
      return;
    }

    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      copyToClipboard(copyBtn, copyBtn.dataset.copy);
      return;
    }

    const countryDiv = e.target.closest('[id^="country-list-"] div');
    if (countryDiv) {
      if (!countryDiv.dataset.code) return;
      const countryCode = countryDiv.dataset.code;
      const feature = findFeatureById(countryCode);
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

// ==================
// 初期化（エントリーポイント）
// ==================

export function initProgress(_progressDisplay) {
  progressDisplay       = _progressDisplay;
}
