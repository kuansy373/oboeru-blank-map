let map;
let zoomControlsLeft;
let zoomControlsRight;
let zoomInLeft;
let zoomInRight;
let zoomOutLeft;
let zoomOutRight;
let aimOverlay;
let locDisplay;
let searchInput;

// ==================
// コマンド定義
// ==================

export const commands = [
  {
    name: 'zm',
    pattern: /;zm(\.[lr])?(\.y-?\d*)?(\.[lr])?(\.y-?\d*)*[,;]?/,
    apply(token) {
      const parts = token.replace(/^;/, '').replace(/,$/, '').split('.').filter(Boolean);

      let showLeft  = true;
      let showRight = true;
      let yVal      = 50;
      let yMode     = false;

      parts.forEach(part => {
        if (part === 'zm') return;
        if (part === 'r') { showLeft  = false; return; }
        if (part === 'l') { showRight = false; return; }
        if (part === 'y') { yMode = true; return; }
        const yMatch = part.match(/^y(-?\d+)$/);
        if (yMatch) { yVal = Math.max(0, Math.min(100, parseFloat(yMatch[1]))); yMode = true; return; }
      });

      if (token.endsWith(',')) yMode = false;

      zoomControlsLeft.style.display    = showLeft  ? 'flex' : 'none';
      zoomControlsRight.style.display   = showRight ? 'flex' : 'none';
      zoomControlsLeft.style.bottom     = `${yVal}%`;
      zoomControlsRight.style.bottom    = `${yVal}%`;
      zoomControlsLeft.style.transform  = 'translateY(50%)';
      zoomControlsRight.style.transform = 'translateY(50%)';

      setZoomBtnText(yMode ? '↑' : '+', yMode ? '↓' : '-');
    },
    reset() {
      zoomControlsLeft.style.display  = 'none';
      zoomControlsRight.style.display = 'none';
      setZoomBtnText('+', '-');
    }
  },
  {
    name: 'aim',
    pattern: /;aim(\.[whs]\d+|\.o\d+)*[,;]?/,
    apply(token) {
      const parts = token.replace(/^;/, '').replace(/,$/, '').split('.').filter(Boolean);

      let w = 24;
      let h = 24;

      parts.forEach(part => {
        if (part === 'aim') return;
        const sMatch = part.match(/^s(\d+)$/);
        if (sMatch) { w = parseInt(sMatch[1]); h = parseInt(sMatch[1]); return; }
        const wMatch = part.match(/^w(\d+)$/);
        if (wMatch) { w = parseInt(wMatch[1]); return; }
        const hMatch = part.match(/^h(\d+)$/);
        if (hMatch) { h = parseInt(hMatch[1]); return; }
        const oMatch = part.match(/^o(\d+)$/);
        if (oMatch) { aimOverlay.style.opacity = parseInt(oMatch[1]) / 100; return; }
      });

      aimOverlay.style.display = 'block';
      aimOverlay.style.width   = `${Math.min(w, window.innerWidth)}px`;
      aimOverlay.style.height  = `${Math.min(h, window.innerHeight)}px`;
    },
    reset() {
      aimOverlay.style.display = 'none';
      aimOverlay.style.opacity = '1';
    }
  },
  {
    name: 'loc',
    pattern: /;loc(\.\d+)?[,;]?/,
    apply(token) {
      const parts  = token.replace(/^;/, '').replace(/[,;]$/, '').split('.').filter(Boolean);
      const digits = parts[1] !== undefined ? parseInt(parts[1]) : 0;

      const center = map.getCenter();
      const zoom   = map.getZoom().toFixed(digits);
      const lng    = center.lng.toFixed(digits);
      const lat    = center.lat.toFixed(digits);
      locDisplay.textContent   = `center: [${lng}, ${lat}], zoom: ${zoom}`;
      locDisplay.style.display = 'block';
    },
    reset() {
      locDisplay.style.display = 'none';
    }
  },
];

// ==================
// ズームボタンテキスト
// ==================

function setZoomBtnText(inText, outText) {
  zoomInLeft.textContent   = inText;
  zoomInRight.textContent  = inText;
  zoomOutLeft.textContent  = outText;
  zoomOutRight.textContent = outText;
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
  return parseInput(searchInput.value).regionQuery;
}

export function applyCommands(updateProgress) {
  const { matched, regionQuery } = parseInput(searchInput.value);
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
  const raw = searchInput.value;
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

export function initCommands(_map, {
  searchInput:       _searchInput,
  zoomControlsLeft:  _zoomControlsLeft,
  zoomControlsRight: _zoomControlsRight,
  zoomInLeft:        _zoomInLeft,
  zoomInRight:       _zoomInRight,
  zoomOutLeft:       _zoomOutLeft,
  zoomOutRight:      _zoomOutRight,
  aimOverlay:        _aimOverlay,
  locDisplay:        _locDisplay,
}) {
  map               = _map;
  searchInput       = _searchInput;
  zoomControlsLeft  = _zoomControlsLeft;
  zoomControlsRight = _zoomControlsRight;
  zoomInLeft        = _zoomInLeft;
  zoomInRight       = _zoomInRight;
  zoomOutLeft       = _zoomOutLeft;
  zoomOutRight      = _zoomOutRight;
  aimOverlay        = _aimOverlay;
  locDisplay        = _locDisplay;
}
