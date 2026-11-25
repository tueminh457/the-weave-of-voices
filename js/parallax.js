(function () {
  'use strict';
  const layers = Array.from(document.querySelectorAll('.pl')).map(el => ({
    box: el,
    img: el.firstElementChild,
    mode: el.dataset.mode,
    speed: parseFloat(el.dataset.speed)
  }));
  if (!layers.length) return;

  // distance (px) that drives the shift, depending on the layer's mode
  function distance(mode, r, vh) {
    if (mode === 'enter') return Math.max(0, vh - r.top);              // since the layer's top entered the screen
    if (mode === 'end') return Math.max(0, r.bottom - vh);             // until the layer's bottom reaches the screen bottom
    return (r.top + r.height / 2) - vh / 2;                             // 'center': distance from the screen centre
  }
  function update() {
    const vh = innerHeight;
    layers.forEach(l => {
      const r = l.box.getBoundingClientRect();   // the wrapper itself is never transformed
      const t = distance(l.mode, r, vh) * l.speed;
      l.img.style.transform = 'translate3d(0,' + t.toFixed(1) + 'px,0)';
    });
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);
  update();
})();
