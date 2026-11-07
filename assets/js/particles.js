/* ETERNAL — logo em partículas (WebGL puro, sem dependências)
 * - As partículas são amostradas do próprio SVG da logo (o traço do R sai em ciano).
 * - setIntro(0→1) monta a logo; setScatter(0→1) leva a câmera para dentro da logo,
 *   mergulhando no traço ciano do R (a luz que vira a faísca da primeira cena).
 * - O mouse empurra as partículas, que voltam sozinhas.
 */
(function () {
  'use strict';

  const VERT = `
    attribute vec3 aTarget;
    attribute vec4 aRand;
    attribute vec3 aColor;
    attribute float aKind;          // 0 = logo, 1 = poeira de fundo
    uniform float uTime, uIntro, uScatter, uAspect, uFocal, uDist, uPoint, uDpr, uPulse;
    uniform vec2 uMouse, uParallax, uFocus;
    uniform float uMouseOn;
    varying vec3 vColor;
    varying float vAlpha;

    float easeOutCubic(float t) { return 1.0 - pow(1.0 - t, 3.0); }

    void main() {
      vec3 target = aTarget;
      vec3 dir = normalize(aRand.xyz + vec3(0.0001));
      float r = aRand.w;
      vec3 pos;

      if (aKind < 0.5) {
        // montagem: cada partícula parte de um ponto espalhado e chega no seu lugar com atraso próprio
        float t = clamp(uIntro * 1.55 - r * 0.55, 0.0, 1.0);
        float e = easeOutCubic(t);
        vec3 start = target + dir * (1.6 + r * 2.4) + vec3(0.0, 0.0, -1.5 - r * 2.0);
        pos = mix(start, target, e);
        // respiração sutil
        pos.xy += vec2(sin(uTime * 0.9 + r * 40.0), cos(uTime * 0.7 + r * 30.0)) * 0.0016;
        // mouse: empurra para fora e para a frente
        vec2 d = pos.xy - uMouse;
        float dist = length(d);
        float f = smoothstep(0.22, 0.0, dist) * uMouseOn * e;
        pos.xy += normalize(d + 0.0001) * f * 0.07;
        pos.z += f * 0.35;
        // mergulho: a câmera atravessa a logo pelo traço ciano do R
        float s = uScatter;
        float dive = s * s * (0.55 + 0.45 * s);
        pos.xy -= uFocus * smoothstep(0.0, 0.55, s);
        pos.z += dive * 2.9 + dir.z * dive * 0.3;
        pos.xy += dir.xy * dive * (0.03 + r * 0.07);
      } else {
        // poeira de fundo: deriva lenta
        pos = target;
        pos.x += sin(uTime * 0.05 + r * 20.0) * 0.06;
        pos.y += cos(uTime * 0.04 + r * 12.0) * 0.04;
        pos.z += uScatter * uScatter * 2.8;
      }

      // paralaxe com o mouse (mais forte no que está mais perto)
      pos.xy += uParallax * (0.02 + min(pos.z, 0.5) * 0.03) * (1.0 - uScatter);

      float z = max(uDist - pos.z, 0.25);
      vec2 clip = pos.xy * uFocal / z;
      clip.y *= uAspect;
      gl_Position = vec4(clip, 0.0, 1.0);

      float persp = uDist / z;
      gl_PointSize = min(uPoint * uDpr * persp * (aKind < 0.5 ? 1.0 : (0.5 + r)), 72.0);

      // brilho: um pulso de luz percorre a logo da esquerda para a direita
      float pulse = smoothstep(0.08, 0.0, abs(target.x - (uPulse * 2.6 - 1.3))) * step(aKind, 0.5);
      vColor = aColor + pulse * vec3(0.35, 0.9, 0.95);
      float fadeNear = smoothstep(0.25, 0.9, z);
      float twinkle = 0.85 + 0.15 * sin(uTime * 2.0 + r * 60.0);
      vAlpha = (aKind < 0.5)
        ? twinkle * fadeNear * (1.0 - smoothstep(0.9, 1.0, uScatter)) * smoothstep(0.0, 0.12, uIntro)
        : (0.18 + 0.25 * r) * fadeNear * (1.0 - smoothstep(0.75, 1.0, uScatter));
    }`;

  const FRAG = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      float d = length(p);
      float a = smoothstep(0.5, 0.05, d);
      gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha);
    }`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  // Amostra a logo: devolve posições (x de -1 a 1) e cores
  async function sampleLogo(svgText, targetCount) {
    const W = 1340, H = 127, PAD = 10, SCALE = 1.5;
    const cw = Math.round((W + PAD * 2) * SCALE), ch = Math.round((H + PAD * 2) * SCALE);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      svgText.replace('<svg ', `<svg width="${cw}" height="${ch}" `).replace(/viewBox="[^"]*"/, `viewBox="${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}"`)
    );
    const img = await loadImage(url);
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    let filled = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 128) filled++;
    const step = Math.max(1, Math.sqrt(filled / targetCount));
    const pts = [], cols = [];
    for (let y = 0; y < ch; y += step) {
      for (let x = 0; x < cw; x += step) {
        const jx = x + (Math.random() - 0.5) * step * 0.6;
        const jy = y + (Math.random() - 0.5) * step * 0.6;
        const ix = Math.min(cw - 1, Math.max(0, Math.round(jx)));
        const iy = Math.min(ch - 1, Math.max(0, Math.round(jy)));
        const k = (iy * cw + ix) * 4;
        if (data[k + 3] < 128) continue;
        const r = data[k] / 255, g = data[k + 1] / 255, b = data[k + 2] / 255;
        const isCyan = r < 0.5 && g > 0.6 && b > 0.6;
        // logo centrada: largura 2 (x de -1 a 1), y para cima
        const lx = ((ix / SCALE - PAD) / W) * 2 - 1;
        const ly = -(((iy / SCALE - PAD) / W) * 2 - H / W);
        pts.push(lx, ly);
        cols.push(isCyan ? [0.05, 1.25, 1.27] : [0.82, 0.86, 0.88]);
      }
    }
    return { pts, cols, step: step / SCALE / W * 2 };
  }

  class EternalParticles {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.opts = opts;
      this.intro = 0; this.scatter = 0; this.pulse = -1;
      this.mouse = [9, 9]; this.mouseOn = 0; this.mouseTarget = 0;
      this.parallax = [0, 0]; this.parallaxTarget = [0, 0];
      this.running = false;
      this.start = performance.now();
    }

    async init(svgText) {
      const gl = this.canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL indisponível');
      this.gl = gl;
      const small = window.innerWidth < 760;
      const count = this.opts.count || (small ? 7000 : 19000);
      const { pts, cols, step } = await sampleLogo(svgText, count);
      this.step = step;
      const n = pts.length / 2;
      const dust = small ? 500 : 1400;
      const total = n + dust;
      const aTarget = new Float32Array(total * 3);
      const aRand = new Float32Array(total * 4);
      const aColor = new Float32Array(total * 3);
      const aKind = new Float32Array(total);
      for (let i = 0; i < n; i++) {
        aTarget[i * 3] = pts[i * 2];
        aTarget[i * 3 + 1] = pts[i * 2 + 1];
        aTarget[i * 3 + 2] = (Math.random() - 0.5) * 0.01;
        const c = cols[i];
        aColor.set(c, i * 3);
      }
      for (let i = n; i < total; i++) {
        aTarget[i * 3] = (Math.random() - 0.5) * 5.0;
        aTarget[i * 3 + 1] = (Math.random() - 0.5) * 3.0;
        aTarget[i * 3 + 2] = -Math.random() * 6.0 + 0.6;
        const tint = Math.random() < 0.12;
        aColor.set(tint ? [0.035, 0.85, 0.9] : [0.75, 0.8, 0.85], i * 3);
        aKind[i] = 1;
      }
      for (let i = 0; i < total; i++) {
        // direção aleatória com viés para fora do centro
        let x = Math.random() * 2 - 1, y = Math.random() * 2 - 1, z = Math.random() * 2 - 1;
        aRand[i * 4] = x; aRand[i * 4 + 1] = y; aRand[i * 4 + 2] = z * 0.6;
        aRand[i * 4 + 3] = Math.random();
      }
      const prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      this.prog = prog;
      const buf = (arr, name, size) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, name);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      };
      buf(aTarget, 'aTarget', 3); buf(aRand, 'aRand', 4); buf(aColor, 'aColor', 3); buf(aKind, 'aKind', 1);
      this.count = total;
      this.u = {};
      ['uTime', 'uIntro', 'uScatter', 'uAspect', 'uFocal', 'uDist', 'uPoint', 'uDpr', 'uMouse', 'uMouseOn', 'uParallax', 'uPulse', 'uFocus']
        .forEach((k) => (this.u[k] = gl.getUniformLocation(prog, k)));
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);   // aditivo: a luz se soma
      this.resize();
      this._onResize = () => this.resize();
      window.addEventListener('resize', this._onResize);
      this._onMove = (e) => this.pointer(e);
      window.addEventListener('pointermove', this._onMove, { passive: true });
      window.addEventListener('pointerleave', () => (this.mouseTarget = 0));
      return this;
    }

    resize() {
      const gl = this.gl;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.dpr = dpr; this.w = w; this.h = h;
      // a logo ocupa ~78% da largura no computador e ~90% no celular
      const frac = w < 760 ? 0.9 : Math.min(0.78, 1180 / w);
      this.dist = 3.0;
      this.focal = frac * this.dist;
      // tamanho do ponto proporcional ao espaçamento da amostragem na tela
      const spacingPx = this.step * 0.5 * frac * w;
      this.point = Math.max(1.6, spacingPx * 1.75);
    }

    pointer(e) {
      if (!this.w) return;
      const rect = this.canvas.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      // coordenadas no plano da logo (z = 0)
      this.mouse = [nx * this.dist / this.focal, (ny / (this.w / this.h)) * this.dist / this.focal];
      this.mouseTarget = e.pointerType === 'touch' ? 0 : 1;
      this.parallaxTarget = [nx, ny];
    }

    setIntro(v) { this.intro = v; }
    setScatter(v) { this.scatter = v; }
    firePulse() { this.pulse = 0; this._pulseStart = performance.now(); }

    frame(now) {
      if (!this.running) return;
      const gl = this.gl, u = this.u;
      const t = (now - this.start) / 1000;
      this.mouseOn += (this.mouseTarget - this.mouseOn) * 0.08;
      this.parallax[0] += (this.parallaxTarget[0] - this.parallax[0]) * 0.05;
      this.parallax[1] += (this.parallaxTarget[1] - this.parallax[1]) * 0.05;
      let pulse = -1;
      if (this._pulseStart) {
        pulse = (now - this._pulseStart) / 1600;
        if (pulse > 1.2) this._pulseStart = null;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uTime, t);
      gl.uniform1f(u.uIntro, this.intro);
      gl.uniform1f(u.uScatter, this.scatter);
      gl.uniform1f(u.uAspect, this.w / this.h);
      gl.uniform1f(u.uFocal, this.focal);
      gl.uniform1f(u.uDist, this.dist);
      gl.uniform1f(u.uPoint, this.point);
      gl.uniform1f(u.uDpr, this.dpr);
      gl.uniform2f(u.uMouse, this.mouse[0], this.mouse[1]);
      gl.uniform1f(u.uMouseOn, this.mouseOn);
      gl.uniform2f(u.uParallax, this.parallax[0], this.parallax[1]);
      gl.uniform1f(u.uPulse, pulse);
      // centro do traço ciano do R, nas coordenadas da logo (x de -1 a 1)
      gl.uniform2f(u.uFocus, -0.048, -0.059);
      gl.drawArrays(gl.POINTS, 0, this.count);
      this._raf = requestAnimationFrame((n) => this.frame(n));
    }

    play() {
      if (this.running) return;
      this.running = true;
      this._raf = requestAnimationFrame((n) => this.frame(n));
    }

    pause() {
      this.running = false;
      cancelAnimationFrame(this._raf);
    }
  }

  window.EternalParticles = EternalParticles;
})();
