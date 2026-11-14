export const navigationItems = [
  { id: 'mezcales', label: 'Mezcales', href: '/#coleccion', sectionId: 'coleccion' },
  { id: 'nosotros', label: 'Nosotros', href: '/#preguntas', sectionId: 'preguntas', activeOnClick: true },
  { id: 'promociones', label: 'Promociones', href: '/#coleccion', sectionId: 'coleccion', activeOnClick: true },
];

export function getSectionAtReferenceLine(sections, referenceLine) {
  return sections.find(({ top, bottom }) => top <= referenceLine && referenceLine < bottom)?.id ?? null;
}

export function getNavigationItemIdForHash(hash) {
  return navigationItems.find(({ href, sectionId }) => {
    return sectionId && new URL(href, 'http://localhost').hash === hash;
  })?.id ?? null;
}

export function getActiveNavigationItemId(sectionId, selectedItemId = null) {
  if (navigationItems.some(({ id, activeOnClick }) => id === selectedItemId && activeOnClick)) {
    return selectedItemId;
  }
  return navigationItems.find(({ sectionId: targetId }) => targetId && targetId === sectionId)?.id ?? null;
}
