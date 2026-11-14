import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getActiveNavigationItemId,
  getNavigationItemIdForHash,
  getSectionAtReferenceLine,
  navigationItems,
} from '../src/components/header/navigation.js';

test('la sección activa corresponde a la que cruza la línea de referencia', () => {
  const sections = [
    { id: 'coleccion', top: 120, bottom: 420 },
    { id: 'ritual', top: 420, bottom: 760 },
  ];

  assert.equal(getSectionAtReferenceLine(sections, 119), null);
  assert.equal(getSectionAtReferenceLine(sections, 120), 'coleccion');
  assert.equal(getSectionAtReferenceLine(sections, 419), 'coleccion');
  assert.equal(getSectionAtReferenceLine(sections, 420), 'ritual');
  assert.equal(getSectionAtReferenceLine(sections, 759), 'ritual');
  assert.equal(getSectionAtReferenceLine(sections, 760), null);
  assert.equal(getSectionAtReferenceLine(sections, 900), null);
});

test('los enlaces de navegación apuntan a las secciones reales de la landing', () => {
  assert.deepEqual(
    navigationItems.map(({ label, href, sectionId }) => [label, href, sectionId]),
    [
      ['Mezcales', '/#coleccion', 'coleccion'],
      ['Nosotros', '/#preguntas', 'preguntas'],
      ['Promociones', '/#coleccion', 'coleccion'],
    ],
  );
});

test('Nosotros se activa al cruzar las FAQ, y el ritual no activa ninguna opción', () => {
  assert.equal(getActiveNavigationItemId('preguntas'), 'nosotros');
  assert.equal(getActiveNavigationItemId('preguntas', 'nosotros'), 'nosotros');
  assert.equal(getNavigationItemIdForHash('#preguntas'), 'nosotros');
  assert.equal(getActiveNavigationItemId('ritual'), null);
  assert.equal(getNavigationItemIdForHash('#ritual'), null);
});

test('el catálogo activa Mezcales por scroll y Promociones sólo al pulsarlo', () => {
  assert.equal(getActiveNavigationItemId('coleccion'), 'mezcales');
  assert.equal(getActiveNavigationItemId('coleccion', 'promociones'), 'promociones');
  assert.equal(getActiveNavigationItemId(null), null);
});
