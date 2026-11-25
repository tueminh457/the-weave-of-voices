// Landing page: loading screen + parallax stage.
// Layers (back to front): paper background, title, wave 1, wave 2, wave 3.


(function () {
  'use strict';
  const IMG_W = 1920, IMG_H = 3480;           // size of the extended wave images
  const body = document.body;
  const hero = document.getElementById('top');
  const stage = hero.querySelector('.stage');
  const title = document.getElementById('title-layer');
  const waves = Array.from(stage.querySelectorAll('.wave')).map(el => ({
    el, y0: parseFloat(el.dataset.y0), yf: parseFloat(el.dataset.yf)
  }));
  const art = document.getElementById('art-mount');
  const FADE_START = 0.3, FADE_END = 0.97;     // scroll range over which the waves fade into the art (wider = slower)
  const MASK_URLS = [3, 2, 1].map(n => 'url("assets/wave-' + n + '-ext.png")').join(',');

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- parallax ----------
  function setMask(on, x, w, h, ys) {
    const v = on ? MASK_URLS : 'none';
    art.style.webkitMaskImage = art.style.maskImage = v;
    if (!on) { art.style.opacity = ''; return; }
    const size = [w + 'px ' + h + 'px', w + 'px ' + h + 'px', w + 'px ' + h + 'px'].join(',');
    const pos = ys.slice().reverse().map(y => x + 'px ' + y + 'px').join(',');   // wave 3, 2, 1
    art.style.webkitMaskSize = art.style.maskSize = size;
    art.style.webkitMaskPosition = art.style.maskPosition = pos;
    art.style.webkitMaskRepeat = art.style.maskRepeat = 'no-repeat';
  }

  function update() {
    const vw = innerWidth, vh = innerHeight;
    const k = Math.max(vw, vh * 16 / 9) / IMG_W;          
    const w = IMG_W * k, h = IMG_H * k, unit = 1080 * k;  
    const x = (vw - w) / 2;
    const p = clamp(scrollY / (hero.offsetHeight - vh), 0, 1);
    const ys = waves.map(wv => (wv.y0 + (wv.yf - wv.y0) * p) * unit);

    waves.forEach((wv, i) => {
      wv.el.style.width = w + 'px';
      wv.el.style.transform = 'translate3d(' + x + 'px,' + ys[i] + 'px,0)';
    });
    title.style.transform = 'translate3d(0,' + (-p * vh * 0.35) + 'px,0)';   

    const finished = p >= 0.999;
    stage.style.visibility = finished ? 'hidden' : 'visible';
    body.classList.toggle('landing-active', !finished);
    setMask(!finished, x, w, h, ys);
    if (!finished) art.style.opacity = smooth(FADE_START, FADE_END, p);   
  }

  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; update(); });
  }
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll);

  // ---------- loading screen ----------
  const loader = document.getElementById('loader');
  const pctEl = document.getElementById('loader-pct');
  const tasks = { images: 0, fonts: 0, art: 0 };
  const images = ['background', 'wave-1-ext', 'wave-2-ext', 'wave-3-ext', 'mountain', 'path', 'cloud', 'silk'];
  let shown = 0, finishing = false;
  const started = performance.now();

  images.forEach(n => {
    const im = new Image();
    im.onload = im.onerror = () => { tasks.images++; };
    im.src = 'assets/' + n + '.png';
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { tasks.fonts = 1; });
  } else { tasks.fonts = 1; }
  const watchArt = () => { if (body.classList.contains('art-ready')) tasks.art = 1; };
  new MutationObserver(watchArt).observe(body, { attributes: true, attributeFilter: ['class'] });
  watchArt();

  function target() { return (tasks.images / images.length + tasks.fonts + tasks.art) / 3; }

  function finish() {
    if (finishing) return;
    finishing = true;
    history.scrollRestoration = 'manual';
    scrollTo(0, 0);
    update();
    loader.classList.add('done');
    body.classList.remove('is-loading');
    setTimeout(() => loader.remove(), 1200);
  }

  function tick() {
    const timedOut = performance.now() - started > 12000;   // never trap the visitor on the loader
    shown += (Math.max(target(), timedOut ? 1 : 0) - shown) * 0.08;
    pctEl.textContent = Math.round(shown * 100);
    if ((shown > 0.995 && performance.now() - started > 1200) || (timedOut && shown > 0.98)) {
      pctEl.textContent = 100; finish(); return;
    }
    requestAnimationFrame(tick);
  }

  update();
  requestAnimationFrame(tick);
})();