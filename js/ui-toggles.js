import { bringToFront } from './utils.js';

// ==================
// メニュー開閉
// ==================

let activePanel = null;
let activeBtn   = null;
let outsideClickEnabled = true;

function setMenuVisible(domRefs, visible) {
  const display = visible ? 'flex' : 'none';
  domRefs.menuTop.style.display = display;
  domRefs.menuBottom.style.display = display;
}

function setToggleStyle(domRefs, state) {
  const btn = domRefs.menuToggle;
  btn.classList.remove('open', 'locked');
  if (state === 'open') {
    btn.classList.add('open');
  } else if (state === 'locked') {
    btn.classList.add('locked');
  }
  btn.textContent = state === 'locked' ? '✕' : '☰';
}

function hideActivePanelDisplay(menuItems) {
  menuItems.forEach(([btn, panel]) => {
    panel.style.display = 'none';
    btn.classList.remove('active');
  });
}

function hidePanels(menuItems) {
  hideActivePanelDisplay(menuItems);
  activePanel = null;
  activeBtn   = null;
}

function togglePanel(menuItems, panel, btn) {
  const isOpen = panel.style.display !== 'none';
  hidePanels(menuItems);
  if (!isOpen) {
    panel.style.display = 'block';
    btn.classList.add('active');
    activePanel = panel;
    activeBtn   = btn;
  }
}

export function initMenuToggle(domRefs, menuItems) {
  domRefs.menuToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = domRefs.menuTop.style.display !== 'none';

    if (!isOpen) {
      setMenuVisible(domRefs, true);
      setToggleStyle(domRefs, 'open');
      bringToFront(domRefs.menuContainer);
      if (activePanel) {
        activePanel.style.display = 'block';
        activeBtn?.classList.add('active');
      }
    } else if (outsideClickEnabled) {
      outsideClickEnabled = false;
      setToggleStyle(domRefs, 'locked');
    } else {
      outsideClickEnabled = true;
      setMenuVisible(domRefs, false);
      setToggleStyle(domRefs, '');
      hideActivePanelDisplay(menuItems);
    }
  });

  document.addEventListener('click', () => {
    if (!outsideClickEnabled) return;
    setMenuVisible(domRefs, false);
    setToggleStyle(domRefs, '');
    hideActivePanelDisplay(menuItems);
  });

  menuItems.forEach(([btn, panel]) => {
    btn.addEventListener('click', e => { e.stopPropagation(); togglePanel(menuItems, panel, btn); });
    panel.addEventListener('click', e => e.stopPropagation());
  });
}

// ==================
// 検索トグル
// ==================

export function initSearchToggle({ searchToggle, searchContainer, closeButton }) {
  searchToggle.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = getComputedStyle(searchContainer).display !== 'none';
    searchContainer.style.display = isOpen ? 'none' : 'block';
    bringToFront(searchContainer);
  });

  closeButton.addEventListener('click', () => {
    searchContainer.style.display = 'none';
  });
}
