import { SOURCE_KEY_TO_REGION, COPY_ICON } from './config.js';
import { countryRegions } from './regions.js';

// ==================
// 文字列ユーティリティ
// ==================

export function normalize(name) {
  return name.trim().toLowerCase();
}

export function toKatakana(str) {
  return str.replace(/[\u3041-\u3096]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

// ==================
// クリップボード
// ==================

export async function copyToClipboard(button, text) {
  if (button.dataset.copying) return;
  button.dataset.copying = 'true';
  try {
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
// フィーチャーID・地域判定
// ==================

export function getFeatureId(key, feature) {
  if (key === 'countries') return feature.properties.name;
  return feature.properties.id;
}

export function getRegion(properties, key) {
  if (SOURCE_KEY_TO_REGION[key]) return SOURCE_KEY_TO_REGION[key];
  const isoCode = properties['name'] || properties['ISO3166-1-Alpha-2'];
  const n = normalize(properties.name || '');
  for (const [region, list] of Object.entries(countryRegions)) {
    if (isoCode && list.includes(isoCode)) return region;
    if (list.some(c => normalize(c) === n)) return region;
  }
  return 'Default';
}
