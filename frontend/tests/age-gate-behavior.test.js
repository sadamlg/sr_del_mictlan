import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AGE_GATE_PHASES,
  getShowcaseObserverOptions,
  nextAgeGatePhase,
  observeShowcase,
} = require('../src/components/age-gate/age-gate-behavior');

test('the age gate remains armed until the mezcal showcase enters the viewport', () => {
  assert.equal(
    nextAgeGatePhase(AGE_GATE_PHASES.ARMED, 'showcase-entered'),
    AGE_GATE_PHASES.VISIBLE,
  );
  assert.equal(
    nextAgeGatePhase(AGE_GATE_PHASES.ARMED, 'showcase-left'),
    AGE_GATE_PHASES.ARMED,
  );
});

test('espera a que el escaparate diferido exista antes de observarlo', () => {
  let section = null;
  let mutationCallback;
  let intersectionCallback;
  let observed;
  let entered = 0;
  const document = { body: {}, getElementById: () => section };
  const window = {
    MutationObserver: class {
      constructor(callback) { mutationCallback = callback; }
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      constructor(callback) { intersectionCallback = callback; }
      observe(element) { observed = element; }
      disconnect() {}
    },
  };
  const stop = observeShowcase(document, window, () => entered++);
  assert.equal(entered, 0);
  section = {};
  mutationCallback();
  assert.equal(observed, section);
  assert.equal(entered, 0);
  intersectionCallback([{ isIntersecting: true }]);
  assert.equal(entered, 1);
  stop();
});

test('confirming age permanently clears the gate for the current render', () => {
  assert.equal(
    nextAgeGatePhase(AGE_GATE_PHASES.VISIBLE, 'confirm'),
    AGE_GATE_PHASES.VERIFIED,
  );
  assert.equal(
    nextAgeGatePhase(AGE_GATE_PHASES.VERIFIED, 'showcase-entered'),
    AGE_GATE_PHASES.VERIFIED,
  );
});

test('the showcase observer opens the gate shortly after the section starts appearing', () => {
  assert.deepEqual(getShowcaseObserverOptions(), {
    root: null,
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.08,
  });
});
