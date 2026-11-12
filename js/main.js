(() => {
  "use strict";
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];

  const stage = $("#stage"), world = $("#world"), slides = $$(".slide"), N = slides.length;
  const fxc = $("#fx"), fx = fxc.getContext("2d");
  const sweep = $("#sweep i"), ovsel = $("#ovsel"), ctrl = $("#ctrl"), help = $("#help");
  const morphLayer = document.createElement("div");
  morphLayer.id = "morph"; morphLayer.style.cssText = "position:absolute;inset:0;z-index:25;pointer-events:none";
  stage.insertBefore(morphLayer, fxc);

  let cur = -1, step = 0, overview = false, ovSel = 0;

  /* ---------- perf probe (read by the test harness) ---------- */
  const perf = window.__perf = { on: false, dts: [] };

  /* ---------- fit 1920x1080 stage to window ---------- */
  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `scale(${s})`;
  }
  addEventListener("resize", fit); fit();

  /* ---------- easing ---------- */
  const EASE_IO = "cubic-bezier(.77,0,.18,1)";
  const EASE_OUT = "cubic-bezier(.16,1,.3,1)";
  const EASE_IN = "cubic-bezier(.6,0,.85,.35)";
  function springLinear(k = 170, c = 19) {           // real spring sampled into CSS linear()
    let x = 0, v = 0; const pts = [], dt = 1 / 240;
    for (let i = 0; i <= 240; i++) { if (i % 4 === 0) pts.push(+x.toFixed(4)); const a = -k * (x - 1) - c * v; v += a * dt; x += v * dt; }
    pts.push(1); return `linear(${pts.join(",")})`;
  }
  let SPRING = "cubic-bezier(.3,1.25,.4,1)";
  try { const t = springLinear(); document.body.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1, easing: t }).cancel(); SPRING = t; } catch (e) { }
  const D = RM ? 240 : 1000;

  /* ---------- layout rect in slide coordinates (ignores transforms, no thrash: read before writes) ---------- */
  function lr(el) {
    let x = 0, y = 0, e = el;
    while (e && !e.classList.contains("slide")) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  }

  /* ---------- split text into words/chars ---------- */
  $$("[data-split]").forEach(host => {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.nodeValue.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span"); w.className = "w";
            for (const c of part) { const ch = document.createElement("span"); ch.className = "ch"; ch.textContent = c; ch.style.setProperty("--i", i++); w.appendChild(ch); }
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(host);
  });

  /* ---------- slide meta ---------- */
  slides.forEach((s, i) => {
    s.dataset.n = String(i + 1).padStart(2, "0");
    const nums = [0, ...$$("[data-b]", s).map(e => +e.dataset.b), ...$$("[data-only]", s).map(e => +e.dataset.only)];
    s._max = Math.max(...nums);
    s._depth = $$("[data-depth]", s).map(el => ({ el, d: +el.dataset.depth, x: 0, y: 0 }));
    s._pfx = s.dataset.pfx || "";
  });

  /* ---------- scheduler (runs inside the one rAF loop) ---------- */
  let sched = [];
  let now = performance.now();
  const later = (fn, ms, slide = null) => sched.push({ t: now + ms, fn, slide });

  /* ---------- sprites ---------- */
  const sprites = $$(".spr").map(el => {
    const seq = el.dataset.chain
      ? el.dataset.chain.split(",").map(s => { const [src, n, fps] = s.split(":"); return { src, n: +n, fps: +fps }; })
      : [{ src: el.dataset.src, n: +el.dataset.frames, fps: +el.dataset.fps }];
    const imgs = seq.map((s, i) => { const im = new Image(); im.src = s.src; im.alt = ""; im.draggable = false; im.style.display = i ? "none" : "block"; el.appendChild(im); return im; });
    return {
      el, seq, imgs, fw: +(el.dataset.fw || 48), hit: el.dataset.hit != null ? +el.dataset.hit : -1,
      hold: +(el.dataset.hold || 0), impact: !!el.dataset.impact, blood: !!el.dataset.blood,
      slide: el.closest(".slide"), part: 0, frame: 0, acc: 0, wait: 0, shown: 0, size: 0, rect: null
    };
  });
  function drawSprite(s) {
    if (s.shown !== s.part) { s.imgs[s.shown].style.display = "none"; s.imgs[s.part].style.display = "block"; s.shown = s.part; }
    const nh = s.imgs[s.part].naturalHeight || s.fw;
    s.imgs[s.part].style.transform = `translate3d(${-Math.round(s.frame * s.fw * s.size / nh)}px,0,0)`;
  }
  function resetSprite(s) { s.part = 0; s.frame = 0; s.acc = 0; s.wait = 0; s.reset = false; drawSprite(s); }

  /* small sprite FX (impact, blood) placed in slide coords */
  const fxSprites = [];
  function spawnFx(sp, src, frames, size, fps, dx, dy) {
    if (RM) return;
    const r = sp.rect || (sp.rect = lr(sp.el));
    const d = document.createElement("div"); d.className = "fxs";
    d.style.cssText = `width:${size}px;height:${size}px;left:${Math.round(r.x + (r.w - size) / 2 + dx)}px;top:${Math.round(r.y + (r.h - size) / 2 + dy)}px`;
    const im = new Image(); im.src = src; d.appendChild(im); sp.slide.appendChild(d);
    fxSprites.push({ d, im, frames, size, fd: 1000 / fps, t: 0, f: -1 });
  }

  /* ---------- particles: one 480x270 canvas (game res), integer pixels ---------- */
  const P = [], MAXP = 600;
  const EMB = ["#E8B84A", "#f0a742", "#df3020", "#fbda74", "#d2802d"];
  const ambient = {
    embers: { rate: 16, make: () => ({ x: rand(0, 480), y: 274, vx: rand(-6, 6), vy: rand(-42, -18), life: rand(5, 9), c: pick(EMB), s: Math.random() < .25 ? 2 : 1, wob: rand(0, 6.28), k: 1 }) },
    "embers-lite": { rate: 6, make: () => ({ x: rand(0, 480), y: 274, vx: rand(-4, 4), vy: rand(-30, -14), life: rand(5, 9), c: pick(EMB), s: 1, wob: rand(0, 6.28), k: 1 }) },
    "embers-gold": { rate: 24, make: () => ({ x: rand(0, 480), y: 274, vx: rand(-8, 8), vy: rand(-48, -20), life: rand(5, 9), c: pick(["#E8B84A", "#fbda74", "#fbf5b6", "#f0a742"]), s: Math.random() < .3 ? 2 : 1, wob: rand(0, 6.28), k: 1 }) },
    dust: { rate: 9, make: () => ({ x: rand(-10, 470), y: rand(0, 270), vx: rand(5, 14), vy: rand(-3, 3), life: rand(6, 10), c: pick(["#ddd5c6", "#bab197", "#fbf5b6"]), s: 1, wob: rand(0, 6.28), k: .45 }) },
    fireflies: { rate: 5, make: () => ({ x: rand(0, 480), y: rand(80, 270), vx: rand(-6, 6), vy: rand(-6, 2), life: rand(4, 8), c: pick(["#d2e283", "#9ecf59", "#fbda74"]), s: 1, wob: rand(0, 6.28), k: 1, pulse: 1 }) }
  };
  let emitAcc = 0;
  function burst(x, y, n, cols, sp = 120, grav = 260, size = 1) {
    if (RM) return;
    for (let i = 0; i < n && P.length < MAXP; i++) {
      const a = rand(0, Math.PI * 2), v = rand(sp * .3, sp);
      P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * .4, g: grav, life: rand(.25, .7), max: 0, c: pick(cols), s: Math.random() < .3 ? size + 1 : size, k: 1, drag: 2.5 });
    }
  }
  function stepParticles(dt, kind, px, py) {
    const sec = dt / 1000;
    const em = ambient[kind];
    if (em && !RM) {
      emitAcc += em.rate * sec;
      while (emitAcc >= 1 && P.length < MAXP) { emitAcc--; const p = em.make(); p.max = p.life; P.push(p); }
    }
    fx.clearRect(0, 0, 480, 270);
    const ox = px * 10, oy = py * 6;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= sec;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (!p.max) p.max = p.life;
      if (p.g) { p.vy += p.g * sec; p.vx *= 1 - p.drag * sec; p.vy *= 1 - p.drag * sec * .3; }
      else if (p.wob !== undefined) { p.wob += sec * 2; p.vx += Math.sin(p.wob) * 6 * sec; }
      p.x += p.vx * sec; p.y += p.vy * sec;
      let a = Math.min(1, p.life / .8, (p.max - p.life) / .4 + .1) * p.k;
      if (p.pulse) a *= .5 + .5 * Math.sin(p.wob * 3);
      fx.globalAlpha = clamp(a, 0, 1);
      fx.fillStyle = p.c;
      fx.fillRect(Math.round(p.x + ox * p.s * .5), Math.round(p.y + oy * p.s * .5), p.s, p.s);
    }
    fx.globalAlpha = 1;
  }

  /* ---------- hit: hit-stop, then shake + sparks ---------- */
  let shakeAmp = 0, hitstop = 0, pendingShake = 0;
  function hit(x, y, power = 18, cols = ["#fbf5b6", "#E8B84A", "#f0a742", "#ede7d4"]) {
    if (RM || overview) return;
    hitstop = Math.max(hitstop, 70);
    pendingShake = Math.max(pendingShake, power);
    burst(x / 4, y / 4, Math.round(power * 1.4), cols, 70 + power * 3);
    sfx("thud", power);
  }
  function hitEl(el, power) {
    const r = lr(el);
    hit(r.x + r.w / 2, r.y + r.h * .8, power || +(el.dataset.power || 18));
  }

  /* ---------- number counters ---------- */
  const tweens = [];
  function runCounters(root) {
    $$("[data-count]", root).forEach(el => {
      const end = +el.dataset.count;
      if (RM) { el.textContent = end; return; }
      el.textContent = "0";
      tweens.push({ el, end, t0: now + 250, dur: 900 + Math.min(end, 600), last: -1 });
    });
  }

  /* ---------- sound (WebAudio, synthesized, no files) ---------- */
  let muted = false, ac = null, noiseBuf = null;
  const muteBtn = $("#muteBtn");
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * .8, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    return ac;
  }
  function sfx(kind, power = 18) {
    if (muted || RM) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime, g = a.createGain(); g.connect(a.destination);
    if (kind === "whoosh") {
      const n = a.createBufferSource(); n.buffer = noiseBuf;
      const f = a.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + .35); f.frequency.exponentialRampToValueAtTime(500, t + .75);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.07, t + .3); g.gain.linearRampToValueAtTime(0, t + .8);
      n.connect(f); f.connect(g); n.start(t); n.stop(t + .8);
    } else if (kind === "thud") {
      const o = a.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + .28);
      g.gain.setValueAtTime(Math.min(.35, power / 70), t); g.gain.exponentialRampToValueAtTime(.001, t + .3);
      o.connect(g); o.start(t); o.stop(t + .32);
    } else {
      const o = a.createOscillator(); o.type = "square"; o.frequency.value = kind === "tick" ? 880 : 660;
      g.gain.setValueAtTime(.025, t); g.gain.exponentialRampToValueAtTime(.001, t + .06);
      o.connect(g); o.start(t); o.stop(t + .07);
    }
  }
  function setMuted(m) {
    muted = m; muteBtn.classList.toggle("snd", !m);
    $$("video").forEach(v => v.muted = m);
  }

  /* ---------- tileset showcase (slide 6) ---------- */
  const s6 = $("#s6");
  const biomes = $$("#biomeWin .biome"), thumbs = $$("#s6 .th"), marker = $("#s6 .marker"), bglow = $("#biomeGlow");
  const glowCols = ["rgba(89,174,61,.24)", "rgba(240,167,66,.26)", "rgba(105,149,211,.22)", "rgba(53,141,53,.2)", "rgba(223,48,32,.24)"];
  const rc = document.createElement("canvas"), rctx = rc.getContext("2d");
  let reveal = null, bz = 1, bShown = -1;
  function stopReveal() {
    if (!reveal) return;
    reveal.img.style.opacity = 1; reveal.b.classList.remove("revealing"); rc.remove(); reveal = null;
  }
  function showBiome(k, animate, dir = 1) {
    thumbs.forEach((t, i) => t.classList.toggle("cur", i === k));
    marker.style.transform = `translateX(${k * ((1200 - 64) / 5 + 16)}px)`;
    bglow.style.background = `radial-gradient(closest-side,${glowCols[k]},transparent)`;
    stopReveal();
    const b = biomes[k], img = $("img", b);
    if (!animate || RM || !img.complete || !img.naturalWidth) {
      biomes.forEach((x, i) => x.classList.toggle("vis", i === k)); bShown = k; return;
    }
    b.style.zIndex = ++bz; b.classList.add("vis", "revealing"); img.style.opacity = 0;
    const w = img.naturalWidth, h = img.naturalHeight;
    if (rc.width !== w || rc.height !== h) { rc.width = w; rc.height = h; }
    rctx.clearRect(0, 0, w, h); rctx.imageSmoothingEnabled = false;
    b.insertBefore(rc, $(".tgrid", b));
    const T = 64, cols = Math.ceil(w / T), rows = Math.ceil(h / T), tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cc = dir > 0 ? c : cols - 1 - c;
      tiles.push({ x: c * T, y: r * T, s: (cc / cols) * 620 + (r / rows) * 160 + Math.random() * 240 });
    }
    tiles.sort((a, b) => a.s - b.s);
    reveal = { b, img, k, t0: now, tiles, pf: 0, pd: 0 };
    bShown = k;
  }
  function stepReveal() {
    if (!reveal) return;
    const el = now - reveal.t0, t = reveal.tiles;
    rctx.fillStyle = "#fbda74";
    while (reveal.pf < t.length && t[reveal.pf].s <= el) { const q = t[reveal.pf++]; rctx.fillRect(q.x, q.y, 64, 64); }
    while (reveal.pd < reveal.pf && t[reveal.pd].s + 70 <= el) { const q = t[reveal.pd++]; rctx.clearRect(q.x, q.y, 64, 64); rctx.drawImage(reveal.img, q.x, q.y, 64, 64, q.x, q.y, 64, 64); }
    if (reveal.pd >= t.length) {
      const k = reveal.k; stopReveal();
      biomes.forEach((x, i) => { if (i !== k) x.classList.remove("vis"); });
    }
  }

  /* ---------- build steps ---------- */
  function applyStep(s, n, silent) {
    s.dataset.step = n;
    if (silent) s.classList.add("nt");
    $$("[data-b]", s).forEach(e => e.classList.toggle("on", +e.dataset.b <= n));
    $$("[data-only]", s).forEach(e => e.classList.toggle("on", silent ? false : +e.dataset.only === n));
    if (silent) {
      void s.offsetWidth; s.classList.remove("nt");
      $$("[data-only]", s).forEach(e => e.classList.toggle("on", +e.dataset.only === n));
    }
  }
  function onReveal(s, from, to) {
    if (to > from) {
      $$("[data-b]", s).forEach(e => {
        const b = +e.dataset.b; if (b <= from || b > to) return;
        if (e.dataset.hit) later(() => hitEl(e), +e.dataset.hit, s);
        runCounters(e);
      });
    }
    if (s === s6) showBiome(to, true, to >= from ? 1 : -1);
  }
  function setStep(n) {
    const s = slides[cur];
    n = clamp(n, 0, s._max);
    if (n === step) return false;
    const prev = step; step = n;
    applyStep(s, n, false);
    onReveal(s, prev, n);
    sfx(n > prev ? "tick" : "tock");
    updateHud();
    return true;
  }

  /* ---------- entering / leaving ---------- */
  function enter(s, n) {
    sprites.forEach(sp => { if (sp.slide === s) resetSprite(sp); });
    // counters visible at landing step
    $$("[data-count]", s).forEach(el => {
      const host = el.closest("[data-b]");
      if (host && !host.classList.contains("on")) return;
      if (n > 0 && host) { el.textContent = el.dataset.count; return; }
      runCounters({ querySelectorAll: () => [el] });
    });
    // impact on entrance elements
    if (n === 0) $$("[data-hit]:not(.spr)", s).forEach(el => {
      if (el.closest("[data-b]")) return;
      const d = parseFloat(el.style.getPropertyValue("--d")) || 0;
      later(() => hitEl(el), d + 120 + (+el.dataset.hit), s);
    });
    if (s === s6) showBiome(n, n === 0, 1);
    if (s.id === "s8") mortX = 2200;
  }
  function leave(s) {
    s.querySelectorAll("video").forEach(v => v.pause());
    sched = sched.filter(e => e.slide !== s);
    $$(".fxs", s).forEach(d => d.remove());
    $$("[data-mstyle]", s).forEach(e => { e.style.animation = ""; e.removeAttribute("data-mstyle"); });
  }

  /* ---------- transitions ---------- */
  let anims = [], trans = null, ghosts = [], hiddenEls = [], token = 0;
  function A(el, kf, opt) {
    const a = el.animate(kf, Object.assign({ duration: D, easing: EASE_IO, fill: "both" }, opt));
    anims.push(a); return a;
  }
  function finishTrans() {
    if (!trans) return;
    token++;
    anims.forEach(a => a.cancel()); anims = [];
    ghosts.forEach(g => g.remove()); ghosts = [];
    hiddenEls.forEach(e => e.style.visibility = ""); hiddenEls = [];
    if (trans.from) trans.from.classList.remove("leaving");
    trans = null;
  }
  function visibleIn(el, s) {
    for (let e = el; e && e !== s; e = e.parentElement) {
      if ((e.dataset.b && !e.classList.contains("on")) || (e.dataset.only && !e.classList.contains("on"))) return false;
    }
    return true;
  }
  function morphPairs(from, to) {
    if (!from || RM) return [];
    const out = [];
    $$("[data-morph]", to).forEach(b => {
      const a = $(`[data-morph="${b.dataset.morph}"]`, from);
      if (a && visibleIn(a, from) && visibleIn(b, to)) out.push({ a, b });
    });
    return out;
  }
  function ghostOf(el, r) {
    const g = el.cloneNode(true);
    g.classList.remove("in", "float"); g.removeAttribute("data-morph"); g.removeAttribute("data-b"); g.removeAttribute("data-hit");
    g.classList.add("ghost");
    g.style.cssText += `;position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;margin:0;transform-origin:0 0;animation:none;translate:none`;
    morphLayer.appendChild(g); ghosts.push(g); return g;
  }
  function depthIn(to, dx, dy) {
    to._depth.forEach(o => A(o.el, [{ translate: `${dx * o.d}px ${dy * o.d}px` }, { translate: "0px 0px" }], { easing: EASE_OUT, duration: D * 1.1 }));
  }
  const TR = {
    intro(from, to) {
      A(to, [{ opacity: 0, transform: "scale(1.15)" }, { opacity: 1, transform: "none" }], { duration: 1500, easing: EASE_OUT });
    },
    zoom(from, to, dir) {
      if (dir > 0) {
        A(from, [{ transform: "none", opacity: 1 }, { transform: "scale(1.7)", opacity: 0 }], { duration: D * .75, easing: EASE_IN });
        A(to, [{ transform: "scale(.6)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: D * .85, delay: D * .15, easing: EASE_OUT });
      } else {
        A(from, [{ transform: "none", opacity: 1 }, { transform: "scale(.6)", opacity: 0 }], { duration: D * .75, easing: EASE_IN });
        A(to, [{ transform: "scale(1.7)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: D * .85, delay: D * .15, easing: EASE_OUT });
      }
      depthIn(to, 0, 0);
    },
    pan(from, to, dir) {
      A(from, [{ transform: "none", opacity: 1 }, { transform: `translateX(${-dir * 38}%) scale(.86)`, opacity: .15 }]);
      A(to, [{ transform: `translateX(${dir * 100}%)` }, { transform: "none" }]);
      depthIn(to, dir * 30, 0);
    },
    rise(from, to, dir) {
      A(from, [{ transform: "none", opacity: 1 }, { transform: `translateY(${-dir * 32}%) scale(.88)`, opacity: .15 }]);
      A(to, [{ transform: `translateY(${dir * 100}%)` }, { transform: "none" }]);
      depthIn(to, 0, dir * 26);
    },
    cube(from, to, dir) {
      // 3D cube turn; opacity kept constant so each face stays a plain composited quad
      const p = "perspective(2600px)", o1 = dir > 0 ? "100% 50%" : "0% 50%", o2 = dir > 0 ? "0% 50%" : "100% 50%";
      A(from, [{ transform: `${p} translateX(0) rotateY(0deg)`, transformOrigin: o1 }, { transform: `${p} translateX(${-dir * 100}%) rotateY(${-dir * 90}deg)`, transformOrigin: o1 }]);
      A(to, [{ transform: `${p} translateX(${dir * 100}%) rotateY(${dir * 90}deg)`, transformOrigin: o2 }, { transform: `${p} translateX(0) rotateY(0deg)`, transformOrigin: o2 }]);
    },
    morph(from, to, dir, pairs) {
      A(to, [{ opacity: 0 }, { opacity: 1 }], { duration: D * .55, delay: D * .08, easing: "linear" });
      $$(".layer", from).forEach(l => A(l, [{ scale: "1" }, { scale: "1.12" }], { easing: EASE_IO }));
      $$(".layer", to).forEach(l => A(l, [{ scale: "1.12" }, { scale: "1" }], { easing: EASE_OUT, duration: D * 1.2 }));
      // measure everything first, then write (no layout thrash)
      const m = pairs.map(({ a, b }) => ({ a, b, ra: lr(a), rb: lr(b) }));
      m.forEach(({ a, b, ra, rb }) => {
        // the destination's entrance ancestors must be visible right away
        for (let e = b; e && e !== to; e = e.parentElement) if (e.classList.contains("in")) { e.style.animation = "show .01s both"; e.setAttribute("data-mstyle", ""); }
        const ga = ghostOf(a, ra), gb = ghostOf(b, rb);
        a.style.visibility = "hidden"; b.style.visibility = "hidden"; hiddenEls.push(a, b);
        const fwd = `translate(${rb.x - ra.x}px,${rb.y - ra.y}px) scale(${rb.w / ra.w},${rb.h / ra.h})`;
        const back = `translate(${ra.x - rb.x}px,${ra.y - rb.y}px) scale(${ra.w / rb.w},${ra.h / rb.h})`;
        A(ga, [{ transform: "none" }, { transform: fwd }], { easing: SPRING, duration: D * 1.05 });
        A(ga, [{ opacity: 1 }, { opacity: 0 }], { duration: D * .6, easing: "linear" });
        A(gb, [{ transform: back }, { transform: "none" }], { easing: SPRING, duration: D * 1.05 });
        A(gb, [{ opacity: 0 }, { opacity: 1 }], { duration: D * .6, easing: "linear" });
      });
    },
    fade(from, to) { A(to, [{ opacity: 0 }, { opacity: 1 }], { duration: D, easing: "linear" }); }
  };
  function transition(from, to, dir) {
    const pairs = morphPairs(from, to);
    let kind = !from ? "intro" : (dir > 0 ? to.dataset.tr : from.dataset.tr) || "pan";
    if (kind === "intro" && from) kind = "zoom";
    if (pairs.length) kind = "morph"; else if (kind === "morph") kind = "zoom";
    if (RM) kind = from ? "fade" : "fade";
    trans = { from, to };
    const my = ++token;
    TR[kind](from, to, dir, pairs);
    if (from && !RM) {
      A(sweep, [{ transform: `translateX(${dir > 0 ? -500 : 2300}px) skewX(-18deg)`, opacity: 0 }, { opacity: 1, offset: .35 }, { transform: `translateX(${dir > 0 ? 2300 : -500}px) skewX(-18deg)`, opacity: 0 }], { duration: D * .95, easing: EASE_IO });
      sfx("whoosh");
    }
    const longest = anims.reduce((m, a) => { const t = a.effect.getComputedTiming(); return Math.max(m, t.endTime); }, 0);
    later(() => { if (my === token) finishTrans(); }, longest + 20);
  }

  /* ---------- navigation ---------- */
  function go(i, land = 0) {
    if (i < 0 || i >= N) return;
    if (overview) { closeOverview(i); return; }
    if (i === cur) { setStep(land); return; }
    finishTrans();
    const from = slides[cur] || null, to = slides[i];
    const dir = cur < 0 ? 1 : (i > cur ? 1 : -1);
    land = clamp(land, 0, to._max);
    to.classList.remove("active", "leaving", "ovfull");
    applyStep(to, land, true);              // snaps hidden state + forces one style flush (restarts CSS entrances)
    if (from) { leave(from); from.classList.add("leaving"); from.classList.remove("active"); }
    to.classList.add("active");
    cur = i; step = land;
    enter(to, land);
    transition(from, to, dir);
    updateHud();
  }
  function next(skip) {
    if (overview) return moveSel(1);
    if (!skip && setStep(step + 1)) return;
    go(cur + 1, 0);
  }
  function prev(skip) {
    if (overview) return moveSel(-1);
    if (!skip && step > 0) { setStep(step - 1); return; }
    if (cur > 0) go(cur - 1, skip ? 0 : slides[cur - 1]._max);
  }

  /* ---------- HUD ---------- */
  const counter = $("#counter"), bar = $("#bar"), pips = $("#pips"), hudTitle = $("#hudTitle"), ctrlpos = $("#ctrlpos");
  let pipFor = -1;
  function updateHud() {
    const s = slides[cur];
    counter.innerHTML = `<b>${String(cur + 1).padStart(2, "0")}</b> / ${String(N).padStart(2, "0")}`;
    ctrlpos.textContent = `${cur + 1} / ${N}` + (s._max ? ` · ${step}/${s._max}` : "");
    hudTitle.textContent = s.dataset.title || "";
    if (pipFor !== cur) { pipFor = cur; pips.innerHTML = s._max ? "<i></i>".repeat(s._max + 1) : ""; }
    [...pips.children].forEach((p, k) => p.classList.toggle("on", k <= step));
    const total = slides.reduce((a, x) => a + x._max + 1, 0);
    const done = slides.slice(0, cur).reduce((a, x) => a + x._max + 1, 0) + step + 1;
    bar.style.transform = `scaleX(${done / total})`;
    const h = "#" + (cur + 1) + (step ? "." + step : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }

  /* ---------- overview grid (live: the real slides, scaled) ---------- */
  const OV = { cols: 3, s: .29 };
  (function layoutOverview() {
    const s = OV.s, cw = 1920 * s, ch = 1080 * s, rows = Math.ceil(N / OV.cols);
    const gx = (1920 - OV.cols * cw) / (OV.cols + 1), gy = (1080 - rows * ch) / (rows + 1);
    slides.forEach((sl, i) => {
      const x = gx + (i % OV.cols) * (cw + gx), y = gy + ((i / OV.cols) | 0) * (ch + gy);
      sl.style.setProperty("--ox", x + "px"); sl.style.setProperty("--oy", y + "px"); sl.style.setProperty("--os", s);
      sl._ov = { x, y };
    });
    ovsel.style.setProperty("--cw", cw + "px"); ovsel.style.setProperty("--ch", ch + "px");
  })();
  function moveSel(d) { ovSel = clamp(ovSel + d, 0, N - 1); placeSel(); }
  function placeSel() { const o = slides[ovSel]._ov; ovsel.style.transform = `translate(${o.x}px,${o.y}px)`; }
  let ovTimer = null;
  function openOverview() {
    if (overview) return;
    finishTrans();
    clearTimeout(ovTimer); stage.classList.remove("ovout");
    overview = true; ovSel = cur; placeSel();
    slides.forEach((s, i) => { if (i !== cur) s.classList.add("ovfull"); s.querySelectorAll("video").forEach(v => v.pause()); });
    stage.classList.add("ovpre"); void stage.offsetWidth;
    stage.classList.remove("ovpre"); stage.classList.add("ov");
    P.length = 0; fx.clearRect(0, 0, 480, 270);
    sfx("whoosh");
  }
  function closeOverview(j) {
    if (!overview) return;
    overview = false;
    stage.classList.remove("ov"); stage.classList.add("ovout");
    if (j !== cur) {
      const old = slides[cur], to = slides[j];
      leave(old); old.classList.remove("active"); old.classList.add("ovfull");
      to.classList.remove("ovfull");
      applyStep(to, 0, true);
      to.classList.add("active");
      cur = j; step = 0; enter(to, 0); updateHud();
    }
    sfx("whoosh");
    clearTimeout(ovTimer);
    ovTimer = setTimeout(() => { stage.classList.remove("ovout"); slides.forEach(s => s.classList.remove("ovfull")); }, 800);
  }

  /* ---------- input ---------- */
  function toggleFull() { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); }
  function toggleHelp(v) { help.classList.toggle("on", v ?? !help.classList.contains("on")); }
  const crt = $("#crt"), black = $("#black");
  addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.tagName === "VIDEO") e.target.blur();
    const k = e.key;
    if (overview) {
      if (k === "ArrowRight") moveSel(1); else if (k === "ArrowLeft") moveSel(-1);
      else if (k === "ArrowDown") moveSel(OV.cols); else if (k === "ArrowUp") moveSel(-OV.cols);
      else if (k === "Enter" || k === " ") closeOverview(ovSel);
      else if (k === "Escape" || k === "g" || k === "G") closeOverview(cur);
      else if (/^[1-9]$/.test(k) && +k <= N) closeOverview(+k - 1);
      else return;
      e.preventDefault(); return;
    }
    switch (k) {
      case "ArrowRight": case "ArrowDown": case "PageDown": case " ": case "Enter": e.preventDefault(); next(e.shiftKey); break;
      case "ArrowLeft": case "ArrowUp": case "PageUp": case "Backspace": e.preventDefault(); prev(e.shiftKey); break;
      case "Home": e.preventDefault(); go(0); break;
      case "End": e.preventDefault(); go(N - 1); break;
      case "Escape": if (help.classList.contains("on")) toggleHelp(false); else openOverview(); break;
      case "g": case "G": openOverview(); break;
      case "f": case "F": toggleFull(); break;
      case "m": case "M": setMuted(!muted); break;
      case "c": case "C": crt.classList.toggle("on"); break;
      case "b": case "B": case ".": black.classList.toggle("on"); break;
      case "?": case "/": case "h": case "H": toggleHelp(); break;
      default: if (/^[1-9]$/.test(k) && +k <= N) go(+k - 1);
    }
  });
  let down = null;
  addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  addEventListener("pointerup", e => {
    const d = down; down = null;
    if (!d) return;
    if (e.target.closest("#ctrl,video,a,button,.box")) return;
    if (e.target === help) { toggleHelp(false); return; }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (e.pointerType !== "mouse") {
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? next() : prev(); return; }
      if (Math.abs(dx) > 12 || Math.abs(dy) > 12) return;
    } else if (e.button !== 0) return;
    if (overview) { const s = e.target.closest(".slide"); if (s) closeOverview(slides.indexOf(s)); return; }
    next();
  });
  addEventListener("contextmenu", e => { e.preventDefault(); if (!overview) prev(); });
  ctrl.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const a = b.dataset.act;
    if (a === "prev") prev(); else if (a === "next") next();
    else if (a === "overview") overview ? closeOverview(cur) : openOverview();
    else if (a === "full") toggleFull(); else if (a === "mute") setMuted(!muted);
    else if (a === "crt") crt.classList.toggle("on"); else if (a === "help") toggleHelp();
    b.blur();
  });

  /* control bar auto-hide */
  let ctrlTimer = null, overCtrl = false;
  function showCtrl() {
    ctrl.classList.remove("hide"); clearTimeout(ctrlTimer);
    ctrlTimer = setTimeout(() => { if (!overCtrl) ctrl.classList.add("hide"); }, 2200);
  }
  ctrl.addEventListener("pointerenter", () => { overCtrl = true; showCtrl(); });
  ctrl.addEventListener("pointerleave", () => { overCtrl = false; showCtrl(); });

  /* mouse: parallax target, tilt, overview hover */
  let mx = 0, my = 0, px = 0, py = 0;
  let tiltEl = null, tiltRect = null, ttx = 0, tty = 0, tx = 0, ty = 0;
  addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") showCtrl();
    mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5;
    if (overview) {
      const s = e.target.closest?.(".slide"); if (s) { const i = slides.indexOf(s); if (i !== ovSel) { ovSel = i; placeSel(); } }
      return;
    }
    const t = RM ? null : e.target.closest?.(".tilt");
    if (t !== tiltEl) {
      if (tiltEl) { tiltEl.style.transition = ""; tiltEl.style.transform = ""; }
      tiltEl = t; tx = ty = 0;
      if (t) { tiltRect = t.getBoundingClientRect(); t.style.transition = "none"; }
    }
    if (tiltEl) { ttx = (e.clientX - tiltRect.left) / tiltRect.width - .5; tty = (e.clientY - tiltRect.top) / tiltRect.height - .5; }
  });
  document.addEventListener("pointerleave", () => { if (tiltEl) { tiltEl.style.transition = ""; tiltEl.style.transform = ""; tiltEl = null; } });

  /* videos: real durations */
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  $$("[data-dur]").forEach(lbl => {
    const v = document.getElementById(lbl.dataset.dur);
    const set = () => { if (isFinite(v.duration)) lbl.textContent = fmt(v.duration); };
    v.addEventListener("loadedmetadata", set); set();
  });

  /* ---------- the one rAF loop ---------- */
  const mort = $("#mort");
  let mortX = -300, last = performance.now(), dustAcc = 0;
  function loop(t) {
    now = t;
    const dt = Math.min(100, t - last); last = t;
    if (perf.on) perf.dts.push(dt);
    const active = slides[cur];

    // scheduled callbacks
    if (sched.length) {
      const due = sched.filter(e => e.t <= t);
      if (due.length) { sched = sched.filter(e => e.t > t); due.forEach(e => e.fn()); }
    }

    const frozen = hitstop > 0;
    if (frozen) { hitstop -= dt; if (hitstop <= 0 && pendingShake) { shakeAmp = pendingShake; pendingShake = 0; } }

    // sprites
    if (!frozen) for (const s of sprites) {
      const sl = s.slide;
      if (!(sl === active || (overview) || sl.classList.contains("leaving"))) continue;
      if (!s.size) { s.size = s.el.offsetHeight || 48; drawSprite(s); }
      if (s.wait > 0) { s.wait -= dt; continue; }
      const seg = s.seq[s.part], fd = 1000 / seg.fps;
      s.acc += dt; if (s.acc < fd) continue; s.acc -= fd; if (s.acc > fd) s.acc = 0;
      if (s.reset) { resetSprite(s); continue; }
      s.frame++;
      if (s.frame >= seg.n) {
        if (s.part === s.seq.length - 1 && s.hold) { s.frame = seg.n - 1; s.wait = s.hold; s.reset = true; continue; }
        s.frame = 0; s.part = (s.part + 1) % s.seq.length;
      }
      drawSprite(s);
      if (overview || RM) continue;
      if (s.frame === s.hit && sl === active) {
        s.wait = 60;
        if (s.impact) { spawnFx(s, "assets/sprites/hit_impact.png", 4, 128, 18, 60, 10); const r = s.rect || (s.rect = lr(s.el)); burst((r.x + r.w * .75) / 4, (r.y + r.h * .55) / 4, 10, ["#fbf5b6", "#E8B84A"], 90); shakeAmp = Math.max(shakeAmp, 5); }
        else shakeAmp = Math.max(shakeAmp, 3);
      }
      if (s.blood && s.frame === 1 && sl === active) spawnFx(s, "assets/sprites/blood_a.png", 5, 128, 16, 30, -20);
    }
    // fx sprites
    for (let i = fxSprites.length - 1; i >= 0; i--) {
      const f = fxSprites[i]; f.t += dt;
      const fr = Math.floor(f.t / f.fd);
      if (fr >= f.frames || !f.d.isConnected) { f.d.remove(); fxSprites.splice(i, 1); continue; }
      if (fr !== f.f) { f.f = fr; f.im.style.transform = `translate3d(${-fr * f.size}px,0,0)`; }
    }
    // counters
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; if (t < w.t0) continue;
      const p = Math.min(1, (t - w.t0) / w.dur), v = Math.round(w.end * (1 - Math.pow(1 - p, 3)));
      if (v !== w.last) { w.last = v; w.el.textContent = v; }
      if (p >= 1) tweens.splice(i, 1);
    }
    // tile reveal
    stepReveal();
    // mort gallop + hoof dust
    if (active && active.id === "s8" && !overview) {
      if (!RM) mortX -= dt * .42;
      if (mortX < -400) mortX = 2200;
      mort.style.transform = `translate3d(${RM ? 1400 : Math.round(mortX)}px,0,0)`;
      dustAcc += dt;
      if (!RM && dustAcc > 70) { dustAcc = 0; if (P.length < MAXP) P.push({ x: (mortX + 200) / 4, y: (1080 - 60) / 4, vx: rand(10, 30), vy: rand(-14, -4), g: 30, drag: 1.5, life: rand(.4, .9), max: 0, c: pick(["#d2802d", "#bab197", "#915930"]), s: Math.random() < .4 ? 2 : 1, k: .8 }); }
    }
    // parallax (individual `translate` property: composes with transform animations)
    px += (mx - px) * .06; py += (my - py) * .06;
    if (!RM && active && !overview) for (const o of active._depth) {
      const nx = +(px * o.d * 2).toFixed(1), ny = +(py * o.d * 2).toFixed(1);
      if (nx !== o.x || ny !== o.y) { o.x = nx; o.y = ny; o.el.style.translate = `${nx}px ${ny}px`; }
    }
    // tilt
    if (tiltEl && !overview) {
      tx += (ttx - tx) * .18; ty += (tty - ty) * .18;
      tiltEl.style.transform = `perspective(900px) rotateX(${(-ty * 12).toFixed(2)}deg) rotateY(${(tx * 14).toFixed(2)}deg) scale(1.03)`;
    }
    // particles
    if (!overview && !RM && !frozen) stepParticles(dt, active ? active.dataset.pfx : "", px, py);
    // screen shake
    if (shakeAmp > .4 && !frozen) {
      world.style.transform = `translate3d(${Math.round((Math.random() - .5) * shakeAmp)}px,${Math.round((Math.random() - .5) * shakeAmp)}px,0)`;
      shakeAmp *= Math.pow(.86, dt / 16);
    } else if (shakeAmp && !frozen) { shakeAmp = 0; world.style.transform = ""; }
    requestAnimationFrame(loop);
  }

  /* ---------- pre-decode images, then start ---------- */
  const srcs = new Set();
  $$("img").forEach(i => srcs.add(i.src));
  $$(".bg").forEach(b => { const m = /url\(["']?([^"')]+)/.exec(b.style.backgroundImage); if (m) srcs.add(new URL(m[1], location.href).href); });
  sprites.forEach(s => s.imgs.forEach(i => srcs.add(i.src)));
  ["assets/sprites/hit_impact.png", "assets/sprites/blood_a.png"].forEach(s => srcs.add(new URL(s, location.href).href));
  const decodes = [...srcs].map(src => { const im = new Image(); im.src = src; return im.decode().catch(() => { }); });
  const ready = Promise.race([Promise.all([document.fonts.ready, ...decodes]), new Promise(r => setTimeout(r, 2500))]);

  setMuted(false);
  ready.then(() => {
    const m = /^#(\d+)(?:\.(\d+))?/.exec(location.hash);
    const start = m ? clamp(+m[1] - 1, 0, N - 1) : 0;
    go(start, m && m[2] ? +m[2] : 0);
    requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
    showCtrl();
  });

  /* test hooks */
  window.__deck = { go, next, prev, openOverview, closeOverview, get state() { return { cur, step, overview, trans: !!trans }; } };
})();
