const AGE_GATE_PHASES = Object.freeze({
  CHECKING: 'checking',
  ARMED: 'armed',
  VISIBLE: 'visible',
  VERIFIED: 'verified',
});

function nextAgeGatePhase(phase, action) {
  if (phase === AGE_GATE_PHASES.ARMED && action === 'showcase-entered') {
    return AGE_GATE_PHASES.VISIBLE;
  }

  if (phase === AGE_GATE_PHASES.VISIBLE && action === 'confirm') {
    return AGE_GATE_PHASES.VERIFIED;
  }

  return phase;
}

function getShowcaseObserverOptions() {
  return {
    root: null,
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.08,
  };
}

function observeShowcase(document, window, onEnter) {
  let intersectionObserver;
  let mutationObserver;
  let timer;
  let polling;

  function attach() {
    const showcase = document.getElementById('coleccion');
    if (!showcase) return false;
    mutationObserver?.disconnect();
    if (polling) window.clearInterval(polling);
    if (!window.IntersectionObserver) {
      timer = window.setTimeout(onEnter, 1400);
    } else {
      intersectionObserver = new window.IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onEnter();
      }, getShowcaseObserverOptions());
      intersectionObserver.observe(showcase);
    }
    return true;
  }

  if (!attach()) {
    if (window.MutationObserver) {
      mutationObserver = new window.MutationObserver(attach);
      mutationObserver.observe(document.body, { childList: true, subtree: true });
    } else {
      polling = window.setInterval(attach, 250);
    }
  }
  return () => {
    mutationObserver?.disconnect();
    intersectionObserver?.disconnect();
    if (timer) window.clearTimeout(timer);
    if (polling) window.clearInterval(polling);
  };
}

export {
  AGE_GATE_PHASES,
  getShowcaseObserverOptions,
  nextAgeGatePhase,
  observeShowcase,
};
