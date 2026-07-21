let map;
let domRefs;
let zmYMode = false;
let zmXMode = false;

// ==================
// ユーティリティ
// ==================

function tokenToParts(token) {
  return token
    .replace(/^;/, '')
    .replace(/[,;]$/, '')
    .split(/\.(?=[a-z])/)
    .filter(Boolean);
}

function applySizeOpacityPart(part, state) {
  const sMatch = part.match(/^s(\d+(?:\.\d+)?)$/);
  if (sMatch) { state.w = parseFloat(sMatch[1]); state.h = parseFloat(sMatch[1]); return true; }
  const wMatch = part.match(/^w(\d+(?:\.\d+)?)$/);
  if (wMatch) { state.w = parseFloat(wMatch[1]); return true; }
  const hMatch = part.match(/^h(\d+(?:\.\d+)?)$/);
  if (hMatch) { state.h = parseFloat(hMatch[1]); return true; }
  const oMatch = part.match(/^o(\d+(?:\.\d+)?)$/);
  if (oMatch) { state.opacity = parseFloat(oMatch[1]) / 100; return true; }
  return false;
}

// ==================
// コマンド定義
// ==================

export const commands = [
  {
    name: 'zm',
    pattern: /;zm(\.[lr]|\.y-?\d*(\.\d+)?|\.x-?\d*(\.\d+)?|\.[whso]\d+(\.\d+)?)*[,;]?/,
    apply(token) {
      const parts = tokenToParts(token);

      let showLeft  = true;
      let showRight = true;
      let yVal      = 50;
      let yMode     = false;
      let xVal      = 0;
      let xMode     = false;
      const size    = { w: 44, h: 44, opacity: 1 };

      parts.forEach(part => {
        if (part === 'zm') return;
        if (part === 'r') { showLeft  = false; return; }
        if (part === 'l') { showRight = false; return; }
        if (part === 'y') { yMode = true; return; }
        const yMatch = part.match(/^y(-?\d+(?:\.\d+)?)$/);
        if (yMatch) { yVal = Math.max(0, Math.min(100, parseFloat(yMatch[1]))); yMode = true; return; }
        if (part === 'x') { xMode = true; return; }
        const xMatch = part.match(/^x(-?\d+(?:\.\d+)?)$/);
        if (xMatch) { xVal = Math.max(0, Math.min(100, parseFloat(xMatch[1]))); xMode = true; return; }
        applySizeOpacityPart(part, size);
      });

      if (token.endsWith(',')) { yMode = false; xMode = false; }

      zmYMode = yMode;
      zmXMode = xMode;

      domRefs.zoomControlsLeft.style.display    = showLeft  ? 'flex' : 'none';
      domRefs.zoomControlsRight.style.display   = showRight ? 'flex' : 'none';
      domRefs.zoomControlsLeft.style.bottom     = `${yVal}%`;
      domRefs.zoomControlsRight.style.bottom    = `${yVal}%`;
      domRefs.zoomControlsLeft.style.left       = `${xVal}%`;
      domRefs.zoomControlsRight.style.right     = `${xVal}%`;
      domRefs.zoomControlsLeft.style.opacity    = size.opacity;
      domRefs.zoomControlsRight.style.opacity   = size.opacity;
      domRefs.zoomControlsLeft.classList.toggle('zm-drag-active', yMode || xMode);
      domRefs.zoomControlsRight.classList.toggle('zm-drag-active', yMode || xMode);

      [domRefs.zoomInLeft, domRefs.zoomInRight, domRefs.zoomOutLeft, domRefs.zoomOutRight].forEach(btn => {
        btn.style.width  = `${size.w}px`;
        btn.style.height = `${size.h}px`;
      });
    },
    reset() {
      domRefs.zoomControlsLeft.style.display  = 'none';
      domRefs.zoomControlsRight.style.display = 'none';
      domRefs.zoomControlsLeft.style.opacity  = '';
      domRefs.zoomControlsRight.style.opacity = '';
      domRefs.zoomControlsLeft.style.left     = '';
      domRefs.zoomControlsRight.style.right   = '';
      domRefs.zoomControlsLeft.classList.remove('zm-drag-active');
      domRefs.zoomControlsRight.classList.remove('zm-drag-active');
      zmYMode = false;
      zmXMode = false;
      [domRefs.zoomInLeft, domRefs.zoomInRight, domRefs.zoomOutLeft, domRefs.zoomOutRight].forEach(btn => {
        btn.style.width  = '';
        btn.style.height = '';
      });
    }
  },
  {
    name: 'aim',
    pattern: /;aim(\.[whso]\d+(\.\d+)?)*[,;]?/,
    apply(token) {
      const parts = tokenToParts(token);
      const size = { w: 24, h: 24, opacity: 1 };

      parts.forEach(part => {
        if (part === 'aim') return;
        applySizeOpacityPart(part, size);
      });

      domRefs.aimOverlay.style.opacity = size.opacity;
      domRefs.aimOverlay.style.display = 'block';
      domRefs.aimOverlay.style.width   = `${Math.min(size.w, window.innerWidth)}px`;
      domRefs.aimOverlay.style.height  = `${Math.min(size.h, window.innerHeight)}px`;
    },
    reset() {
      domRefs.aimOverlay.style.display = 'none';
      domRefs.aimOverlay.style.opacity = '';
    }
  },
  {
    name: 'loc',
    pattern: /;loc(\.s\d+(\.\d+)?|\.d\d+)*[,;]?/,
    apply(token) {
      const parts = tokenToParts(token);
      let digits = 0;
      let fontSize = null;

      parts.forEach(part => {
        if (part === 'loc') return;
        const sMatch = part.match(/^s(\d+(?:\.\d+)?)$/);
        if (sMatch) { fontSize = parseFloat(sMatch[1]); return; }
        const dMatch = part.match(/^d(\d+)$/);
        if (dMatch) { digits = parseInt(dMatch[1]); return; }
      });

      const center = map.getCenter();
      const zoom   = map.getZoom().toFixed(digits);
      const lng    = center.lng.toFixed(digits);
      const lat    = center.lat.toFixed(digits);
      domRefs.locDisplay.textContent   = `center: [${lng}, ${lat}], zoom: ${zoom}`;
      domRefs.locDisplay.style.display = 'block';
      domRefs.locDisplay.style.fontSize = fontSize !== null ? `${fontSize}px` : '';
    },
    reset() {
      domRefs.locDisplay.style.display  = 'none';
      domRefs.locDisplay.style.fontSize = '';
    },
  },
  {
    name: 'pp',
    pattern: /;pp[,;]?/,
    apply(_token) {
      document.querySelectorAll('.popup-pin-btn').forEach(btn => {
        btn.classList.remove('popup-pin-btn--hidden');
      });
    },
    reset() {
      document.querySelectorAll('.popup-pin-btn').forEach(btn => {
        btn.classList.add('popup-pin-btn--hidden');
      });
    },
  },
];

// ==================
// 入力パース
// ==================

export function parseInput(raw) {
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

export function getCurrentRegionQuery() {
  return parseInput(domRefs.searchInput.value).regionQuery;
}

export function applyCommands(updateProgress) {
  const { matched, regionQuery } = parseInput(domRefs.searchInput.value);
  commands.forEach(cmd => {
    if (matched[cmd.name]) cmd.apply(matched[cmd.name]);
    else cmd.reset();
  });
  updateProgress(regionQuery);
}

// ==================
// アクティブコマンド文字列の生成（progress.js で使用）
// ==================

export function buildActiveCommandsString() {
  const raw = domRefs.searchInput.value;
  return commands
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
}

// ==================
// 外部からの状態参照・値更新
// ==================

// ドラッグモード
export function isZoomYMode() {
  return zmYMode;
}

export function isZoomXMode() {
  return zmXMode;
}

function updateZoomAxisValue(axis, newVal) {
  const raw   = domRefs.searchInput.value;
  const regex = new RegExp(`\\.${axis}-?\\d*(\\.\\d+)?`);
  const match = raw.match(regex);
  if (!match) return raw;

  const clamped = Math.max(0, Math.min(100, newVal));
  const rounded = Math.round(clamped * 10) / 10;

  const updated = raw.replace(regex, `.${axis}${rounded}`);
  domRefs.searchInput.value = updated;
  return updated;
}

export function updateZoomYValue(newVal) {
  return updateZoomAxisValue('y', newVal);
}

export function updateZoomXValue(newVal) {
  return updateZoomAxisValue('x', newVal);
}

// ポップアップ固定ボタン
export function isPinPopupMode() {
  const raw = domRefs?.searchInput?.value ?? '';
  return /;pp[,;]?/.test(raw);
}

// ==================
// 初期化（エントリーポイント）
// ==================

export function initCommands(_map, _domRefs) {
  map = _map;
  domRefs = _domRefs;
}
