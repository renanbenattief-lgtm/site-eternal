/* =========================================================================
   ETERNAL — página do escritório
   Entrada: a luz ciano desenha o corredor (traços tirados da foto real), as fitas
   de LED acendem e o escritório acende. A rolagem caminha pelo corredor (vídeo do
   Higgsfield feito a partir da foto) e entra em cada sala (vídeos reais).
   ========================================================================= */
(function () {
  'use strict';

  const html = document.documentElement;
  const body = document.body;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced || !hasGSAP) html.classList.add('reduced');
  const reduced = html.classList.contains('reduced');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  // celular / tela em pé: versões verticais (mesma regra do CSS: max-aspect-ratio 10/11 ou < 700px)
  const portrait = window.innerHeight > window.innerWidth * 1.1 || window.innerWidth < 700;
  const stacked = () => window.innerWidth <= 900 || window.innerHeight > window.innerWidth * 1.1;
  const K = portrait ? 'm' : 'd';
  let sfx = () => {}; // efeitos sonoros (definidos mais abaixo, junto com o som ambiente)

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ---------------------------------------------------------------------
     Vídeos guiados pela rolagem: baixados inteiros (blob) para buscar o
     quadro certo na hora
     --------------------------------------------------------------------- */
  async function fetchBlob(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = +res.headers.get('content-length') || 0;
    if (!res.body || !total) {
      const b = await res.blob();
      if (onProgress) onProgress(1);
      return b;
    }
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (onProgress) onProgress(got / total);
    }
    return new Blob(chunks, { type: 'video/mp4' });
  }

  function makeScene(v, url) {
    return { v, url, dur: 6, target: 0, ready: false, loading: null };
  }
  function loadScene(s, onProgress) {
    if (s.loading) return s.loading;
    const v = s.v;
    s.loading = new Promise((resolve) => {
      const attach = (src) => {
        v.preload = 'auto';
        v.muted = true;
        v.src = src;
        const done = () => {
          s.dur = v.duration && isFinite(v.duration) ? v.duration : 6;
          s.ready = true;
          // iOS: tocar e pausar "destrava" a decodificação de quadros
          const p = v.play();
          const settle = () => { v.pause(); seek(s, s.target, true); v.classList.add('is-ready'); resolve(s); };
          if (p && p.then) p.then(settle).catch(settle);
          else settle();
        };
        v.addEventListener('loadeddata', done, { once: true });
        v.addEventListener('error', () => {
          v.removeEventListener('loadeddata', done);
          if (src !== s.url) attach(s.url); // blob recusado: usa o arquivo direto
          else resolve(s);
        }, { once: true });
        v.load();
      };
      fetchBlob(s.url, onProgress)
        .then((blob) => attach(URL.createObjectURL(blob)))
        .catch(() => { if (onProgress) onProgress(1); attach(s.url); });
    });
    return s.loading;
  }
  function seek(s, t, force) {
    if (!s.ready) return;
    const v = s.v;
    if (!force && v.seeking) return;
    const goal = clamp(t, 0, 1) * Math.max(0, s.dur - 0.05);
    if (!force && Math.abs(goal - v.currentTime) < 0.012) return;
    try {
      if (v.fastSeek && !force) v.fastSeek(goal);
      else v.currentTime = goal;
    } catch (e) { /* ignora */ }
  }
  const scenes = [];

  /* ---------------------------------------------------------------------
     Entrada: traços de luz (canvas) desenham o corredor
     --------------------------------------------------------------------- */
  const heroStage = $('#heroStage');
  const heroPhoto = $('#heroPhoto');
  const heroWalk = $('#heroWalk');
  const heroDark = $('#heroDark');
  const heroLeds = $('#heroLeds');
  const linesCv = $('#heroLines');
  const heroCopy = $('#heroCopy');
  const heroShade = $('.o-hero__shade');
  const heroCue = $('#heroCue');
  const lightSwitch = $('#lightSwitch');

  const Lines = {
    W: 1600, H: 900, polys: [], total: 2.6, ready: false, ctx: null, map: null, sprite: null,
    t: 0, running: false, raf: 0,
    prep(json) {
      this.W = json.w; this.H = json.h;
      const dmax = json.lines.reduce((m, l) => Math.max(m, l.d), 0.0001);
      // pseudo-aleatório estável (o desenho sai igual sempre)
      const rnd = (i) => { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
      this.polys = json.lines.map((ln, i) => {
        const pts = [];
        for (let k = 0; k < ln.p.length; k += 2) pts.push([ln.p[k] * this.W, ln.p[k + 1] * this.H]);
        const cum = [0];
        for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
        const len = cum[cum.length - 1];
        const start = 0.05 + Math.pow(ln.d / dmax, 0.8) * 1.3 + rnd(i) * 0.22;
        const dur = clamp(len / (this.W * 0.62), 0.22, 0.8);
        return { pts, cum, len, start, dur };
      });
      this.total = this.polys.reduce((m, p) => Math.max(m, p.start + p.dur), 0);
      // brilho da ponta do traço
      const S = 64;
      const sp = document.createElement('canvas');
      sp.width = sp.height = S;
      const g = sp.getContext('2d');
      const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.12, 'rgba(210,254,255,0.95)');
      grd.addColorStop(0.35, 'rgba(9,239,241,0.45)');
      grd.addColorStop(1, 'rgba(9,239,241,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
      this.sprite = sp;
      this.ctx = linesCv.getContext('2d');
      this.ready = true;
      this.size();
    },
    size() {
      if (!this.ready) return;
      const r = heroStage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      linesCv.width = Math.max(1, Math.round(r.width * dpr));
      linesCv.height = Math.max(1, Math.round(r.height * dpr));
      const s = Math.max(r.width / this.W, r.height / this.H); // mesmo "cover" da foto
      this.map = { s: s * dpr, ox: (r.width - this.W * s) / 2 * dpr, oy: (r.height - this.H * s) / 2 * dpr, dpr };
      this.draw(this.t);
    },
    draw(t) {
      if (!this.ready) return;
      this.t = t;
      const ctx = this.ctx;
      const m = this.map;
      ctx.clearRect(0, 0, linesCv.width, linesCv.height);
      const path = new Path2D();
      const heads = [];
      const X = (x) => m.ox + x * m.s;
      const Y = (y) => m.oy + y * m.s;
      for (const p of this.polys) {
        const f = clamp((t - p.start) / p.dur);
        if (f <= 0) continue;
        const goal = p.len * (1 - (1 - f) * (1 - f));
        path.moveTo(X(p.pts[0][0]), Y(p.pts[0][1]));
        for (let k = 1; k < p.pts.length; k++) {
          if (p.cum[k] <= goal) { path.lineTo(X(p.pts[k][0]), Y(p.pts[k][1])); continue; }
          const seg = p.cum[k] - p.cum[k - 1] || 1;
          const u = (goal - p.cum[k - 1]) / seg;
          const hx = X(p.pts[k - 1][0] + (p.pts[k][0] - p.pts[k - 1][0]) * u);
          const hy = Y(p.pts[k - 1][1] + (p.pts[k][1] - p.pts[k - 1][1]) * u);
          path.lineTo(hx, hy);
          heads.push(hx, hy);
          break;
        }
      }
      const d = m.dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(9,239,241,0.13)'; ctx.lineWidth = 7 * d; ctx.stroke(path);
      ctx.strokeStyle = 'rgba(9,239,241,0.32)'; ctx.lineWidth = 2.8 * d; ctx.stroke(path);
      ctx.strokeStyle = 'rgba(205,253,254,0.95)'; ctx.lineWidth = 1.1 * d; ctx.stroke(path);
      if (heads.length) {
        ctx.globalCompositeOperation = 'lighter';
        const S = 30 * d;
        for (let i = 0; i < heads.length; i += 2) ctx.drawImage(this.sprite, heads[i] - S / 2, heads[i + 1] - S / 2, S, S);
        ctx.globalCompositeOperation = 'source-over';
      }
    },
    play(from) {
      if (!this.ready) return;
      cancelAnimationFrame(this.raf);
      const t0 = performance.now() - (from || 0) * 1000;
      this.running = true;
      const tick = (now) => {
        const t = (now - t0) / 1000;
        this.draw(t);
        if (t < this.total + 0.05) this.raf = requestAnimationFrame(tick);
        else this.running = false;
      };
      this.raf = requestAnimationFrame(tick);
    },
    full() { cancelAnimationFrame(this.raf); this.running = false; this.draw(this.total + 1); },
  };

  const linesReady = fetch('assets/office/lines-' + K + '.json')
    .then((r) => r.json())
    .then((j) => Lines.prep(j))
    .catch(() => { /* sem traços: as luzes acendem direto */ });

  /* ---------------------------------------------------------------------
     Carregamento
     --------------------------------------------------------------------- */
  const loader = $('#loader');
  const loaderCount = $('#loaderCount');
  const ldClip = $('#ldClipRect');
  const ldFront = $('#ldFront');
  const ldHot = $('#ldHotRect');
  const paintLoader = (p) => {
    const x = -12 + 1364 * p;
    if (ldClip) ldClip.setAttribute('width', Math.max(0, x + 20).toFixed(1));
    if (ldFront) ldFront.setAttribute('x', (x - 1.5).toFixed(1));
    if (ldHot) ldHot.setAttribute('x', (x - 170).toFixed(1));
    loaderCount.textContent = String(Math.round(p * 100)).padStart(3, '0');
  };
  const load = { fonts: 0, img: 0, lines: 0, video: 0 };
  const loadTarget = () => load.fonts * 0.12 + load.img * 0.23 + load.lines * 0.1 + load.video * 0.55;
  let shown = 0;
  let loaderDone = false;
  const t0 = performance.now();
  function loaderTick() {
    if (loaderDone) return;
    const target = loadTarget();
    shown += (target - shown) * 0.08 + 0.0015;
    shown = Math.min(shown, target);
    paintLoader(shown);
    if (shown >= 0.999 && performance.now() - t0 > 1000) {
      loaderDone = true;
      paintLoader(1);
      loader.classList.add('is-full');
      setTimeout(finishLoading, reduced ? 0 : 520);
    } else requestAnimationFrame(loaderTick);
  }
  const imgReady = (img) => new Promise((ok) => {
    if (!img || (img.complete && img.naturalWidth)) return ok();
    img.addEventListener('load', ok, { once: true });
    img.addEventListener('error', ok, { once: true });
  });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (load.fonts = 1));
  Promise.all([imgReady(heroPhoto), imgReady(heroLeds)]).then(() => (load.img = 1));
  linesReady.then(() => (load.lines = 1));
  const walk = makeScene(heroWalk, heroWalk.dataset.src + '-' + K + '.mp4');
  scenes.push(walk);
  if (reduced) load.video = 1;
  else loadScene(walk, (p) => (load.video = Math.max(load.video, p * 0.95))).then(() => (load.video = 1));
  setTimeout(() => { load.fonts = load.img = load.lines = load.video = 1; }, 8000); // nunca prender ninguém
  requestAnimationFrame(loaderTick);

  function finishLoading() {
    loaderDone = true;
    paintLoader(1);
    loader.classList.add('is-done');
    body.classList.remove('is-loading');
    window.scrollTo(0, 0);
    if (lenis) lenis.start();
    if (hasGSAP) ScrollTrigger.refresh();
    intro();
    // as salas carregam em sequência, sem pesar a entrada
    if (!reduced) rooms.reduce((p, r) => p.then(() => loadScene(r.scene)), Promise.resolve());
  }

  /* ---------------------------------------------------------------------
     Rolagem suave
     --------------------------------------------------------------------- */
  let lenis = null;
  if (!reduced && window.Lenis) {
    lenis = new window.Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.3,
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
    window.__lenis = lenis;
  }

  /* ---------------------------------------------------------------------
     Luzes da entrada: apagado → traços → LEDs piscam → escritório acende
     --------------------------------------------------------------------- */
  const H = { lit: false, bloom: 0.5, p: 0, copy: 0, tl: null };
  window.__office = H;

  function setCopy(on, instant) {
    const parts = $$(':scope > *', heroCopy);
    if (reduced || instant) {
      parts.forEach((el) => { el.style.opacity = on ? '1' : '0'; el.style.transform = 'none'; });
      heroShade.style.opacity = on ? '1' : '0';
      heroCue.style.opacity = on ? '1' : '0';
      return;
    }
    if (on) {
      gsap.fromTo(parts, { opacity: 0, y: 34 }, { opacity: 1, y: 0, duration: 1.3, stagger: 0.12, ease: 'expo.out', overwrite: true });
      gsap.to(heroShade, { opacity: 1, duration: 1.4, ease: 'power2.out', overwrite: true });
      gsap.to(heroCue, { opacity: 1, duration: 1, delay: 0.9, overwrite: true });
      const k = $('.o-kicker', heroCopy);
      if (k) setTimeout(() => scramble(k), 150);
    }
  }

  function setSwitch(on) {
    lightSwitch.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('.o-switch__label', lightSwitch).textContent = on ? 'Apagar as luzes' : 'Acender as luzes';
  }

  // as fitas de LED acendem piscando, depois o escritório inteiro
  function lightsOn(first) {
    if (H.tl) H.tl.kill();
    H.lit = true;
    setSwitch(true);
    if (reduced) { heroDark.style.opacity = '0'; linesCv.style.opacity = '0'; heroLeds.style.opacity = '0'; return; }
    const tl = gsap.timeline();
    H.tl = tl;
    const at = first ? Math.min(2.0, Lines.ready ? Lines.total * 0.78 : 0.2) : 0.05;
    tl.call(() => sfx('lights'), null, at)
      .to(heroLeds, { keyframes: [
        { opacity: 0.95, duration: 0.05 }, { opacity: 0.12, duration: 0.07 }, { opacity: 1, duration: 0.05 },
        { opacity: 0.3, duration: 0.09 }, { opacity: 1, duration: 0.07 },
      ], ease: 'none' }, at)
      .to(heroDark, { opacity: 0.62, duration: 0.2, ease: 'power1.out' }, at + 0.05)
      .to(heroDark, { opacity: 0, duration: 1.5, ease: 'power2.out' }, at + 0.5)
      .to(linesCv, { opacity: 0, duration: 1.6, ease: 'power1.inOut' }, at + 0.6)
      .to(H, { bloom: 0.5, duration: 1.4, ease: 'power1.out' }, at + 0.6)
      .to(heroLeds, { opacity: 0.5, duration: 1.4, ease: 'power1.out' }, at + 0.6);
    if (first) tl.call(() => { setCopy(true); lightSwitch.classList.add('is-shown'); gsap.to(lightSwitch, { opacity: 1, duration: 1, delay: 0.6 }); }, null, at + 0.75);
  }
  function lightsOff() {
    if (H.tl) H.tl.kill();
    H.lit = false;
    setSwitch(false);
    sfx('click');
    // no escuro, a luz ciano redesenha o escritório
    if (Lines.ready) Lines.play(Lines.total * 0.35);
    const tl = gsap.timeline();
    H.tl = tl;
    tl.to(heroDark, { opacity: 0.95, duration: 0.18, ease: 'power2.out' }, 0)
      .to(heroLeds, { opacity: 1, duration: 0.18 }, 0)
      .to(linesCv, { opacity: 0.9, duration: 0.5, ease: 'power2.out' }, 0.1);
  }

  function intro() {
    if (reduced) {
      header.classList.add('show-brand');
      heroDark.style.opacity = '0'; linesCv.style.opacity = '0';
      setCopy(true, true);
      return;
    }
    linesReady.then(() => {
      // se a pessoa já desceu antes de tudo começar, só acende
      if (H.p > 0.02) { linesCv.style.opacity = '0'; lightsOn(false); setCopy(true, true); return; }
      if (Lines.ready) Lines.play(0);
      lightsOn(true);
    });
    gsap.from('.site-header .nav', { opacity: 0, y: -10, duration: 1.2, delay: 1.6, ease: 'expo.out' });
    // a logo do topo entra pela transição do CSS (a mesma do site principal)
    setTimeout(() => header.classList.add('show-brand'), 1700);
  }

  lightSwitch.addEventListener('click', () => {
    if (H.p > 0.03) return;
    if (H.lit) lightsOff(); else lightsOn(false);
  });

  /* ---------------------------------------------------------------------
     Caminhada pelo corredor (presa à rolagem)
     --------------------------------------------------------------------- */
  const beats = $$('.o-beat', heroStage).map((el) => ({ el, k: el.dataset.beat.split(',').map(Number), t: $('.o-beat__t', el) }));
  function beatAlpha(p, k) {
    if (p < k[0] || p > k[3]) return 0;
    if (p < k[1]) return smooth((p - k[0]) / (k[1] - k[0] || 1));
    if (p > k[2]) return 1 - smooth((p - k[2]) / (k[3] - k[2] || 1));
    return 1;
  }
  let walkShown = false;
  function applyHero() {
    const p = H.p;
    // a foto vira o 1º quadro do vídeo (idênticos), e o vídeo anda com a rolagem
    walk.target = clamp((p - 0.02) / 0.84);
    const showWalk = walk.ready && p > 0.004;
    if (showWalk !== walkShown) {
      walkShown = showWalk;
      heroWalk.style.opacity = showWalk ? '1' : '0';
      heroPhoto.style.visibility = showWalk && p > 0.05 ? 'hidden' : 'visible';
    }
    if (showWalk) heroPhoto.style.visibility = p > 0.05 ? 'hidden' : 'visible';
    // o brilho extra dos LEDs some quando a câmera começa a andar (eles mudam de lugar)
    if (H.lit && !(H.tl && H.tl.isActive())) heroLeds.style.opacity = (H.bloom * (1 - smooth(clamp(p / 0.03)))).toFixed(3);
    // textos da entrada
    const c = 1 - smooth(clamp((p - 0.005) / 0.1));
    heroCopy.style.transform = 'translate3d(0,' + ((1 - c) * -50).toFixed(1) + 'px,0)';
    heroCopy.style.opacity = c.toFixed(3);
    heroCopy.style.visibility = c > 0.001 ? 'visible' : 'hidden';
    const cue = 1 - smooth(clamp(p / 0.03));
    heroCue.style.visibility = cue > 0.001 ? 'visible' : 'hidden';
    lightSwitch.style.visibility = cue > 0.001 ? 'visible' : 'hidden';
    if (H.lit) heroShade.style.opacity = Math.max(0.0, c).toFixed(3);
    // frases da caminhada, com o vídeo escurecendo por trás para dar leitura
    let dim = 0;
    beats.forEach((b) => {
      const a = beatAlpha(p, b.k);
      b.el.style.opacity = a.toFixed(3);
      b.el.style.visibility = a > 0.001 ? 'visible' : 'hidden';
      const entering = p < (b.k[1] + b.k[2]) / 2;
      b.t.style.transform = 'translate3d(0,' + ((1 - a) * 36 * (entering ? 1 : -1)).toFixed(1) + 'px,0) scale(' + (1 + (1 - a) * 0.04 * (entering ? -1 : 1)).toFixed(3) + ')';
      dim = Math.max(dim, a * 0.5);
    });
    // no fim do corredor, escurece para entrar na primeira sala
    dim = Math.max(dim, smooth(clamp((p - 0.86) / 0.13)) * 0.97);
    if (H.lit && !(H.tl && H.tl.isActive())) heroDark.style.opacity = dim.toFixed(3);
    else if (H.lit && p > 0.01) { H.tl.progress(1); heroDark.style.opacity = dim.toFixed(3); }
    if (p > 0.03 && !H.lit) lightsOn(false); // desceu com a luz apagada: acende
  }

  /* ---------------------------------------------------------------------
     Salas: cada uma acende quando chega e a rolagem entra nela
     --------------------------------------------------------------------- */
  const rooms = $$('.o-room').map((el) => {
    const v = $('.o-pane__video', el);
    return {
      el,
      stage: $('.o-room__stage', el),
      scene: makeScene(v, v.dataset.src),
      dark: $('.o-pane__dark', el),
      leds: $('.o-pane__leds', el),
      glass: $('.o-pane__glass', el),
      still: $('.o-still', el),
      num: $('.o-room__num', el),
      head: $$('.o-room__label, .statement .line', el),
      body: $$('.o-room__copy .lead, .o-tags', el),
      lit: false,
      tl: null,
      q: 0,
    };
  });
  rooms.forEach((r) => {
    scenes.push(r.scene);
    r.stage.style.setProperty('--spill', '0');
    r.stage.style.setProperty('--glow', '0');
  });

  function roomLightsOn(r) {
    r.lit = true;
    r.el.classList.add('is-lit');
    if (r.tl) r.tl.kill();
    sfx('lights', 0.55);
    const tl = gsap.timeline();
    r.tl = tl;
    tl.to(r.leds, { keyframes: [
      { opacity: 0.95, duration: 0.05 }, { opacity: 0.15, duration: 0.07 }, { opacity: 1, duration: 0.05 },
      { opacity: 0.35, duration: 0.08 }, { opacity: 1, duration: 0.07 },
    ], ease: 'none' }, 0.05)
      .to(r.dark, { opacity: 0.6, duration: 0.2 }, 0.1)
      .to(r.dark, { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0.45)
      .to(r.leds, { opacity: 0, duration: 1.0, ease: 'power1.in' }, 0.75)
      .to(r.stage, { '--spill': 0.32, '--glow': 1, duration: 1.4, ease: 'power2.out' }, 0.4);
  }
  function roomLightsOff(r) {
    r.lit = false;
    r.el.classList.remove('is-lit');
    if (r.tl) r.tl.kill();
    r.tl = gsap.timeline();
    r.tl.to(r.dark, { opacity: 1, duration: 0.35 }, 0).to(r.leds, { opacity: 0, duration: 0.2 }, 0)
      .to(r.stage, { '--spill': 0, '--glow': 0, duration: 0.4 }, 0);
  }

  function updateRoom(r, q) {
    r.q = q;
    // acende ao chegar; apaga se a pessoa voltar para trás
    if (q > 0.012 && !r.lit) roomLightsOn(r);
    else if (q <= 0.002 && r.lit) roomLightsOff(r);
    r.scene.target = clamp((q - 0.07) / 0.85);
    if (r.lit && r.scene.target > 0.02 && r.leds.style.opacity !== '0' && !(r.tl && r.tl.isActive())) r.leds.style.opacity = '0';
    // textos: título primeiro, depois o resto
    const isStacked = stacked();
    const kHead = [0.0, 0.07, 0.86, 0.97];
    const kBody = isStacked ? [0.03, 0.11, 0.5, 0.6] : [0.03, 0.11, 0.86, 0.97];
    const show = (els, k, base) => els.forEach((el, i) => {
      const a = beatAlpha(q, [k[0] + i * 0.012, k[1] + i * 0.012, k[2], k[3]]);
      const entering = q < (k[1] + k[2]) / 2;
      el.style.opacity = a.toFixed(3);
      el.style.transform = 'translate3d(0,' + ((1 - a) * (base + i * 10) * (entering ? 1 : -1)).toFixed(1) + 'px,0)';
    });
    show(r.head, kHead, 34);
    show(r.body, kBody, 26);
    // reflexo no vidro passa conforme a câmera se aproxima
    if (r.glass) r.glass.style.setProperty('--g', (-45 + 70 * smooth(clamp(q / 0.5))).toFixed(1) + '%');
    // profundidade: número grande e a foto solta andam em velocidades diferentes
    if (!isStacked) {
      if (r.num) r.num.style.transform = 'translate3d(0,' + (10 - 20 * q).toFixed(2) + 'vh,0)';
      if (r.still) {
        const a = beatAlpha(q, [0.06, 0.2, 0.84, 0.97]);
        r.still.style.opacity = a.toFixed(3);
        r.still.style.transform = 'translate3d(0,' + (90 - 180 * q).toFixed(1) + 'px,0) rotate(' + (-3 + 4 * q).toFixed(2) + 'deg)';
      }
    }
  }

  /* ---------------------------------------------------------------------
     Galeria: fotos em profundidade, presas à rolagem na horizontal
     --------------------------------------------------------------------- */
  const gStage = $('.o-gallery__stage');
  const track = $('#galleryTrack');
  const cards = $$('.o-card', track);
  const gBar = $('#galleryBar');
  const G = { maxX: 0, base: [], w: 0, x: 0 };
  function measureGallery() {
    track.style.transform = 'none';
    cards.forEach((c) => { c.style.transform = 'none'; });
    const tr = track.getBoundingClientRect();
    G.base = cards.map((c) => { const r = c.getBoundingClientRect(); return r.left - tr.left + r.width / 2; });
    G.w = cards[0] ? cards[0].getBoundingClientRect().width : 300;
    G.maxX = Math.max(0, track.scrollWidth - window.innerWidth);
  }
  function updateGallery(p) {
    const x = -G.maxX * p;
    G.x = x;
    track.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
    if (gBar) gBar.style.setProperty('--p', p.toFixed(4));
    const vw = window.innerWidth;
    const cx = vw / 2;
    cards.forEach((c, i) => {
      const center = G.base[i] + x;
      const d = clamp((center - cx) / (vw * 0.62), -1.4, 1.4);
      const ad = Math.abs(d);
      c.style.transform = 'rotateY(' + (-d * 26).toFixed(2) + 'deg) translateZ(' + (-ad * 140).toFixed(1) + 'px)';
      c.style.setProperty('--cb', (1.02 - Math.min(0.5, ad * 0.42)).toFixed(3));
      c.style.setProperty('--sweep', (clamp(-d / 0.55, -1, 1) * 70).toFixed(1) + '%');
    });
  }

  /* ---------------------------------------------------------------------
     Cenas presas (GSAP ScrollTrigger)
     --------------------------------------------------------------------- */
  const HERO_LEN = portrait ? 2.7 : 2.4;
  const ROOM_LEN = portrait ? 2.3 : 2.5;
  if (!reduced) {
    ScrollTrigger.create({
      trigger: heroStage, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * HERO_LEN),
      pin: true, anticipatePin: 1,
      onUpdate: (self) => { H.p = self.progress; applyHero(); },
      onRefresh: (self) => { H.p = self.progress; applyHero(); },
    });
    rooms.forEach((r) => {
      ScrollTrigger.create({
        trigger: r.stage, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * ROOM_LEN),
        pin: true, anticipatePin: 1,
        onUpdate: (self) => updateRoom(r, self.progress),
        onRefresh: (self) => updateRoom(r, self.progress),
        onEnter: () => loadScene(r.scene),
        onEnterBack: () => loadScene(r.scene),
      });
      updateRoom(r, 0);
      // começa a baixar um pouco antes de chegar
      ScrollTrigger.create({ trigger: r.el, start: 'top 250%', once: true, onEnter: () => loadScene(r.scene) });
    });
    measureGallery();
    ScrollTrigger.create({
      trigger: gStage, start: 'top top', end: () => '+=' + Math.round(Math.max(window.innerHeight * 0.9, G.maxX * 1.05)),
      pin: true, anticipatePin: 1,
      onUpdate: (self) => updateGallery(self.progress),
      onRefresh: (self) => { measureGallery(); updateGallery(self.progress); },
    });
    updateGallery(0);
    ScrollTrigger.addEventListener('refreshInit', () => { track.style.transform = 'none'; });
    // cada vídeo busca o quadro certo a cada frame (só quando mudou)
    gsap.ticker.add(() => scenes.forEach((s) => s.ready && seek(s, s.target)));

    // visita: a luz da foto acende quando a seção chega
    const visit = $('#visita');
    ScrollTrigger.create({
      trigger: visit, start: 'top 55%',
      onEnter: () => { visit.classList.add('is-lit'); sfx('lights', 0.45); },
      onLeaveBack: () => visit.classList.remove('is-lit'),
    });
    gsap.from('.o-visit__inner > *', {
      y: 46, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.12,
      scrollTrigger: { trigger: visit, start: 'top 62%' },
    });
    gsap.from('.o-gallery__head > *', {
      y: 40, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.1,
      scrollTrigger: { trigger: gStage, start: 'top 75%' },
    });
    const gLabel = $('.o-gallery__head .label');
    ScrollTrigger.create({ trigger: gStage, start: 'top 75%', onEnter: () => gLabel && scramble(gLabel) });
    const vLabel = $('.o-visit__inner .label');
    ScrollTrigger.create({ trigger: visit, start: 'top 62%', onEnter: () => vLabel && scramble(vLabel) });
    $$('.o-room__label').forEach((l) => {
      ScrollTrigger.create({ trigger: l.closest('.o-room'), start: 'top top', onEnter: () => scramble(l) });
    });
  } else {
    heroDark.style.opacity = '0';
    $('#visita').classList.add('is-lit');
    rooms.forEach((r) => { r.el.classList.add('is-lit'); });
  }

  window.addEventListener('resize', () => { Lines.size(); });

  /* ---------------------------------------------------------------------
     Rótulos: as letras se decodificam quando entram em cena
     --------------------------------------------------------------------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>_';
  function scramble(el) {
    if (el.__busy || reduced) return;
    const node = Array.from(el.childNodes).reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!node) return;
    const final = el.__final || (el.__final = node.textContent);
    el.__busy = true;
    const start = performance.now();
    const dur = 700;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const reveal = Math.floor(t * final.length);
      let out = '';
      for (let i = 0; i < final.length; i++) {
        const ch = final[i];
        out += i < reveal || /\s/.test(ch) ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      node.textContent = out;
      if (t < 1) requestAnimationFrame(tick);
      else { node.textContent = final; el.__busy = false; }
    };
    requestAnimationFrame(tick);
  }

  /* ---------------------------------------------------------------------
     Foto em tela cheia (galeria)
     --------------------------------------------------------------------- */
  const lb = $('#lightbox');
  const lbImg = $('#lbImg');
  const lbCount = $('#lbCount');
  const lbText = $('#lbText');
  const lbClose = $('#lbClose');
  const lbPrev = $('#lbPrev');
  const lbNext = $('#lbNext');
  const items = cards.map((c) => ({
    src: c.dataset.full,
    alt: $('img', c).alt,
    label: $('.o-card__cap', c).textContent.replace(/^\s*\d+\s*/, '').trim(),
  }));
  let lbIdx = 0;
  let lbLast = null;
  const pad = (n) => String(n).padStart(2, '0');
  function lbShow(i) {
    lbIdx = (i + items.length) % items.length;
    const it = items[lbIdx];
    lbImg.classList.remove('is-in');
    const img = new Image();
    img.onload = img.onerror = () => {
      lbImg.src = it.src;
      lbImg.alt = it.alt;
      requestAnimationFrame(() => lbImg.classList.add('is-in'));
    };
    img.src = it.src;
    lbCount.textContent = pad(lbIdx + 1) + ' / ' + pad(items.length);
    lbText.textContent = it.label;
    // pré-carrega a vizinha
    const nx = new Image(); nx.src = items[(lbIdx + 1) % items.length].src;
  }
  function lbOpen(i) {
    lbLast = document.activeElement;
    lbShow(i);
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add('is-open'));
    if (lenis) lenis.stop();
    body.style.overflow = 'hidden';
    document.addEventListener('keydown', lbKey);
    lbClose.focus({ preventScroll: true });
  }
  function lbCloseFn() {
    lb.classList.remove('is-open');
    setTimeout(() => { lb.hidden = true; lbImg.removeAttribute('src'); }, 360);
    if (lenis) lenis.start();
    body.style.overflow = '';
    document.removeEventListener('keydown', lbKey);
    if (lbLast) lbLast.focus({ preventScroll: true });
  }
  function lbKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); lbCloseFn(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); lbShow(lbIdx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); lbShow(lbIdx - 1); }
    else if (e.key === 'Tab') {
      const f = [lbClose, lbPrev, lbNext];
      const at = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  }
  cards.forEach((c, i) => c.addEventListener('click', () => lbOpen(i)));
  lbClose.addEventListener('click', lbCloseFn);
  lbPrev.addEventListener('click', () => lbShow(lbIdx - 1));
  lbNext.addEventListener('click', () => lbShow(lbIdx + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) lbCloseFn(); });
  // arrastar para os lados no celular
  let sx = 0, sy = 0, sw = false;
  lb.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; sw = true; });
  lb.addEventListener('pointerup', (e) => {
    if (!sw) return;
    sw = false;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) lbShow(lbIdx + (dx < 0 ? 1 : -1));
  });

  /* ---------------------------------------------------------------------
     Cabeçalho, barra de progresso e botões flutuantes
     --------------------------------------------------------------------- */
  const header = $('#header');
  const progress = $('#progressBar');
  const waFloat = $('#waFloat');
  const soundFloat = $('#soundFloat');
  const toTop = $('#toTop');
  const visitEl = $('#visita');
  let visitInView = false;
  let roomsInView = 0;
  let lastY = 0;
  if ('IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      roomsInView = seen.size;
      onScroll(lenis ? lenis.scroll : window.scrollY);
    }, { threshold: 0.35 });
    rooms.forEach((r) => io.observe(r.stage));
    io.observe($('.o-gallery__stage'));
  }
  if ('IntersectionObserver' in window && visitEl) {
    new IntersectionObserver((es) => es.forEach((e) => {
      visitInView = e.isIntersecting;
      onScroll(lenis ? lenis.scroll : window.scrollY);
    }), { threshold: 0.05 }).observe(visitEl);
  }
  function onScroll(y) {
    const vh = window.innerHeight;
    header.classList.toggle('is-solid', y > 40);
    if (y > vh * 1.2 && y > lastY + 4 && !lb.classList.contains('is-open')) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y < vh) header.classList.remove('is-hidden');
    lastY = y;
    const max = document.documentElement.scrollHeight - vh;
    progress.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    const heroEnd = vh * (HERO_LEN + 0.6);
    // celular: nas salas o vídeo ocupa a tela e o texto fica embaixo; os botões flutuantes saem da frente
    const roomZone = roomsInView > 0 && stacked();
    waFloat.classList.toggle('is-on', y > heroEnd && !visitInView && !roomZone);
    if (soundFloat) soundFloat.classList.toggle('is-shown', y > vh * 1.2 && !roomZone);
    if (toTop) {
      toTop.classList.toggle('is-shown', y > vh * 2 && !roomZone);
      toTop.classList.toggle('is-high', waFloat.classList.contains('is-on'));
    }
  }
  if (lenis) lenis.on('scroll', (e) => onScroll(e.scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  onScroll(0);

  /* ---------------------------------------------------------------------
     Pulos longos: cortina rápida, pula direto e abre de novo
     --------------------------------------------------------------------- */
  const curtain = $('#curtain');
  function goTo(y, done) {
    const from = lenis ? lenis.scroll : window.scrollY;
    const far = Math.abs(y - from) > window.innerHeight * 1.6;
    const land = () => { onScroll(y); if (window.ScrollTrigger) window.ScrollTrigger.update(); };
    if (reduced || !curtain || !far) {
      if (lenis) lenis.scrollTo(y, reduced ? { immediate: true, force: true } : { duration: 1.1 });
      else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
      setTimeout(() => { land(); if (done) done(); }, reduced ? 30 : 1150);
      return;
    }
    curtain.classList.add('is-on');
    setTimeout(() => {
      if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
      else window.scrollTo(0, y);
      land();
      setTimeout(() => { curtain.classList.remove('is-on'); if (done) done(); }, 320);
    }, 420);
  }
  if (toTop) {
    toTop.addEventListener('click', () => goTo(0, () => { const a = $('#header .brand'); if (a) a.focus({ preventScroll: true }); }));
  }
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      const el = id.length > 1 && $(id);
      if (!el) return;
      e.preventDefault();
      goTo(id === '#inicio' ? 0 : el.getBoundingClientRect().top + (lenis ? lenis.scroll : window.scrollY));
    });
  });

  /* ---------------------------------------------------------------------
     Cursor próprio e botões magnéticos
     --------------------------------------------------------------------- */
  if (finePointer && !reduced) {
    body.classList.add('has-cursor');
    const cursor = $('#cursor');
    const dot = $('.cursor__dot', cursor);
    const ring = $('.cursor__ring', cursor);
    let mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      cursor.style.opacity = '1';
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => (cursor.style.opacity = '0'));
    gsap.ticker.add(() => {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
    });
    const hoverSel = 'a, button, label, input, textarea, [data-magnetic]';
    document.addEventListener('pointerover', (e) => { if (e.target.closest(hoverSel)) cursor.classList.add('is-hover'); });
    document.addEventListener('pointerout', (e) => { if (e.target.closest(hoverSel)) cursor.classList.remove('is-hover'); });
    $$('[data-magnetic]').forEach((el) => {
      const qx = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
      const qy = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        qx((e.clientX - r.left - r.width / 2) * 0.28);
        qy((e.clientY - r.top - r.height / 2) * 0.4);
      });
      el.addEventListener('pointerleave', () => { qx(0); qy(0); });
    });
  }

  /* ---------------------------------------------------------------------
     Som ambiente (o mesmo do site) + efeitos: interruptor e luzes
     --------------------------------------------------------------------- */
  const soundBtn = $('#soundToggle');
  if (soundBtn) {
    const LOOP_START = 24.04, LOOP_END = 64.01, VOL = 0.7;
    let ac = null, gain = null, loading = null, started = false, on = false;
    const prepare = () => {
      if (loading) return loading;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('sem Web Audio'));
      ac = new AC();
      gain = ac.createGain();
      gain.gain.value = 0;
      gain.connect(ac.destination);
      loading = fetch('assets/media/ambient.mp3')
        .then((r) => r.arrayBuffer())
        .then((buf) => new Promise((ok, err) => ac.decodeAudioData(buf, ok, err)));
      return loading;
    };
    const SFX = { whoosh: 'assets/media/whoosh.mp3' };
    const sfxBuf = {};
    const loadSfx = (name) => {
      if (!sfxBuf[name]) {
        sfxBuf[name] = fetch(SFX[name])
          .then((r) => r.arrayBuffer())
          .then((buf) => new Promise((ok, err) => ac.decodeAudioData(buf, ok, err)));
        sfxBuf[name].catch(() => { delete sfxBuf[name]; });
      }
      return sfxBuf[name];
    };
    // clique do interruptor: sintetizado na hora (curto e seco)
    const click = (vol) => {
      const n = Math.floor(ac.sampleRate * 0.03);
      const b = ac.createBuffer(1, n, ac.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
      const src = ac.createBufferSource();
      src.buffer = b;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.9;
      const g = ac.createGain();
      g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start();
    };
    // luzes acendendo: clique + zumbido elétrico que pisca junto com os LEDs na tela
    const lightsOnSound = (vol) => {
      const t = ac.currentTime + 0.005;
      click(vol * 0.9);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.7;
      const g = ac.createGain();
      g.gain.value = 0;
      const o1 = ac.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 120;
      const o2 = ac.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 240;
      const g2 = ac.createGain(); g2.gain.value = 0.5;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(ac.destination);
      const G = 0.07 * vol;
      [[0.05, 0.95], [0.12, 0.12], [0.17, 1], [0.26, 0.3], [0.33, 1]].forEach(([dt, a]) => g.gain.setTargetAtTime(G * a, t + dt, 0.006));
      g.gain.setTargetAtTime(G * 0.3, t + 0.42, 0.12);
      g.gain.setTargetAtTime(0, t + 0.85, 0.3);
      o1.start(t); o2.start(t); o1.stop(t + 2.8); o2.stop(t + 2.8);
    };
    sfx = (name, vol = 0.8) => {
      if (!on || !ac) return;
      if (name === 'click') { click(vol); return; }
      if (name === 'lights') { lightsOnSound(vol); return; }
      if (!SFX[name]) return;
      loadSfx(name).then((buffer) => {
        if (!on) return;
        const src = ac.createBufferSource();
        src.buffer = buffer;
        const g = ac.createGain();
        g.gain.value = vol;
        src.connect(g);
        g.connect(ac.destination);
        src.start();
      }).catch(() => {});
    };
    const setUI = () => {
      [soundBtn, soundFloat].forEach((b) => {
        if (!b) return;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-label', on ? 'Desligar o som ambiente' : 'Ligar o som ambiente');
      });
      if (soundFloat) soundFloat.dataset.tip = on ? 'Desligar o som' : 'Ligar o som';
    };
    if (soundFloat) soundFloat.addEventListener('click', () => soundBtn.click());
    soundBtn.addEventListener('click', () => {
      on = !on;
      setUI();
      if (on) {
        const ready = prepare();
        loadSfx('whoosh').catch(() => {});
        ready.then((buffer) => {
          if (!on) return;
          if (!started) {
            const src = ac.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            src.loopStart = LOOP_START;
            src.loopEnd = Math.min(LOOP_END, buffer.duration);
            src.connect(gain);
            src.start(0, LOOP_START);
            started = true;
          }
          ac.resume();
          gain.gain.cancelScheduledValues(ac.currentTime);
          gain.gain.setTargetAtTime(VOL, ac.currentTime, 0.8);
        }).catch(() => { on = false; setUI(); });
      } else if (ac) {
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.setTargetAtTime(0, ac.currentTime, 0.25);
        setTimeout(() => { if (!on) ac.suspend(); }, 1400);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (!ac || !on) return;
      if (document.hidden) ac.suspend(); else ac.resume();
    });
  }

  /* ---------------------------------------------------------------------
     Rodapé: um míssil de luz cruza a logo e vai preenchendo as letras
     --------------------------------------------------------------------- */
  const footLogo = $('#footLogo');
  if (footLogo) {
    const clipRect = $('#flClipRect');
    const hotRect = $('#flHotRect');
    const missile = $('#flMissile');
    const sparksG = $('#flSparks');
    const FULL = 2400;
    const START = -170;
    const END = 1340 + 560;
    const DUR = 1350;
    const ease = (t) => 0.16 * t + 0.84 * t * t;
    const fillTo = (x) => clipRect.setAttribute('width', Math.max(0, x + 400).toFixed(1));
    const ghost = () => {
      fillTo(-400); hotRect.setAttribute('x', '-900');
      missile.setAttribute('transform', 'translate(-900 0)'); missile.style.opacity = '0';
      footLogo.classList.remove('is-done');
    };
    const done = () => {
      fillTo(FULL); hotRect.setAttribute('x', '-900'); missile.style.opacity = '0';
      footLogo.classList.remove('is-done'); void footLogo.getBoundingClientRect(); footLogo.classList.add('is-done');
    };
    if (reduced || !('IntersectionObserver' in window)) fillTo(FULL);
    else {
      ghost();
      const NS = 'http://www.w3.org/2000/svg';
      const sparks = Array.from({ length: 26 }, () => {
        const el = document.createElementNS(NS, 'circle');
        el.setAttribute('fill', '#BFFCFD'); el.setAttribute('r', '2'); el.style.opacity = '0';
        sparksG.appendChild(el);
        return { el, life: 0, x: 0, y: 0, vx: 0, vy: 0 };
      });
      let running = false;
      let ft0 = 0;
      let last = 0;
      const render = (t, dt) => {
        const x = START + (END - START) * ease(t);
        missile.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
        missile.style.opacity = String(Math.min(1, t / 0.05));
        fillTo(Math.min(x, FULL));
        hotRect.setAttribute('x', (x - 180).toFixed(1));
        if (t < 1 && x > -60 && x < 1420) {
          for (let k = 0; k < 2; k++) {
            const s = sparks.find((p) => p.life <= 0);
            if (!s) break;
            s.life = 0.35 + Math.random() * 0.2;
            s.x = x - 10 - Math.random() * 30; s.y = 63.5 + (Math.random() - 0.5) * 16;
            s.vx = -(90 + Math.random() * 240); s.vy = (Math.random() - 0.5) * 90;
            s.el.setAttribute('r', (1.4 + Math.random() * 2.2).toFixed(1));
          }
        }
        sparks.forEach((s) => {
          if (s.life <= 0) { s.el.style.opacity = '0'; return; }
          s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt;
          s.el.setAttribute('cx', s.x.toFixed(1)); s.el.setAttribute('cy', s.y.toFixed(1));
          s.el.style.opacity = Math.max(0, Math.min(1, s.life / 0.3)).toFixed(2);
        });
      };
      const frame = (now) => {
        const t = Math.min(1, (now - ft0) / DUR);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        render(t, dt);
        if (t < 1 || sparks.some((s) => s.life > 0)) requestAnimationFrame(frame);
        else { running = false; done(); }
      };
      window.__footMissile = { seek: (t) => { for (let i = 0; i < 12; i++) render(Math.max(0, t - (11 - i) * 0.012), 1 / 60); } };
      const launch = () => {
        if (running) return;
        running = true;
        footLogo.classList.remove('is-done');
        sfx('whoosh');
        ft0 = last = performance.now();
        requestAnimationFrame(frame);
      };
      new IntersectionObserver((entries) => entries.forEach((e) => {
        if (e.intersectionRatio >= 0.6) launch();
        else if (!e.isIntersecting && !running) ghost();
      }), { threshold: [0, 0.6] }).observe(footLogo);
    }
  }

  // recalcula as cenas quando as fontes e imagens terminam de chegar
  window.addEventListener('load', () => hasGSAP && ScrollTrigger.refresh());
})();
