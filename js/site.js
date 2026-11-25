// Page behaviour: today's date, reveal-on-scroll, "weave a new cloth" button.
(function () {
  // current date, formatted for the credits
  const t = document.getElementById('today');
  if (t) {
    const d = new Date();
    t.textContent = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    t.setAttribute('datetime', d.toISOString().slice(0, 10));
  }

  // "Weave a new silk" repaints only the artwork (sketch.js: rbWeaveNew), the page is not reloaded
  const weaveBtns = Array.from(document.querySelectorAll('.weave-btn'));
  const setWeaving = on => weaveBtns.forEach(b => {
    if (on) { b.dataset.label = b.textContent; b.textContent = 'Weaving\u2026'; } else if (b.dataset.label) { b.textContent = b.dataset.label; }
    b.disabled = on;
  });
  const weave = () => {
    if (typeof window.rbWeaveNew !== 'function') { location.reload(); return; }   // fallback if the sketch is not running
    if (!window.rbWeaveNew()) { return; }                                          // ignored while a painting is still being built
    setWeaving(true);
    const art = document.getElementById('art');
    if (art) { art.scrollIntoView({ behavior: 'smooth', block: 'start' }); }       // the button in the credits also takes you to the art
  };
  weaveBtns.forEach(b => b.addEventListener('click', weave));
  window.addEventListener('art:ready', () => setWeaving(false));

  // gentle fade-up for content blocks
  const items = document.querySelectorAll('.rv');
  if (!('IntersectionObserver' in window)) { items.forEach(e => e.classList.add('in')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.12 });
  items.forEach(e => io.observe(e));

  const ridge = document.querySelector('.ridge');
  if (ridge) io.observe(ridge);
})();