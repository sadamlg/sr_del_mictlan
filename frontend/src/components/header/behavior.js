export function shouldHideHeaderOnScroll(scrollY, previousScrollY) {
  return scrollY > previousScrollY && scrollY > 80;
}

export function shouldDisplayHeader(headerVisible, menuOpen) {
  return headerVisible || menuOpen;
}

export function nextMenuState(open, action) {
  if (action === 'toggle') return !open;
  if (action === 'navigate' || action === 'desktop') return false;
  return open;
}

export function getMenuToggleProps(isOpen) {
  return { 'aria-expanded': isOpen, 'aria-label': isOpen ? 'Cerrar menú' : 'Abrir menú' };
}

export function getMobileNavigationProps(isOpen) {
  return { 'aria-hidden': !isOpen, inert: !isOpen };
}

export function lockBodyScroll(body) {
  body.classList.add('mobile-menu-open');
  return () => body.classList.remove('mobile-menu-open');
}
