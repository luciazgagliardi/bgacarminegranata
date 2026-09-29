/* Carmine Granata — scroll-driven video journey
 *
 * How it works
 *  - The hero is a tall section with a sticky 100vh "stage".
 *  - Scroll position inside the hero -> progress (0..1) -> video.currentTime.
 *  - The video is encoded with every frame as a keyframe (see README), so seeking
 *    to any timestamp is instant and scrubbing is smooth in both directions.
 *  - The whole file is downloaded into a Blob first, so seeks never wait on the network.
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
  const video    = $('[data-video]');
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
   * Loader + video source
   * ------------------------------------------------------------------ */
  const loader    = $('[data-loader]');
  const loaderBar = $('[data-loader-bar]');
  const loaderPct = $('[data-loader-pct]');

  const conn = navigator.connection || {};
  const small = matchMedia('(max-width: 820px)').matches || conn.saveData || /(^|-)(2g|3g)$/.test(conn.effectiveType || '');
  const SRC = small ? 'assets/video/journey-854.mp4' : 'assets/video/journey-1280.mp4';

  let ready = false;

  function reveal() {
    if (ready) return;
    ready = true;
    body.classList.remove('is-loading');
    measure();
    forceSeek = true;
  }

  function setProgress(p) {
    const pct = Math.round(p * 100);
    loaderBar.style.transform = `scaleX(${p})`;
    loaderPct.textContent = pct;
  }

  async function loadVideo() {
    if (reduceMotion) { reveal(); return; }
    try {
      const res = await fetch(SRC);
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
        if (total) setProgress(got / total);
      }
      video.src = URL.createObjectURL(new Blob(chunks, { type: 'video/mp4' }));
    } catch (err) {
      // Fallback: let the browser stream it directly.
      video.src = SRC;
    }
    setProgress(1);
    if (video.readyState >= 2) return finish();
    video.addEventListener('loadeddata', finish, { once: true });
    video.addEventListener('error', () => {
      // Some hosts refuse blob: media URLs; retry with the direct file.
      if (video.src.startsWith('blob:')) {
        video.addEventListener('error', reveal, { once: true });
        video.src = SRC;
        video.load();
      } else reveal();
    }, { once: true });
    video.load();
    setTimeout(reveal, 8000); // never trap the visitor behind the loader

    function finish() {
      // Nudge to first frame so the poster hands off cleanly.
      video.currentTime = 0;
      setTimeout(reveal, 350);
    }
  }

  /* ------------------------------------------------------------------ *
   * Scroll -> video
   * ------------------------------------------------------------------ */
  let heroTop = 0, range = 1, vh = innerHeight;
  let target = 0;        // progress from scroll
  let current = 0;       // smoothed progress
  let lastT = 0;         // last currentTime we asked for
  let lastNow = 0;
  let active = 0;        // index of active chapter for the rail
  let inHero = true;
  let forceSeek = false;

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

  function frame(now) {
    const dt = Math.min(0.1, (now - lastNow) / 1000 || 0.016);
    lastNow = now;

    if (!reduceMotion) {
      // Critically damped-ish follow: eased but never laggy.
      const k = 1 - Math.exp(-dt * 10);
      current += (target - current) * k;
      if (Math.abs(target - current) < 0.00004) current = target;

      const dur = video.duration;
      if (dur && isFinite(dur)) {
        const t = clamp(current * dur, 0, dur - 0.04);
        // Only re-seek when we've moved at least ~half a frame and no seek is mid-flight.
        if ((forceSeek || Math.abs(t - lastT) > 0.02) && !video.seeking) {
          video.currentTime = t;
          lastT = t;
          forceSeek = false;
        }
      }
      stage.style.setProperty('--zoom', (1.02 + current * 0.05).toFixed(4));
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
      const el = c.el;
      const ty = (1 - enter) * 34 - exit * 34;
      el.style.opacity = v.toFixed(3);
      el.style.transform = `translate3d(0, ${ty.toFixed(1)}px, 0)`;
      el.style.filter = v < 0.98 ? `blur(${((1 - v) * 7).toFixed(1)}px)` : '';
      el.classList.toggle('is-on', v > 0.01);
      if (v > bestV) { bestV = v; best = i; }
    });
    // Rail: chapters[0] is the intro, so rail item n maps to chapters[n + 1].
    const idx = best - 1;
    if (idx !== active) {
      active = idx;
      railItems.forEach((li, i) => li.classList.toggle('is-active', i === idx));
    }
    cue.style.opacity = (1 - smooth(0, 0.04, p)).toFixed(3);
    stage.style.setProperty('--grade', (0.75 + 0.25 * Math.sin(p * Math.PI * 3) ** 2).toFixed(3));
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
  loadVideo();
})();
