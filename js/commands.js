let map;
let domRefs;

// ==================
// ユーティリティ
// ==================

function tokenToParts(token) {
  return token.replace(/^;/, '').replace(/[,;]$/, '').split('.').filter(Boolean);
}

function applySizeOpacityPart(part, state) {
  const sMatch = part.match(/^s(\d+)$/);
  if (sMatch) { state.w = parseInt(sMatch[1]); state.h = parseInt(sMatch[1]); return true; }
  const wMatch = part.match(/^w(\d+)$/);
  if (wMatch) { state.w = parseInt(wMatch[1]); return true; }
  const hMatch = part.match(/^h(\d+)$/);
  if (hMatch) { state.h = parseInt(hMatch[1]); return true; }
  const oMatch = part.match(/^o(\d+)$/);
  if (oMatch) { state.opacity = parseInt(oMatch[1]) / 100; return true; }
  return false;
}

// ==================
// コマンド定義
// ==================

export const commands = [
  {
    name: 'zm',
    pattern: /;zm(\.[lr]|\.y-?\d*|\.[whs]\d+|\.o\d+)*[,;]?/,
    apply(token) {
      const parts = tokenToParts(token);

      let showLeft  = true;
      let showRight = true;
      let yVal      = 50;
      let yMode     = false;
      const size    = { w: 44, h: 44, opacity: 1 };

      parts.forEach(part => {
        if (part === 'zm') return;
        if (part === 'r') { showLeft  = false; return; }
        if (part === 'l') { showRight = false; return; }
        if (part === 'y') { yMode = true; return; }
        const yMatch = part.match(/^y(-?\d+)$/);
        if (yMatch) { yVal = Math.max(0, Math.min(100, parseFloat(yMatch[1]))); yMode = true; return; }
        applySizeOpacityPart(part, size);
      });

      if (token.endsWith(',')) yMode = false;

      domRefs.zoomControlsLeft.style.display    = showLeft  ? 'flex' : 'none';
      domRefs.zoomControlsRight.style.display   = showRight ? 'flex' : 'none';
      domRefs.zoomControlsLeft.style.bottom     = `${yVal}%`;
      domRefs.zoomControlsRight.style.bottom    = `${yVal}%`;
      domRefs.zoomControlsLeft.style.transform  = 'translateY(50%)';
      domRefs.zoomControlsRight.style.transform = 'translateY(50%)';
      domRefs.zoomControlsLeft.style.opacity    = size.opacity;
      domRefs.zoomControlsRight.style.opacity   = size.opacity;

      [domRefs.zoomInLeft, domRefs.zoomInRight, domRefs.zoomOutLeft, domRefs.zoomOutRight].forEach(btn => {
        btn.style.width  = `${size.w}px`;
        btn.style.height = `${size.h}px`;
      });

      setZoomBtnText(yMode ? '↑' : '+', yMode ? '↓' : '-');
    },
    reset() {
      domRefs.zoomControlsLeft.style.display  = 'none';
      domRefs.zoomControlsRight.style.display = 'none';
      domRefs.zoomControlsLeft.style.opacity  = '1';
      domRefs.zoomControlsRight.style.opacity = '1';
      [domRefs.zoomInLeft, domRefs.zoomInRight, domRefs.zoomOutLeft, domRefs.zoomOutRight].forEach(btn => {
        btn.style.width  = '';
        btn.style.height = '';
      });
      setZoomBtnText('+', '-');
    }
  },
  {
    name: 'aim',
    pattern: /;aim(\.[whs]\d+|\.o\d+)*[,;]?/,
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
      domRefs.aimOverlay.style.opacity = '1';
    }
  },
  {
    name: 'loc',
    pattern: /;loc(\.\d+)?[,;]?/,
    apply(token) {
      const parts  = tokenToParts(token);
      const digits = parts[1] !== undefined ? parseInt(parts[1]) : 0;

      const center = map.getCenter();
      const zoom   = map.getZoom().toFixed(digits);
      const lng    = center.lng.toFixed(digits);
      const lat    = center.lat.toFixed(digits);
      domRefs.locDisplay.textContent   = `center: [${lng}, ${lat}], zoom: ${zoom}`;
      domRefs.locDisplay.style.display = 'block';
    },
    reset() {
      domRefs.locDisplay.style.display = 'none';
    }
  },
];

// ==================
// ズームボタンテキスト
// ==================

function setZoomBtnText(inText, outText) {
  domRefs.zoomInLeft.textContent   = inText;
  domRefs.zoomInRight.textContent  = inText;
  domRefs.zoomOutLeft.textContent  = outText;
  domRefs.zoomOutRight.textContent = outText;
}

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
// 初期化（エントリーポイント）
// ==================

export function initCommands(_map, _domRefs) {
  map = _map;
  domRefs = _domRefs;
}
