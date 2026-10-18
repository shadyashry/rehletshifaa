/*
 * Editions: purpose-built cut-downs that reuse the master's scene modules (no duplicated choreography).
 *
 * Each edition is a list of segments: a scene and a window of its scene-local time, defined against that scene's
 * own narration so each language keeps its own timing. A segment's scene is built on its own sub-timeline and the
 * root plays the window with `sub.tweenFromTo(from, to)` — seek-safe, and no tween ever sits at a negative time.
 * Sound cues and narration placements are remapped to edition time, so the same mixer renders the edition.
 *
 * Works in the browser (RS.filmEdition) and in Node (plan(), used by tools/build_film.mjs for the duration).
 */
(function (root) {
  const XF = 0.6; // cross-dissolve between segments
  const PAD = 3; // sub-timeline offset so scene-local negative times stay positive
  const voIn = (sc, k = 0) => sc.vo[k].at + sc.vo[k].speech[0];
  const voEnd = (sc, k = 0) => sc.vo[k].at + sc.vo[k].speech[1];

  const EDITIONS = {
    // the patient's story, vertical: worry → a simple first step → clarity → her decision → the brand
    "patient-9x16": {
      w: 1080, h: 1920, layout: "vertical",
      segments: [
        // v: vertical framing — a square crop following the subject (fx keys, scene-local), or the full 16:9 band
        { id: "s01-uncertainty", from: () => 0, to: (sc) => voEnd(sc) + 0.6, v: { fx: [[0, 820]] } },
        { id: "s02-discover", from: (sc) => voIn(sc) - 0.5, to: (sc) => voEnd(sc) + 0.5, v: { fx: [[0, 1150]] } },
        // the estimate is only ever shown whole, with its non-binding note — so this one keeps the 16:9 band
        { id: "s05-clarity", from: (sc) => voIn(sc) - 0.6, to: (sc) => voEnd(sc) + 0.4, v: { band: true },
          chip: (S) => `${S.proposal.est} · ${S.proposal.estNote}` },
        { id: "s06-decision", from: (sc) => voIn(sc) - 1.2, to: (sc) => voEnd(sc) + 0.7, line: 0,
          v: { fx: (rtl) => [[0, 960], [4.8, rtl ? 1360 : 560], [6.3, rtl ? 1360 : 560], [7.4, 960]] },
          chip: (S) => `${S.proposal.est} · ${S.proposal.estNote}`, chipAt: 4.9, chipTo: 6.6 },
        { id: "s10-followup", from: () => 6.3, to: (sc) => voEnd(sc, 1) + 2.6, line: 1, endCard: true, v: { fx: [[0, 960]] } },
      ],
    },
    // for partners and referrers: who does what, in which order — coordinator, consultant, plan, care → brand
    "business-16x9": {
      w: 1920, h: 1080, layout: "landscape",
      segments: [
        { id: "s03-coordinator", from: (sc) => voIn(sc) - 1.2, to: (sc) => voEnd(sc) + 0.6 },
        { id: "s04-consultant", from: (sc) => voIn(sc) - 0.6, to: (sc) => voEnd(sc) + 0.5 },
        { id: "s07-appointments", from: (sc) => voIn(sc) - 0.5, to: (sc) => voEnd(sc) + 0.6 },
        { id: "s09-care", from: (sc) => voIn(sc) - 0.6, to: (sc) => voEnd(sc) + 0.4 },
        { id: "s10-followup", from: () => 6.3, to: (sc) => voEnd(sc, 1) + 2.6, line: 1 },
      ],
    },
  };

  /** Resolve an edition against one language's timing: segment windows and edition start times. */
  function plan(name, T) {
    const E = EDITIONS[name];
    if (!E) throw new Error(`unknown edition ${name}`);
    let t = 0;
    const segments = E.segments.map((s, i) => {
      const sc = T.scenes.find((x) => x.id === s.id);
      const from = +s.from(sc).toFixed(3), to = +Math.min(s.to(sc), sc.dur).toFixed(3);
      const start = i === 0 ? 0 : +(t - XF).toFixed(3);
      t = start + (to - from);
      return { ...s, sc, from, to, len: +(to - from).toFixed(3), start, xin: i === 0 ? 0 : XF };
    });
    return { name, ...E, segments, total: +t.toFixed(3) };
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { EDITIONS, plan, XF };
    return;
  }

  const RS = root.RS;
  const el = RS.el;
  RS.EDITIONS = EDITIONS;
  RS.planEdition = plan;

  RS.filmEdition = function (opts) {
    const lang = opts.lang, rtl = lang === "ar";
    const T = window.RS_TIMINGS[lang];
    const S = RS.STRINGS[lang];
    const P = plan(opts.edition, T);
    const vertical = P.layout === "vertical";
    const rootEl = document.querySelector("[data-composition-id]");
    const compId = rootEl.getAttribute("data-composition-id");
    const tl = gsap.timeline({ paused: true });
    RS.VO = [];
    const SQ = { y: 470, h: 1080 }, BAND = { y: 702, h: 608 }; // square crop / 16:9 band, same visual centre

    if (vertical) {
      const bg = document.createElement("div");
      bg.className = "clip edition-bg";
      bg.setAttribute("data-start", "0");
      bg.setAttribute("data-duration", P.total.toFixed(3));
      bg.setAttribute("data-track-index", "0");
      bg.style.cssText = `position:absolute;inset:0;background:${RS.T.paper};`;
      rootEl.appendChild(bg);
    }

    P.segments.forEach((g, i) => {
      const sc = g.sc;
      const ed = (t) => +(g.start + (t - g.from)).toFixed(3); // scene-local → edition time
      const sec = document.createElement("section");
      sec.className = "clip scene";
      sec.id = `${sc.id}-${i}`;
      sec.setAttribute("data-start", g.start.toFixed(3));
      sec.setAttribute("data-duration", (g.len + (i === P.segments.length - 1 ? 0 : 0.05)).toFixed(3));
      sec.setAttribute("data-track-index", String(i % 2 ? 2 : 1));
      rootEl.appendChild(sec);
      const svg = el("svg", { viewBox: "0 0 1920 1080", xmlns: "http://www.w3.org/2000/svg", preserveAspectRatio: "xMidYMid slice" }, sec);
      const fxKeys = vertical && g.v && g.v.fx ? (typeof g.v.fx === "function" ? g.v.fx(rtl) : g.v.fx) : null;
      if (vertical && fxKeys) {
        svg.setAttribute("style", `position:absolute;left:0;top:${SQ.y}px;width:1080px;height:${SQ.h}px;`);
        svg.setAttribute("viewBox", `${fxKeys[0][1] - 540} 0 1080 1080`);
      } else if (vertical) svg.setAttribute("style", `position:absolute;left:0;top:${BAND.y}px;width:1080px;height:${BAND.h}px;`);
      const shell = el("g", { class: "shell" }, svg);
      const sub = gsap.timeline({ paused: true });
      const tin = RS.TRANSITION_IN[sc.id] || 0;
      const ctx = {
        svg, shell, tl: sub, sc, S, rtl, lang, dur: sc.dur, transIn: tin, index: sc.index - 1,
        at: (t) => t + PAD,
        sfx: (t, name, gain = 0, o = {}) => {
          if (t < g.from - 0.15 || t > g.to) return;
          RS.CUES.push({ kind: "sfx", t: ed(t), name, gain, scene: sc.id, ...o });
        },
        amb: (name, gain = 0, o = {}) => {
          const { from, to, ...rest } = o;
          const a = Math.max(g.from, from ?? -tin), b = Math.min(g.to + 0.6, to ?? sc.dur + 0.8);
          if (b <= a) return;
          RS.CUES.push({ kind: "amb", t: ed(a), end: ed(b), name, gain, scene: sc.id, ...rest, fadeIn: i === 0 ? 1.0 : XF + 0.3 });
        },
        vo: (k = 0) => {
          const v = sc.vo[k];
          return { at: v.at + v.speech[0], end: v.at + v.speech[1], word: (n) => v.words[Math.min(n, v.words.length - 1)].s, words: v.words };
        },
      };
      RS.SCENES[sc.id](ctx);
      // the square crop pans with the subject, on the scene's own clock
      if (fxKeys) for (let k = 1; k < fxKeys.length; k++) {
        const [t0, a] = fxKeys[k - 1], [t1, b] = fxKeys[k];
        sub.fromTo(svg, { attr: { viewBox: `${a - 540} 0 1080 1080` } }, { attr: { viewBox: `${b - 540} 0 1080 1080` }, duration: Math.max(0.05, t1 - t0 > 1.2 ? 1.0 : t1 - t0), ease: "power2.inOut", immediateRender: false }, ctx.at(t1 - (t1 - t0 > 1.2 ? 1.0 : t1 - t0)));
      }
      tl.add(sub.tweenFromTo(g.from + PAD, g.to + PAD, { ease: "none" }), g.start);
      if (g.xin) tl.fromTo(shell, { opacity: 0 }, { opacity: 1, duration: g.xin, ease: "sine.inOut" }, g.start);
      // gone once the next segment has dissolved in (a smaller band must never reveal the previous shot)
      if (i < P.segments.length - 1) tl.set(shell, { opacity: 0 }, g.start + g.len + 0.02);
      // narration: the scene's chosen line(s), placed where they fall inside the window
      sc.vo.forEach((v, k) => {
        if (g.line != null && k !== g.line) return;
        if (v.at + v.speech[0] < g.from - 0.05 || v.at + v.speech[1] > g.to + 0.05) return;
        RS.VO.push({ scene: sc.id, t: ed(v.at), file: v.file, dur: v.dur, speech: v.speech });
      });
    });

    // pseudo-scenes in edition time, so titles and captions reuse the master's rules
    const mapped = P.segments.map((g) => {
      const sc = g.sc, shift = g.start - g.from - sc.start;
      const captions = sc.captions
        .filter((c) => c.s - sc.start >= g.from - 0.05 && c.s - sc.start < g.to - 0.2)
        .filter((c) => RS.CAPTION_UNTIL[sc.id] == null || c.s < sc.start + RS.CAPTION_UNTIL[sc.id])
        .map((c) => ({ ...c, s: +(c.s + shift).toFixed(3), e: +(Math.min(c.e, sc.start + g.to) + shift).toFixed(3) }));
      return { ...sc, start: +(g.start - g.from).toFixed(3), dur: g.to, captions, seg: g };
    });
    if (vertical) RS.overlayVertical(rootEl, tl, P, mapped, S, rtl);
    else RS.overlay(rootEl, tl, { ...T, total: P.total, scenes: mapped }, S, rtl, {});
    return { tl, compId };
  };

  /** Vertical chrome: brand at the top, the scene title, the film band, large captions, and a vertical end card. */
  RS.overlayVertical = function (rootEl, tl, P, scenes, S, rtl) {
    const ov = document.createElement("div");
    ov.className = "clip overlay";
    ov.setAttribute("data-start", "0");
    ov.setAttribute("data-duration", P.total.toFixed(3));
    ov.setAttribute("data-track-index", "5");
    rootEl.appendChild(ov);
    const svg = el("svg", { viewBox: "0 0 1080 1920", xmlns: "http://www.w3.org/2000/svg", style: "position:absolute;inset:0;width:1080px;height:1920px;" }, ov);
    const T = RS.T;
    const head = rtl ? "rs-head-ar" : "rs-head", body = rtl ? "rs-body-ar" : "rs-body", dir = rtl ? "rtl" : "ltr";
    // brand mark, always present at the top (LTR lockup, centred)
    const top = el("g", {}, svg);
    const lg = RS.ui.logo(top, 0, 0, 64);
    lg.setAttribute("transform", `translate(${(1080 - lg.w) / 2} 70)`);
    // titles: eyebrow + title, wrapped, centred
    scenes.forEach((sc) => {
      const g = sc.seg;
      const title = S.titles[sc.index], stage = RS.RAIL_STAGE[sc.id];
      if (!title || stage === undefined || g.endCard) return;
      const tg = el("g", { opacity: 0 }, svg);
      el("rect", { x: 525, y: 214, width: 30, height: 3, rx: 1.5, fill: T.coral }, tg);
      const eb = el("text", { x: 540, y: 258, "text-anchor": "middle", class: body, "font-size": 26, "font-weight": 700, fill: T.petrol600, "letter-spacing": rtl ? 0 : 2.4, direction: dir }, tg);
      eb.textContent = rtl ? S.rail[stage] : S.rail[stage].toUpperCase();
      const lines = wrapCentered(title, rtl ? 62 : 58, 940, rtl);
      lines.forEach((ln, k) => {
        const t = el("text", { x: 540, y: 330 + k * 70, "text-anchor": "middle", class: head, "font-size": rtl ? 62 : 58, "font-weight": 600, fill: T.heading, direction: dir }, tg);
        t.textContent = ln;
      });
      // an information chip under the film, in phone-legible type (e.g. the estimate's non-binding note)
      if (g.chip) {
        const cg = el("g", { opacity: 0 }, svg);
        const cl = wrapCentered(g.chip(S), rtl ? 38 : 34, 800, rtl);
        // under a 16:9 band it sits below the picture; over a square crop it is a callout near the bottom edge
        const cy = g.v && g.v.band ? 1340 : 1400;
        RS.ui.rect(cg, { w: 1080, rtl: false }, 70, cy, 940, 40 + cl.length * 50, { r: 18, fill: T.petrol50, stroke: T.petrol100 });
        cl.forEach((ln, k) => {
          const t = el("text", { x: 540, y: cy + 54 + k * 50, "text-anchor": "middle", class: body, "font-size": rtl ? 38 : 34, "font-weight": 600, fill: T.petrol700, direction: dir }, cg);
          t.textContent = ln;
        });
        const c0 = g.chipAt != null ? g.start + (g.chipAt - g.from) : g.start + 2.2;
        const c1 = g.chipTo != null ? g.start + (g.chipTo - g.from) : g.start + g.len - 0.5;
        tl.fromTo(cg, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, c0);
        tl.to(cg, { opacity: 0, duration: 0.4 }, c1);
      }
      tl.fromTo(tg, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, g.start + (g.xin ? 0.35 : 0.6));
      tl.to(tg, { opacity: 0, duration: 0.45, ease: "power1.in" }, g.start + g.len - 0.55);
    });
    // captions under the band
    const capWrap = document.createElement("div");
    capWrap.style.cssText = "position:absolute;left:0;right:0;top:1610px;display:flex;justify-content:center;pointer-events:none;";
    ov.appendChild(capWrap);
    const caps = scenes.flatMap((sc) => sc.captions);
    caps.forEach((c, k) => {
      const next = caps[k + 1];
      const d = document.createElement("div");
      d.className = rtl ? "cap rs-body-ar" : "cap rs-body";
      d.dir = dir;
      d.lang = rtl ? "ar" : "en";
      d.textContent = c.text;
      d.style.cssText = `position:absolute;top:0;left:50%;transform:translateX(-50%);width:max-content;max-width:900px;padding:14px 30px 16px;border-radius:16px;background:${T.white};color:${T.heading};font-size:${rtl ? 50 : 46}px;font-weight:600;line-height:1.3;text-align:center;box-shadow:0 12px 34px -20px rgba(19,41,46,.45);opacity:0;`;
      capWrap.appendChild(d);
      tl.fromTo(d, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, Math.max(0, c.s));
      tl.to(d, { opacity: 0, duration: 0.12, ease: "none" }, Math.max(0.2, next ? Math.min(c.e + 0.05, next.s - 0.12) : c.e + 0.05));
    });
    // vertical end card, timed to the same brand beats as the master's (scene-local times of s10)
    const endSeg = scenes.find((sc) => sc.seg.endCard);
    if (endSeg) {
      const g = endSeg.seg, ed = (t) => g.start + (t - g.from);
      const CARD = 7.1, L0 = CARD + (rtl ? 0.25 : 0.55);
      const card = el("g", { opacity: 0 }, svg);
      el("rect", { width: 1080, height: 1920, fill: T.paper }, card);
      el("circle", { cx: 540, cy: 760, r: 640, fill: RS.radial(svg, "v-halo", [[0, T.petrol50, 1], [1, T.paper, 0]]) }, card);
      tl.to(card, { opacity: 1, duration: 0.45, ease: "sine.inOut" }, ed(CARD - 0.4));
      tl.to(top, { opacity: 0, duration: 0.3 }, ed(CARD - 0.4));
      const lw = el("g", {}, card);
      const big = RS.ui.logo(lw, 0, 0, 150);
      big.setAttribute("transform", `translate(${(1080 - big.w) / 2} 600)`);
      const icon = big.querySelector("image"), dot = big.querySelector(".logo-dot");
      const wcp = el("clipPath", { id: "v-wm" }, RS.defs(svg));
      const wRect = el("rect", { x: 150 * 1.02, y: -40, width: 0, height: 300 }, wcp);
      big.querySelectorAll("text").forEach((w) => w.setAttribute("clip-path", "url(#v-wm)"));
      tl.fromTo(icon, { opacity: 0, scale: 0.82, svgOrigin: "75 75" }, { opacity: 1, scale: 1, svgOrigin: "75 75", duration: 0.7, ease: "back.out(1.6)" }, ed(L0));
      tl.fromTo(wRect, { attr: { width: 0 } }, { attr: { width: big.w }, duration: 0.8, ease: "power2.inOut" }, ed(L0 + 0.25));
      tl.fromTo(dot, { scale: 0, svgOrigin: `${dot.getAttribute("cx")} ${dot.getAttribute("cy")}` }, { scale: 1, svgOrigin: `${dot.getAttribute("cx")} ${dot.getAttribute("cy")}`, duration: 0.45, ease: "back.out(3)" }, ed(L0 + 0.95));
      const tag = el("g", { opacity: 0 }, card);
      el("rect", { x: 520, y: 880, width: 40, height: 4, rx: 2, fill: T.coral }, tag);
      wrapCentered(S.end.tagline, rtl ? 60 : 56, 900, rtl).forEach((ln, k) => {
        const t = el("text", { x: 540, y: 970 + k * 76, "text-anchor": "middle", class: head, "font-size": rtl ? 60 : 56, "font-weight": 600, fill: T.heading, direction: dir }, tag);
        t.textContent = ln;
      });
      tl.fromTo(tag, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, ed(CARD + 1.6));
      const cta = el("g", { opacity: 0 }, card);
      el("rect", { x: 540 - 260, y: 1170, width: 520, height: 112, rx: 16, fill: T.petrol600 }, cta);
      const ct = el("text", { x: 540, y: 1242, "text-anchor": "middle", class: body, "font-size": 42, "font-weight": 700, fill: "#fff", direction: dir }, cta);
      ct.textContent = S.end.cta;
      const url = el("text", { x: 540, y: 1360, "text-anchor": "middle", class: "rs-body", "font-size": 34, "font-weight": 600, fill: T.petrol700, direction: "ltr", opacity: 0 }, card);
      url.textContent = S.end.url;
      tl.fromTo(cta, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, ed(CARD + 3.3));
      tl.fromTo(url, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "sine.out" }, ed(CARD + 3.7));
    }
  };

  /** Greedy word wrap measured with the real font, returned as lines for centred text. */
  function wrapCentered(str, size, maxW, rtl) {
    const c = document.createElement("canvas").getContext("2d");
    c.font = `600 ${size}px ${rtl ? "Alexandria, Cairo" : "Alexandria"}`;
    const lines = [];
    let cur = "";
    for (const w of str.split(" ")) {
      const test = cur ? cur + " " + w : w;
      if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
})(typeof window !== "undefined" ? window : globalThis);
