/*
 * Film assembly: builds every scene as a timed clip on one seekable timeline, plus the global overlay
 * (scene titles, the journey rail motif, captions). Scenes overlap by their transition window so a shot can
 * dissolve or match-cut into the next; the incoming scene sits above the outgoing one.
 *
 * Scene modules register RS.SCENES[id] = (ctx) => void, where ctx gives:
 *   svg, layers, tl, at(localT) → global time, dur, sc (timing incl. vo/words), S (strings), rtl, lang,
 *   vo(i) → {at, end, word(n)} in LOCAL time, transIn (s) — the overlap before local 0.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;
  RS.SCENES = RS.SCENES || {};
  // per-scene incoming transition length (seconds of overlap with the previous scene)
  RS.TRANSITION_IN = { "s02-discover": 0.8, "s03-coordinator": 1.0, "s04-consultant": 1.0, "s05-clarity": 0.9, "s06-decision": 0.7,
    "s07-appointments": 0.9, "s08-arrival": 1.0, "s09-care": 1.0, "s10-followup": 1.0 };
  // which journey-rail stage each scene lights (index into S.rail), and whether the scene shows a title
  // scenes whose first beat is a tight insert hold the title until the reveal (local seconds)
  RS.TITLE_AT = { "s02-discover": 6.2, "s03-coordinator": 3.7, "s05-clarity": 5.0 };
  // RTL titles normally sit top-right; these scenes keep the right side for the picture (scene 2: the phone)
  RS.TITLE_FLIP_RTL = { "s02-discover": true };
  RS.CAPTION_UNTIL = { "s10-followup": 7.4 }; // scene-local
  RS.TITLE_OUT = { "s06-decision": 4.2, "s07-appointments": 3.6, "s08-arrival": 4.2, "s09-care": 5.3 }; // scene-local; default is 1.1s before the scene ends
  RS.RAIL_STAGE = { "s02-discover": 0, "s03-coordinator": 1, "s04-consultant": 2, "s05-clarity": 3, "s06-decision": 4,
    "s07-appointments": 5, "s08-arrival": 5, "s09-care": 6, "s10-followup": 7 };

  RS.CUES = [];
  RS.film = function (opts) {
    const lang = opts.lang, rtl = lang === "ar";
    const T = window.RS_TIMINGS[lang];
    const S = RS.STRINGS[lang];
    const root = document.querySelector("[data-composition-id]");
    const compId = root.getAttribute("data-composition-id");
    const tl = gsap.timeline({ paused: true });
    const only = opts.only ? new Set(opts.only) : null;

    T.scenes.forEach((sc, i) => {
      if (only && !only.has(sc.id)) return;
      const tin = i === 0 ? 0 : RS.TRANSITION_IN[sc.id] || 0.6;
      const sec = document.createElement("section");
      sec.className = "clip scene";
      sec.id = sc.id;
      sec.setAttribute("data-start", (sc.start - tin).toFixed(3));
      sec.setAttribute("data-duration", (sc.dur + tin + (i === T.scenes.length - 1 ? 0 : 0.05)).toFixed(3));
      sec.setAttribute("data-track-index", String(i % 2 ? 2 : 1));
      root.appendChild(sec);
      const svg = el("svg", { viewBox: "0 0 1920 1080", xmlns: "http://www.w3.org/2000/svg", preserveAspectRatio: "xMidYMid slice" }, sec);
      const shell = el("g", { class: "shell" }, svg); // fades for dissolves; never the clip itself
      const ctx = {
        svg, shell, tl, sc, S, rtl, lang, dur: sc.dur, transIn: tin, index: i,
        at: (t) => sc.start + t,
        // sound cues authored next to the action that causes them (read back by tools/audio/mix.py)
        sfx: (t, name, gain = 0, o = {}) => RS.CUES.push({ kind: "sfx", t: +(sc.start + t).toFixed(3), name, gain, scene: sc.id, ...o }),
        // ambience bed; o.from / o.to (scene-local) split a scene between two beds
        amb: (name, gain = 0, o = {}) => {
          const { from, to, ...rest } = o;
          RS.CUES.push({ kind: "amb", t: +(sc.start + (from ?? -tin)).toFixed(3), end: +(sc.start + (to ?? sc.dur + (o.tail ?? 0.8))).toFixed(3), name, gain, scene: sc.id, ...rest });
        },
        vo: (k = 0) => {
          const v = sc.vo[k];
          return { at: v.at + v.speech[0], end: v.at + v.speech[1], word: (n) => v.words[Math.min(n, v.words.length - 1)].s, words: v.words };
        },
      };
      if (tin > 0) tl.fromTo(shell, { opacity: 0 }, { opacity: 1, duration: tin, ease: "sine.inOut" }, sc.start - tin);
      const build = RS.SCENES[sc.id];
      if (build) build(ctx);
      else el("text", { x: 960, y: 540, "text-anchor": "middle", "font-size": 40 }, shell).textContent = sc.id;
    });

    if (!opts.noOverlay) RS.overlay(root, tl, { ...T, scenes: T.scenes.filter((sc) => !only || only.has(sc.id)) }, S, rtl, opts);
    return { tl, compId };
  };

  // ---------------------------------------------------------------- overlay: titles, journey rail, captions
  RS.overlay = function (root, tl, T, S, rtl, opts) {
    const ov = document.createElement("div");
    ov.className = "clip overlay";
    ov.setAttribute("data-start", "0");
    ov.setAttribute("data-duration", T.total.toFixed(3));
    ov.setAttribute("data-track-index", "5");
    root.appendChild(ov);
    const svg = el("svg", { viewBox: "0 0 1920 1080", xmlns: "http://www.w3.org/2000/svg" }, ov);
    const W = 1920;
    const sx = (x) => (rtl ? W - x : x);
    const anchor = "start";
    const headCls = rtl ? "rs-head-ar" : "rs-head", bodyCls = rtl ? "rs-body-ar" : "rs-body";

    // soft scrim at the reading-start top corner so titles stay legible on any shot
    const scrim = el("rect", { x: 0, y: 0, width: 1920, height: 300, fill: RS.linear(svg, "ov-scrim", rtl
      ? [[0, "#f7f4ee", 0], [0.45, "#f7f4ee", 0], [1, "#f7f4ee", 0.88]] : [[0, "#f7f4ee", 0.88], [0.55, "#f7f4ee", 0], [1, "#f7f4ee", 0]], 0, 0, 1, 0.35), opacity: 0 }, svg);

    T.scenes.forEach((sc) => {
      const idx = sc.index;
      const title = S.titles[idx];
      const stage = RS.RAIL_STAGE[sc.id];
      if (!title || stage === undefined || opts.noTitles) return;
      const g = el("g", { class: "title", opacity: 0 }, svg);
      const n = S.rail.length, step = 46, y = 214;
      const x0 = 96 + 9;
      // a flipped RTL title sits at the left margin: text grows rightwards from x, the rail still fills right-to-left
      const flip = rtl && RS.TITLE_FLIP_RTL[sc.id];
      const tx = flip ? (x) => x : sx, ta = flip ? "end" : anchor;
      const rx = flip ? (x) => 2 * x0 + (n - 1) * step - x : sx;
      // eyebrow: coral rule + stage label, then the title — the site's hero rhythm
      el("rect", { x: rtl && !flip ? W - 96 - 30 : 96, y: 92, width: 30, height: 3, rx: 1.5, fill: RS.T.coral }, g);
      const eb = el("text", { x: tx(96 + 44), y: 100, class: bodyCls, "font-size": 21, "font-weight": 700, fill: RS.T.petrol600, "letter-spacing": rtl ? 0 : 2.2, direction: rtl ? "rtl" : "ltr", "text-anchor": ta }, g);
      eb.textContent = (rtl ? S.rail[stage] : S.rail[stage].toUpperCase());
      const tt = el("text", { x: tx(96), y: 168, class: headCls, "font-size": 58, "font-weight": 600, fill: RS.T.heading, "letter-spacing": rtl ? 0 : -1.2, direction: rtl ? "rtl" : "ltr", "text-anchor": ta }, g);
      tt.textContent = title;
      // journey rail: eight stations, filled up to the current stage
      const rail = el("g", { class: "rail" }, g);
      el("line", { x1: rx(x0), y1: y, x2: rx(x0 + (n - 1) * step), y2: y, stroke: RS.T.lineStrong, "stroke-width": 2 }, rail);
      const prog = el("line", { x1: rx(x0), y1: y, x2: rx(x0 + Math.max(0, stage - 1) * step), y2: y, stroke: RS.T.petrol400, "stroke-width": 3, "stroke-linecap": "round" }, rail);
      for (let k = 0; k < n; k++) {
        const done = k < stage, cur = k === stage;
        el("circle", { cx: rx(x0 + k * step), cy: y, r: cur ? 9 : 6, fill: done || cur ? RS.T.petrol600 : RS.T.paper, stroke: done || cur ? RS.T.petrol600 : RS.T.lineStrong, "stroke-width": 2 }, rail);
        if (cur) {
          const halo = el("circle", { cx: rx(x0 + k * step), cy: y, r: 15, fill: "none", stroke: RS.T.coral, "stroke-width": 2, opacity: 0.9 }, rail);
          tl.fromTo(halo, { attr: { r: 9 }, opacity: 0 }, { attr: { r: 15 }, opacity: 0.9, duration: 0.7, ease: "power2.out" }, sc.start + (RS.TITLE_AT[sc.id] ?? 0.6) + 0.45);
        }
      }
      tl.fromTo(prog, { attr: { x2: rx(x0 + Math.max(0, stage - 1) * step) } }, { attr: { x2: rx(x0 + stage * step) }, duration: 0.8, ease: "power2.inOut" }, sc.start + (RS.TITLE_AT[sc.id] ?? 0.6) + 0.25);
      // title in on the scene's first spoken phrase (or 0.6s in), out before the cut
      const vin = Math.min(sc.vo[0].at + sc.vo[0].speech[0], 1.2);
      const tIn = sc.start + (RS.TITLE_AT[sc.id] ?? Math.max(0.5, vin - 0.2)), tOut = sc.start + (RS.TITLE_OUT[sc.id] ?? sc.dur - 1.1);
      tl.fromTo(g, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, tIn);
      tl.to(g, { opacity: 0, y: -6, duration: 0.6, ease: "power1.in" }, tOut);
      tl.fromTo(scrim, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "sine.out" }, tIn - 0.1);
      tl.to(scrim, { opacity: 0, duration: 0.6, ease: "sine.in" }, tOut + 0.05);
    });

    if (opts.noCaptions) return;
    // captions: HTML for native Arabic shaping and wrapping; one element per chunk, faded in/out
    const capWrap = document.createElement("div");
    capWrap.style.cssText = "position:absolute;left:0;right:0;bottom:64px;display:flex;justify-content:center;pointer-events:none;";
    ov.appendChild(capWrap);
    // burned captions stop where an end card shows the words itself (the SRT keeps the full narration)
    const caps = T.scenes.flatMap((sc) => sc.captions.filter((c) => RS.CAPTION_UNTIL[sc.id] == null || c.s < sc.start + RS.CAPTION_UNTIL[sc.id]));
    caps.forEach((c, k) => {
      const next = caps[k + 1];
      const d = document.createElement("div");
      d.className = rtl ? "cap rs-body-ar" : "cap rs-body";
      d.dir = rtl ? "rtl" : "ltr";
      d.lang = rtl ? "ar" : "en";
      d.textContent = c.text;
      d.style.cssText = `position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:max-content;max-width:1240px;padding:10px 26px 12px;border-radius:12px;background:rgba(247,244,238,0.9);color:#13292e;font-size:${rtl ? 38 : 36}px;font-weight:600;line-height:1.3;text-align:center;box-shadow:0 10px 30px -18px rgba(19,41,46,.45);opacity:0;`;
      capWrap.appendChild(d);
      tl.fromTo(d, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, Math.max(0, c.s));
      // never two captions on screen at once
      tl.to(d, { opacity: 0, duration: 0.12, ease: "none" }, Math.max(0.2, next ? Math.min(c.e + 0.05, next.s - 0.12) : c.e + 0.05));
    });
  };

  /** Drive rigs across a scene's window (global times). */
  RS.driveScene = function (ctx, rigs, extra) {
    const clock = { t: -ctx.transIn };
    const render = () => { rigs.forEach((r) => r.pose(clock.t)); if (extra) extra(clock.t); };
    ctx.tl.fromTo(clock, { t: -ctx.transIn }, { t: ctx.dur + 0.05, duration: ctx.dur + ctx.transIn + 0.05, ease: "none", onUpdate: render }, ctx.at(-ctx.transIn));
    render();
  };

  /** Scene-local camera with parallax (times are local). */
  RS.sceneCamera = function (ctx, layers, keys, origin) {
    RS.parallax(ctx.tl, layers, keys.map((k) => ({ ...k, t: ctx.at(k.t) })), origin);
  };
})();
