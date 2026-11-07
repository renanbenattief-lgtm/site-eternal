/* ETERNAL — demonstração da IA avaliando um atendimento (conversa fictícia) */
(function () {
  'use strict';

  const demo = document.getElementById('demo');
  if (!demo) return;

  const chat = document.getElementById('demoChat');
  const score = document.getElementById('demoScore');
  const summary = document.getElementById('demoSummary');
  const alertBox = document.getElementById('demoAlert');
  const replay = document.getElementById('demoReplay');
  const rows = Array.from(demo.querySelectorAll('.crit__row'));
  const live = demo.querySelector('.demo__bar .live');

  // o estado final já está no HTML (sem JS ele aparece pronto); guardamos para reproduzir
  const messages = Array.from(chat.querySelectorAll('.msg')).map((m) => ({
    side: m.classList.contains('msg--out') ? 'out' : 'in',
    html: m.innerHTML,
  }));
  const finalRows = rows.map((r) => {
    const bar = r.querySelector('.crit__bar i');
    return {
      val: r.querySelector('.crit__val').textContent,
      w: bar.style.getPropertyValue('--w'),
      low: bar.classList.contains('is-low'),
    };
  });
  const finalSummary = summary.textContent.trim();
  const finalScore = parseInt(score.firstChild.textContent, 10) || 0;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timers = [];
  let running = false;
  let played = false;

  const wait = (ms) => new Promise((res) => timers.push(setTimeout(res, ms)));
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function setScore(n, bad) {
    score.firstChild.textContent = n;
    score.classList.toggle('is-bad', !!bad);
  }

  function resetPanel() {
    setScore('–', false);
    rows.forEach((r) => {
      r.querySelector('.crit__val').textContent = '–';
      const bar = r.querySelector('.crit__bar i');
      bar.style.setProperty('--w', '0%');
      bar.classList.remove('is-low');
    });
    summary.textContent = 'Lendo a conversa…';
    summary.style.color = 'var(--muted)';
    alertBox.classList.remove('is-on');
    if (live) live.textContent = 'IA analisando';
  }

  function addTyping(side) {
    const t = document.createElement('div');
    t.className = 'msg msg--typing ' + (side === 'out' ? 'msg--out' : 'msg--in');
    t.innerHTML = '<span></span><span></span><span></span>';
    t.setAttribute('aria-hidden', 'true');
    chat.appendChild(t);
    return t;
  }

  function addMessage(m) {
    const el = document.createElement('div');
    el.className = 'msg ' + (m.side === 'out' ? 'msg--out' : 'msg--in');
    el.innerHTML = m.html;
    chat.appendChild(el);
  }

  async function typeText(el, text, cps) {
    el.style.color = '';
    el.textContent = '';
    const step = Math.max(1, Math.round(text.length / 90));
    for (let i = 0; i < text.length; i += step) {
      el.textContent = text.slice(0, i + step);
      await wait(1000 / cps);
    }
    el.textContent = text;
  }

  async function run() {
    if (running) return;
    running = true;
    clearTimers();
    chat.innerHTML = '';
    resetPanel();
    await wait(500);

    // a conversa acontece
    for (const m of messages) {
      const typing = addTyping(m.side);
      await wait(m.side === 'out' ? 380 : 620);
      typing.remove();
      addMessage(m);
      await wait(260);
    }

    // a IA avalia
    if (live) live.textContent = 'Avaliação pronta';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const f = finalRows[i];
      const bar = r.querySelector('.crit__bar i');
      bar.classList.toggle('is-low', f.low);
      bar.style.setProperty('--w', f.w || '0%');
      r.querySelector('.crit__val').textContent = f.val;
      await wait(170);
    }
    // nota sobe de 0 até a nota final
    for (let n = 0; n <= finalScore; n++) {
      setScore(n, n <= 5);
      await wait(120);
    }
    await typeText(summary, finalSummary, 70);
    await wait(350);
    alertBox.classList.add('is-on');
    running = false;
  }

  function showFinal() {
    // estado final imediato (movimento reduzido)
    alertBox.classList.add('is-on');
  }

  replay && replay.addEventListener('click', () => {
    running = false;
    clearTimers();
    if (reduced) return showFinal();
    run();
  });

  if (reduced || !('IntersectionObserver' in window)) { showFinal(); return; }

  // começa sozinha quando a demonstração entra na tela
  resetPanel();
  chat.innerHTML = '';
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !played) {
        played = true;
        run();
        io.disconnect();
      }
    });
  }, { threshold: 0.35 });
  io.observe(demo);
})();
