/* =========================================================================
   ETERNAL — coreografia do site
   Lenis (rolagem suave) + GSAP ScrollTrigger (cenas presas ao scroll)
   + vídeos do Higgsfield guiados pela rolagem + logo em partículas (WebGL)
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
  // celular / tela em pé recebe os vídeos verticais (9:16)
  const portrait = window.innerHeight > window.innerWidth * 1.1 || window.innerWidth < 700;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);

  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    // no celular a barra do navegador some e aparece: não recalcular as cenas por isso
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ---------------------------------------------------------------------
     Vídeos: baixados inteiros (blob) para a rolagem ficar instantânea
     --------------------------------------------------------------------- */
  const sceneEls = $$('video.scene');
  const scenes = sceneEls.map((v) => ({
    v,
    base: v.dataset.src,
    dur: 8,
    target: 0,
    ready: false,
    loading: null,
  }));

  async function fetchWithProgress(url, onProgress) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = +res.headers.get('content-length') || 0;
    if (!res.body || !total) {
      const b = await res.blob();
      onProgress && onProgress(1);
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
      onProgress && onProgress(got / total);
    }
    return new Blob(chunks, { type: 'video/mp4' });
  }

  function loadScene(s, onProgress) {
    if (s.loading) return s.loading;
    const v = s.v;
    const suffix = portrait ? '-m' : '';
    if (portrait) v.poster = s.base + '-m.jpg';
    const url = s.base + suffix + '.mp4';
    s.loading = new Promise((resolve) => {
      const attach = (src) => {
        v.preload = 'auto';
        v.muted = true;
        v.src = src;
        const done = () => {
          s.dur = v.duration && isFinite(v.duration) ? v.duration : 8;
          s.ready = true;
          // iOS: tocar e pausar "destrava" a decodificação de quadros
          const p = v.play();
          if (p && p.then) p.then(() => { v.pause(); seek(s, s.target, true); }).catch(() => seek(s, s.target, true));
          else seek(s, s.target, true);
          resolve(s);
        };
        v.addEventListener('loadeddata', done, { once: true });
        v.addEventListener('error', () => {
          v.removeEventListener('loadeddata', done);
          if (src !== url) attach(url);   // blob recusado: usa o arquivo direto
          else resolve(s);
        }, { once: true });
        v.load();
      };
      fetchWithProgress(url, onProgress)
        .then((blob) => attach(URL.createObjectURL(blob)))
        .catch(() => { onProgress && onProgress(1); attach(url); });
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

  /* ---------------------------------------------------------------------
     Logo em partículas
     --------------------------------------------------------------------- */
  let particles = null;
  async function initParticles() {
    if (reduced || !window.EternalParticles) { html.classList.add('no-webgl'); return; }
    try {
      const paths = $$('#logo path');
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1340 127">' +
        '<path d="' + paths[0].getAttribute('d') + '" fill="#FFFFFF"/>' +
        '<path d="' + paths[1].getAttribute('d') + '" fill="#09EFF1"/></svg>';
      particles = new window.EternalParticles($('#heroCanvas'));
      await particles.init(svg);
      particles.play();
    } catch (e) {
      particles = null;
      html.classList.add('no-webgl');
    }
  }

  /* ---------------------------------------------------------------------
     Carregamento: o traço do R enche conforme as coisas chegam
     --------------------------------------------------------------------- */
  const loader = $('#loader');
  const loaderCount = $('#loaderCount');
  const loaderBar = $('.loader__slash i');
  const load = { fonts: 0, particles: 0, video: 0 };
  const loadTarget = () => load.fonts * 0.15 + load.particles * 0.3 + load.video * 0.55;
  let shown = 0;
  let loaderDone = false;
  const t0 = performance.now();

  function loaderTick() {
    if (loaderDone) return;
    const target = loadTarget();
    shown += (target - shown) * 0.08 + 0.0015;
    shown = Math.min(shown, target);
    loaderCount.textContent = String(Math.round(shown * 100)).padStart(3, '0');
    loaderBar.style.setProperty('--p', shown.toFixed(3));
    if (shown >= 0.999 && performance.now() - t0 > 1100) finishLoading();
    else requestAnimationFrame(loaderTick);
  }

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => (load.fonts = 1));
  initParticles().then(() => (load.particles = 1));
  if (reduced) load.video = 1;
  else if (scenes[0]) loadScene(scenes[0], (p) => (load.video = Math.max(load.video, p * 0.95))).then(() => (load.video = 1));
  else load.video = 1;
  // nunca prender ninguém no carregamento
  setTimeout(() => { load.fonts = load.particles = load.video = 1; }, 7000);
  requestAnimationFrame(loaderTick);

  function finishLoading() {
    loaderDone = true;
    loaderCount.textContent = '100';
    loader.classList.add('is-done');
    body.classList.remove('is-loading');
    window.scrollTo(0, 0);
    if (lenis) lenis.start();
    if (hasGSAP) ScrollTrigger.refresh();
    intro();
    // o resto das cenas carrega em sequência, sem pesar a primeira
    if (!reduced) {
      scenes.slice(1).reduce((p, s) => p.then(() => loadScene(s)), Promise.resolve());
    }
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
     Abertura: a logo nasce das partículas
     --------------------------------------------------------------------- */
  function intro() {
    if (reduced) return;
    if (particles) {
      const o = { v: 0 };
      gsap.to(o, {
        v: 1, duration: 3.4, ease: 'power2.out',
        onUpdate: () => particles.setIntro(o.v),
        onComplete: () => particles.firePulse(),
      });
      setInterval(() => {
        if (particles && particles.running && window.scrollY < window.innerHeight * 0.2) particles.firePulse();
      }, 7000);
    }
    gsap.from('.hero__top .label', { opacity: 0, letterSpacing: '1.1em', duration: 2.2, delay: 1.0, ease: 'expo.out' });
    gsap.from('.hero__slogan', { opacity: 0, y: 16, duration: 1.6, delay: 1.9, ease: 'expo.out' });
    gsap.from('.hero__cue span, .hero__cue i', { opacity: 0, y: 10, duration: 1.2, delay: 2.8, stagger: 0.15, ease: 'expo.out' });
    gsap.from('.site-header .nav', { opacity: 0, y: -10, duration: 1.2, delay: 2.2, ease: 'expo.out' });
  }

  if (!reduced) {
    /* ---------------- abertura + jornada: um único palco preso ----------------
       1,3 tela de rolagem para o mergulho no R, depois 7 telas para as cenas */
    const HERO_LEN = 1.3;
    const JOURNEY_LEN = 7;
    const stage = $('#journeyStage');
    const hero = $('#inicio');
    const heroBg = $('.hero__bg');
    const heroTop = $('.hero__top');
    const heroBottom = $('.hero__bottom');
    const heroCue = $('.hero__cue');
    const heroFallback = $('.hero__fallback');
    let heroHidden = false;

    function updateHero(h) {
      if (particles) particles.setScatter(h);
      if (window.__soundDive) window.__soundDive(h);
      const t = smooth(clamp(h / 0.3));
      heroTop.style.opacity = (1 - t).toFixed(3);
      heroTop.style.transform = 'translate3d(0,' + (-40 * t).toFixed(1) + 'px,0)';
      heroBottom.style.opacity = (1 - t).toFixed(3);
      heroBottom.style.transform = 'translate3d(0,' + (40 * t).toFixed(1) + 'px,0)';
      heroCue.style.opacity = (1 - smooth(clamp(h / 0.12))).toFixed(3);
      const f = smooth(clamp(h / 0.8));
      heroFallback.style.opacity = html.classList.contains('no-webgl') ? (1 - f).toFixed(3) : '';
      heroFallback.style.transform = 'translate(-50%,-50%) scale(' + (1 + f * 0.25).toFixed(3) + ')';
      // o fundo preto do hero se abre e revela a faísca da primeira cena
      heroBg.style.opacity = (1 - smooth(clamp((h - 0.5) / 0.42))).toFixed(3);
      const hide = h >= 0.999;
      if (hide !== heroHidden) {
        heroHidden = hide;
        hero.style.visibility = hide ? 'hidden' : 'visible';
        if (particles) hide ? particles.pause() : particles.play();
      }
    }

    const journeyScenes = scenes.filter((s) => stage.contains(s.v));
    const ranges = [[0, 0.37], [0.37, 0.69], [0.69, 1]];
    const beats = $$('[data-beat]', stage).map((el) => ({
      el,
      k: el.dataset.beat.split(',').map(Number),
      lines: $$('.line, .lead, .label, .method__steps', el),
    }));
    const steps = $$('.step', stage);
    const cuts = $$('.manifesto .no', stage);
    const yes = $('.manifesto .yes', stage);
    let activeScene = -1;

    function beatAlpha(p, k) {
      if (p < k[0] || p > k[3]) return 0;
      if (p < k[1]) return smooth((p - k[0]) / (k[1] - k[0] || 1));
      if (p > k[2]) return 1 - smooth((p - k[2]) / (k[3] - k[2] || 1));
      return 1;
    }

    function updateJourney(p) {
      // vídeo ativo e tempo de cada um
      let idx = 0;
      ranges.forEach((r, i) => {
        if (p >= r[0]) idx = i;
        const s = journeyScenes[i];
        if (s) s.target = (p - r[0]) / (r[1] - r[0]);
      });
      if (idx !== activeScene) {
        journeyScenes.forEach((s, i) => s.v.classList.toggle('is-active', i === idx));
        activeScene = idx;
      }
      // textos entram e saem
      beats.forEach((b) => {
        const a = beatAlpha(p, b.k);
        if (a > 0.5 && !b.shown) { b.shown = true; $$('.label--cyan', b.el).forEach((l) => window.__scramble && window.__scramble(l)); }
        else if (a < 0.05) b.shown = false;
        b.el.style.opacity = a.toFixed(3);
        b.el.style.visibility = a > 0.001 ? 'visible' : 'hidden';
        const entering = p < (b.k[1] + b.k[2]) / 2;
        b.lines.forEach((l, i) => {
          const off = (1 - a) * (28 + i * 16) * (entering ? 1 : -1);
          l.style.transform = 'translate3d(0,' + off.toFixed(1) + 'px,0)';
        });
      });
      // método: uma etapa acende por vez
      const m = beats.find((b) => b.el.classList.contains('method'));
      if (m) {
        const local = (p - m.k[1]) / (m.k[2] - m.k[1]);
        const cur = local < 0 ? -1 : Math.min(steps.length - 1, Math.floor(local * steps.length));
        steps.forEach((s, i) => {
          s.classList.toggle('is-on', i <= cur);
          s.classList.toggle('is-current', i === cur);
        });
      }
      // manifesto: o traço do R corta cada frase
      cuts.forEach((c, i) => {
        const v = clamp((p - (0.75 + i * 0.045)) / 0.035);
        c.style.setProperty('--cut', v.toFixed(3));
        c.classList.toggle('is-cut', v >= 1);
      });
      if (yes) {
        const y = smooth(clamp((p - 0.885) / 0.045));
        yes.style.opacity = y.toFixed(3);
        yes.style.transform = 'translate3d(0,' + ((1 - y) * 30).toFixed(1) + 'px,0)';
      }
    }

    function updateStage(progress) {
      const px = progress * (HERO_LEN + JOURNEY_LEN);
      updateHero(clamp(px / HERO_LEN));
      updateJourney(clamp((px - HERO_LEN) / JOURNEY_LEN));
    }
    const journeyST = ScrollTrigger.create({
      trigger: stage, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * (HERO_LEN + JOURNEY_LEN)),
      pin: true, anticipatePin: 1,
      onUpdate: (self) => updateStage(self.progress),
      onRefresh: (self) => updateStage(self.progress),
    });
    updateStage(0);
    window.__journeyST = journeyST;
    // posição de rolagem (px) de um ponto da jornada (0 a 1)
    window.__journeyAt = (p) => journeyST.start + (journeyST.end - journeyST.start) * (HERO_LEN + JOURNEY_LEN * p) / (HERO_LEN + JOURNEY_LEN);

    /* ---------------- final: a porta de luz ---------------- */
    const fStage = $('#finaleStage');
    const fScene = scenes.find((s) => fStage.contains(s.v));
    const fBeats = $$('[data-fbeat]', fStage).map((el) => ({
      el, k: el.dataset.fbeat.split(',').map(Number), lines: $$('.line', el),
    }));
    const flash = $('#flash');
    const blackout = $('#blackout');
    function updateFinale(p) {
      if (fScene) {
        fScene.target = clamp(p / 0.86);
        fScene.v.style.transform = 'scale(' + (1 + p * 0.1).toFixed(4) + ')';
      }
      fBeats.forEach((b) => {
        const a = beatAlpha(p, b.k);
        b.el.style.opacity = a.toFixed(3);
        b.el.style.visibility = a > 0.001 ? 'visible' : 'hidden';
        const entering = p < (b.k[1] + b.k[2]) / 2;
        b.lines.forEach((l, i) => {
          l.style.transform = 'translate3d(0,' + ((1 - a) * (28 + i * 16) * (entering ? 1 : -1)).toFixed(1) + 'px,0)';
        });
      });
      // a luz da porta toma a tela… e apaga: chegamos ao contato
      flash.style.opacity = smooth(clamp((p - 0.8) / 0.1)).toFixed(3);
      blackout.style.opacity = smooth(clamp((p - 0.91) / 0.08)).toFixed(3);
    }
    ScrollTrigger.create({
      trigger: fStage, start: 'top top', end: () => '+=' + Math.round(window.innerHeight * 3),
      pin: true, anticipatePin: 1,
      onUpdate: (self) => updateFinale(self.progress),
      onRefresh: (self) => updateFinale(self.progress),
      onEnter: () => fScene && loadScene(fScene),
    });
    updateFinale(0);
    // começa a baixar a porta de luz antes de chegar lá
    ScrollTrigger.create({ trigger: '#servicos', start: 'top bottom', once: true, onEnter: () => fScene && loadScene(fScene) });

    // os vídeos buscam o quadro certo a cada frame (só quando mudou)
    gsap.ticker.add(() => scenes.forEach((s) => s.ready && seek(s, s.target)));

    /* ---------------- revelações das seções ---------------- */
    $$('[data-reveal]').forEach((el) => {
      const parts = el.classList.contains('statement') ? $$('.line', el) : [el];
      gsap.from(parts, {
        y: 46, opacity: 0, duration: 1.3, ease: 'expo.out', stagger: 0.12,
        scrollTrigger: { trigger: el, start: 'top 86%' },
      });
    });
    $$('.service').forEach((el) => {
      gsap.from(el, { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%' } });
    });
    gsap.from('.pillars span', {
      opacity: 0, x: -14, duration: 0.9, stagger: 0.1, ease: 'expo.out',
      scrollTrigger: { trigger: '.pillars', start: 'top 90%' },
    });
    gsap.from('.tech__list li', {
      opacity: 0, y: 24, duration: 1, stagger: 0.1, ease: 'expo.out',
      scrollTrigger: { trigger: '.tech__list', start: 'top 85%' },
    });
    gsap.from('.demo', {
      opacity: 0, y: 70, rotateX: 8, transformPerspective: 1200, duration: 1.6, ease: 'expo.out',
      scrollTrigger: { trigger: '.demo', start: 'top 88%' },
    });
    gsap.from('#contato .statement .line', {
      y: 46, opacity: 0, duration: 1.3, stagger: 0.12, ease: 'expo.out',
      scrollTrigger: { trigger: '#contato', start: 'top 75%' },
    });
    gsap.from('#contato .form', {
      y: 60, opacity: 0, duration: 1.4, ease: 'expo.out',
      scrollTrigger: { trigger: '#contato', start: 'top 70%' },
    });
    gsap.from('.footer__logo', {
      yPercent: 40, opacity: 0, duration: 1.6, ease: 'expo.out',
      scrollTrigger: { trigger: '.footer', start: 'top 95%' },
    });

    /* ---------------- valores: o marcador acende ---------------- */
    $$('.value').forEach((el) => {
      ScrollTrigger.create({
        trigger: el, start: 'top 68%',
        onEnter: () => el.classList.add('is-on'),
        onLeaveBack: () => el.classList.remove('is-on'),
      });
    });
  }

  /* ---------------------------------------------------------------------
     Rótulos: as letras se decodificam quando entram em cena
     --------------------------------------------------------------------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>_';
  function scramble(el) {
    if (el.__busy) return;
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
  window.__scramble = scramble;
  if (!reduced) {
    $$('.section .label--cyan, .section__head .label--cyan').forEach((el) => {
      ScrollTrigger.create({ trigger: el, start: 'top 90%', onEnter: () => scramble(el) });
    });
  }

  /* ---------------------------------------------------------------------
     "Empresas reais merecem…" — acende palavra por palavra
     --------------------------------------------------------------------- */
  const big = $('[data-words]');
  if (big) {
    const words = [];
    const walk = (node, cyan) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const s = document.createElement('span');
            s.className = 'w' + (cyan ? ' is-cyan' : '');
            s.textContent = part;
            frag.appendChild(s);
            words.push(s);
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) {
          walk(n, cyan || n.classList.contains('hl'));
        }
      });
    };
    walk(big, false);
    if (reduced) words.forEach((w) => w.classList.add('is-lit'));
    else {
      ScrollTrigger.create({
        trigger: big, start: 'top 78%', end: 'bottom 42%',
        onUpdate: (self) => {
          const n = Math.round(self.progress * words.length);
          words.forEach((w, i) => w.classList.toggle('is-lit', i < n));
        },
      });
    }
  }

  /* ---------------------------------------------------------------------
     Estados estáticos quando o movimento é reduzido
     --------------------------------------------------------------------- */
  if (reduced) {
    $$('.step').forEach((s) => s.classList.add('is-on'));
    $$('.manifesto .no').forEach((c) => { c.style.setProperty('--cut', '1'); c.classList.add('is-cut'); });
    $$('.value').forEach((v) => v.classList.add('is-on'));
    $$('.scene').forEach((v) => { v.classList.add('poster-only'); v.removeAttribute('data-src'); });
  }

  /* ---------------------------------------------------------------------
     Serviços: a imagem segue o cursor, com o corte diagonal do R
     --------------------------------------------------------------------- */
  const reveal = $('#revealImg');
  const revealImg = $('#revealImgEl');
  if (reveal && finePointer && !reduced) {
    // pré-carrega as imagens quando a seção se aproxima
    let preloaded = false;
    const preload = () => {
      if (preloaded) return;
      preloaded = true;
      $$('.service').forEach((s) => { const i = new Image(); i.src = s.dataset.img; });
    };
    ScrollTrigger.create({ trigger: '#servicos', start: 'top 150%', once: true, onEnter: preload });

    const qx = gsap.quickTo(reveal, 'left', { duration: 0.55, ease: 'power3' });
    const qy = gsap.quickTo(reveal, 'top', { duration: 0.55, ease: 'power3' });
    let current = '';
    $$('.service').forEach((s) => {
      s.addEventListener('pointerenter', (e) => {
        preload();
        if (current !== s.dataset.img) {
          current = s.dataset.img;
          revealImg.src = current;
        }
        if (!reveal.classList.contains('is-on')) {
          gsap.set(reveal, { left: e.clientX, top: e.clientY });
        }
        reveal.classList.add('is-on');
      });
      s.addEventListener('pointermove', (e) => { qx(e.clientX + 40); qy(e.clientY); });
    });
    $('.service-list').addEventListener('pointerleave', () => reveal.classList.remove('is-on'));
    window.addEventListener('scroll', () => {
      if (!reveal.classList.contains('is-on')) return;
      const r = $('.service-list').getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) reveal.classList.remove('is-on');
    }, { passive: true });
  }

  /* ---------------------------------------------------------------------
     Cabeçalho, barra de progresso e botão do WhatsApp
     --------------------------------------------------------------------- */
  const header = $('#header');
  const progress = $('#progressBar');
  const waFloat = $('#waFloat');
  const contact = $('#contato');
  let lastY = 0;
  let contactInView = false;
  if ('IntersectionObserver' in window && contact) {
    new IntersectionObserver((es) => es.forEach((e) => (contactInView = e.isIntersecting)), { threshold: 0.05 }).observe(contact);
  }
  function onScroll(y) {
    const vh = window.innerHeight;
    header.classList.toggle('is-solid', y > 40);
    header.classList.toggle('show-brand', y > vh * 1.25);
    if (y > vh * 1.2 && y > lastY + 4) header.classList.add('is-hidden');
    else if (y < lastY - 4 || y < vh) header.classList.remove('is-hidden');
    lastY = y;
    const max = document.documentElement.scrollHeight - vh;
    progress.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    const jEnd = window.__journeyST ? window.__journeyST.end : vh * 1.3;
    waFloat.classList.toggle('is-on', y > jEnd + vh * 0.3 && !contactInView);
  }
  if (lenis) lenis.on('scroll', (e) => onScroll(e.scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });
  onScroll(0);

  /* ---------------------------------------------------------------------
     Âncoras do menu (respeitando as cenas presas)
     --------------------------------------------------------------------- */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (id.length < 2) return;
      const el = $(id);
      if (!el) return;
      e.preventDefault();
      let y;
      if (id === '#metodo' && window.__journeyAt) y = window.__journeyAt(0.5);
      else if (id === '#inicio') y = 0;
      else y = el.getBoundingClientRect().top + window.scrollY;
      if (lenis) lenis.scrollTo(y, { duration: 1.8 });
      else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
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
    const hoverSel = 'a, button, label, input, textarea, .service, [data-magnetic]';
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
     Som ambiente (gerado no Higgsfield) — desligado por padrão.
     Abafado na abertura, abre quando a câmera mergulha no R.
     --------------------------------------------------------------------- */
  const soundBtn = $('#soundToggle');
  if (soundBtn) {
    const LOOP_START = 24.04, LOOP_END = 64.01, VOL = 0.8;
    let ac = null, gain = null, filter = null, loading = null, started = false, on = false;
    let dive = 0;
    const cutoff = (h) => 380 * Math.pow(18000 / 380, clamp(h));
    window.__soundDive = (h) => {
      dive = h;
      if (filter && on) filter.frequency.setTargetAtTime(cutoff(h), ac.currentTime, 0.12);
    };
    const prepare = () => {
      if (loading) return loading;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return Promise.reject(new Error('sem Web Audio'));
      ac = new AC();
      gain = ac.createGain();
      gain.gain.value = 0;
      filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.6;
      filter.frequency.value = cutoff(dive);
      filter.connect(gain);
      gain.connect(ac.destination);
      loading = fetch('assets/media/ambient.mp3')
        .then((r) => r.arrayBuffer())
        .then((buf) => new Promise((ok, err) => ac.decodeAudioData(buf, ok, err)));
      return loading;
    };
    const setUI = () => {
      soundBtn.classList.toggle('is-on', on);
      soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      soundBtn.setAttribute('aria-label', on ? 'Desligar o som ambiente' : 'Ligar o som ambiente');
    };
    soundBtn.addEventListener('click', () => {
      on = !on;
      setUI();
      if (on) {
        prepare().then((buffer) => {
          if (!on) return;
          if (!started) {
            const src = ac.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            src.loopStart = LOOP_START;
            src.loopEnd = Math.min(LOOP_END, buffer.duration);
            src.connect(filter);
            src.start();
            started = true;
          }
          ac.resume();
          filter.frequency.setValueAtTime(cutoff(dive), ac.currentTime);
          gain.gain.cancelScheduledValues(ac.currentTime);
          gain.gain.setTargetAtTime(VOL, ac.currentTime, 0.8);
        }).catch(() => { on = false; setUI(); });
      } else if (ac) {
        gain.gain.cancelScheduledValues(ac.currentTime);
        gain.gain.setTargetAtTime(0, ac.currentTime, 0.25);
        setTimeout(() => { if (!on) ac.suspend(); }, 1400);
      }
    });
    // aba escondida: silêncio
    document.addEventListener('visibilitychange', () => {
      if (!ac || !on) return;
      if (document.hidden) ac.suspend(); else ac.resume();
    });
  }

  /* ---------------------------------------------------------------------
     Contato: copiar e formulário que abre o WhatsApp com a mensagem pronta
     --------------------------------------------------------------------- */
  $$('.copy-btn').forEach((b) => {
    b.addEventListener('click', async () => {
      const text = b.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
      }
      const old = b.textContent;
      b.textContent = ok ? 'Copiado ✓' : 'Selecione e copie';
      setTimeout(() => (b.textContent = old), 1800);
    });
  });

  const form = $('#contactForm');
  const formError = $('#formError');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = form.elements;
      const nome = f.namedItem('nome').value.trim();
      if (!nome) {
        formError.hidden = false;
        f.namedItem('nome').focus();
        return;
      }
      formError.hidden = true;
      const empresa = f.namedItem('empresa').value.trim();
      const interesses = $$('input[name="interesse"]:checked', form).map((i) => i.value);
      const msg = f.namedItem('mensagem').value.trim();
      let text = 'Olá, ETERNAL! Sou ' + nome + (empresa ? ', da ' + empresa : '') + '.';
      if (interesses.length) text += '\nQuero construir: ' + interesses.join(', ') + '.';
      if (msg) text += '\n' + msg;
      const href = 'https://wa.me/5569993130318?text=' + encodeURIComponent(text);
      const done = $('#formDone');
      const link = $('#formDoneLink');
      if (done && link) {
        link.href = href;
        done.hidden = false;
      }
      const a = document.createElement('a');
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  // recalcula as cenas quando as fontes e imagens terminam de chegar
  window.addEventListener('load', () => hasGSAP && ScrollTrigger.refresh());
})();
