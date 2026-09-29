/* Carmine Granata — scroll-driven video journey
 *
 * How it works
 *  - The hero is a tall section with a sticky 100vh "stage".
 *  - Scroll position inside the hero -> progress (0..1) -> a time in the four
 *    scenes, which play back to back as one continuous shot.
 *  - Each scene is its own full-resolution file (keyframe every 4 frames, see
 *    README), so seeking is quick and each file stays under 15 MB.
 *  - Scene 1 loads first and opens the page; the others load behind it.
 *  - Chapter copy fades in/out by progress ranges declared in the HTML (data-range).
 */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a || 1)); return t * t * (3 - 2 * t); };

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const body     = document.body;
  const hero     = $('[data-hero]');
  const stage    = $('[data-stage]');
  const nav      = $('[data-nav]');
  const navBar   = $('[data-nav-progress]');
  const rail     = $('[data-rail]');
  const railFill = $('[data-rail-fill]');
  const railItems = $$('li', rail);
  const cue      = $('[data-cue]');
  const chapters = $$('[data-chapter]').map(el => ({
    el,
    r: el.dataset.range.split(/\s+/).map(Number),
  }));

  /* ------------------------------------------------------------------ *
   * Scenes: pick the resolution the screen actually needs
   * ------------------------------------------------------------------ */
  const conn = navigator.connection || {};
  const portrait = innerHeight > innerWidth;
  const neededWidth = (portrait ? innerWidth : Math.max(innerWidth, innerHeight * 16 / 9)) * (devicePixelRatio || 1);
  const RES = neededWidth > 1400 && !conn.saveData ? '1080' : '720';

  const scenes = $$('[data-scene]').map((v, i) => ({
    v,
    url: `assets/video/scene-${v.dataset.scene}-${RES}.mp4`,
    dur: +v.dataset.dur,     // replaced by the real duration once loaded
    ready: false,
    progress: 0,
  }));
  let TOTAL = scenes.reduce((a, s) => a + s.dur, 0);

  /* ------------------------------------------------------------------ *
   * Loader
   * ------------------------------------------------------------------ */
  const loaderBar = $('[data-loader-bar]');
  const loaderPct = $('[data-loader-pct]');
  let ready = false;

  function reveal() {
    if (ready) return;
    ready = true;
    body.classList.remove('is-loading');
    measure();
  }

  function setProgress(p) {
    loaderBar.style.transform = `scaleX(${p})`;
    loaderPct.textContent = Math.round(p * 100);
  }

  async function loadScene(s, onProgress) {
    let src = s.url;
    try {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error(res.status);
      const total = +res.headers.get('content-length') || 0;
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        if (total && onProgress) onProgress(got / total);
      }
      // In memory, so scrubbing never waits on the network.
      src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    } catch (err) {
      // file:// or a failed fetch: let the browser read the file directly.
    }
    await new Promise(resolve => {
      const v = s.v;
      const done = () => {
        if (isFinite(v.duration) && v.duration > 0) s.dur = v.duration;
        TOTAL = scenes.reduce((a, x) => a + x.dur, 0);
        s.ready = true;
        resolve();
      };
      v.addEventListener('loadeddata', done, { once: true });
      v.addEventListener('error', () => {
        // Some hosts refuse blob: media URLs; retry with the file itself.
        if (src.startsWith('blob:')) {
          v.addEventListener('error', resolve, { once: true });
          v.src = s.url; v.load();
        } else resolve();
      }, { once: true });
      v.preload = 'auto';
      v.src = src;
      v.load();
    });
  }

  async function loadAll() {
    if (reduceMotion) { reveal(); return; }
    setTimeout(reveal, 12000); // never trap the visitor behind the loader
    await loadScene(scenes[0], setProgress);
    setProgress(1);
    setTimeout(reveal, 300);
    for (const s of scenes.slice(1)) await loadScene(s);
  }

  /* ------------------------------------------------------------------ *
   * Scroll -> scene + time
   * ------------------------------------------------------------------ */
  let heroTop = 0, range = 1, vh = innerHeight;
  let target = 0;        // progress from scroll
  let current = 0;       // smoothed progress
  let lastNow = 0;
  let active = 0;        // index of active chapter for the rail
  let shown = -1;        // index of the scene on screen
  let inHero = true;

  function measure() {
    vh = stage.offsetHeight || innerHeight;
    heroTop = hero.getBoundingClientRect().top + scrollY;
    // The last 60vh of the hero hold on the final frame before the page continues.
    range = Math.max(1, hero.offsetHeight - vh * 1.6);
    readScroll();
  }

  function readScroll() {
    target = clamp((scrollY - heroTop) / range);
    const y = scrollY - heroTop;
    inHero = y > -vh && y < hero.offsetHeight;
  }

  function seek(v, t) {
    if (!v.seeking && Math.abs(v.currentTime - t) > 0.02) v.currentTime = t;
  }

  function updateVideo(p) {
    // Which scene and where inside it.
    let t = p * TOTAL, i = 0;
    while (i < scenes.length - 1 && t >= scenes[i].dur) { t -= scenes[i].dur; i++; }

    // If that scene hasn't arrived yet, hold on the last frame we do have.
    let show = i;
    while (show > 0 && !scenes[show].ready) show--;

    scenes.forEach((s, j) => {
      if (!s.ready) return;
      const end = Math.max(0, s.dur - 0.05);
      if (j === show) seek(s.v, show === i ? clamp(t, 0, end) : end);
      // Park neighbours on their boundary frame so the hand-off is seamless.
      else if (j < show) seek(s.v, end);
      else seek(s.v, 0);
    });

    if (show !== shown) {
      shown = show;
      scenes.forEach((s, j) => s.v.classList.toggle('is-active', j === show));
    }
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000 || 0.016);
    lastNow = now;

    if (!reduceMotion) {
      // Eased follow of the scroll position.
      const k = 1 - Math.exp(-dt * 9);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.00004) current = target;
      updateVideo(current);
      updateChapters(current);
    }

    updateChrome();
    requestAnimationFrame(frame);
  }

  function updateChapters(p) {
    let best = -1, bestV = 0;
    chapters.forEach((c, i) => {
      const [a, b, d, e] = c.r;
      const enter = smooth(a, b, p);
      const exit = smooth(d, e, p);
      const v = enter * (1 - exit);
      const ty = (1 - enter) * 14 - exit * 14;
      c.el.style.opacity = v.toFixed(3);
      c.el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0)`;
      c.el.classList.toggle('is-on', v > 0.01);
      if (v > bestV) { bestV = v; best = i; }
    });
    // Rail: chapters[0] is the intro, so rail item n maps to chapters[n + 1].
    const idx = best - 1;
    if (idx !== active) {
      active = idx;
      railItems.forEach((li, i) => li.classList.toggle('is-active', i === idx));
    }
    cue.style.opacity = (1 - smooth(0, 0.04, p)).toFixed(3);
  }

  function updateChrome() {
    nav.classList.toggle('is-solid', scrollY - heroTop > hero.offsetHeight - vh * 1.2);
    // The intro already shows the full logo; the nav crest takes over once it fades.
    nav.classList.toggle('is-intro', !reduceMotion && current < 0.07 && inHero);
    rail.classList.toggle('is-hidden', !(inHero && target < 0.985 && ready));
    railFill.style.setProperty('--p', current.toFixed(4));
    const doc = document.documentElement;
    navBar.style.transform = `scaleX(${clamp(scrollY / (doc.scrollHeight - innerHeight || 1)).toFixed(4)})`;
  }

  // Rail / anchors: jump to a chapter's progress.
  $$('[data-goto]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    const p = parseFloat(a.dataset.goto);
    scrollTo({ top: heroTop + p * range, behavior: reduceMotion ? 'auto' : 'smooth' });
  }));

  /* ------------------------------------------------------------------ *
   * Post-hero: reveals + word-by-word manifesto
   * ------------------------------------------------------------------ */
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]').forEach(el => io.observe(el));

  const words = $('[data-words]');
  let wordEls = [];
  if (words) {
    wordEls = words.textContent.trim().split(/\s+/).map(w => {
      const s = document.createElement('span');
      s.className = 'w'; s.textContent = w + ' ';
      return s;
    });
    words.textContent = '';
    words.append(...wordEls);
    words.setAttribute('aria-label', wordEls.map(s => s.textContent.trim()).join(' '));
  }
  const manifesto = $('[data-manifesto]');
  function updateWords() {
    if (!words || reduceMotion) return;
    const r = manifesto.getBoundingClientRect();
    const p = clamp((innerHeight * 0.85 - r.top) / (r.height * 0.9 + innerHeight * 0.1));
    const n = Math.round(p * wordEls.length * 1.15);
    wordEls.forEach((s, i) => s.classList.toggle('lit', i < n));
  }

  /* ------------------------------------------------------------------ */
  addEventListener('scroll', () => { readScroll(); updateWords(); }, { passive: true });
  addEventListener('resize', measure);
  addEventListener('orientationchange', () => setTimeout(measure, 250));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  // Start at the top on reload so the story always begins at the beginning.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  scrollTo(0, 0);

  measure();
  requestAnimationFrame(frame);
  updateWords();
  loadAll();
})();
