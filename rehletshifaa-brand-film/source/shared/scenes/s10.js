/*
 * Scene 10 — Follow-up, and the brand.
 * Shot A: home again, evening, the same sofa as the opening — but Amal is at ease now. A follow-up notification
 * arrives and becomes a video tile with Nour; they share a warm moment. The tile then opens to fill the frame and
 * becomes the end card: logo lockup, tagline, call to action and URL (no burned captions over the card).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s10-followup"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T, F = S.follow, E = S.end;
    const OPEN = 6.3, CARD = 7.1;

    // ================================================================ shot A — home, evening
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.home(svg, world, { evening: true });
    const amal = RS.place(L.near, "amal", { x: 120, y: -205, s: 1.7, seed: 101, id: `${ctx.lang}-s10-amal` });
    const tab = RS.attach(amal, "Near", { front: false, transform: "translate(40 -8) rotate(14)" });
    el("path", { d: "M-30 6 L190 -4 L182 -46 L-36 -34 Z", fill: "#24343a" }, tab);
    el("path", { d: "M-24 1 L184 -8 L178 -40 L-30 -30 Z", fill: "#2e4148" }, tab);
    el("ellipse", { cx: 790, cy: 560, rx: 240, ry: 300, fill: RS.radial(svg, `${ctx.lang}-s10glow`, [[0, "#eaf4f2", 0.2], [1, "#eaf4f2", 0]]) }, L.near);

    // notification → video tile (screen space, screen-right in both languages, beside her)
    const ui = el("g", {}, shell);
    const u = { w: 1920, rtl }, W = 660, X = (x) => RS.ui.X(u, x, 0);
    const bx = rtl ? 1920 - 1080 - W : 1080;
    const note = el("g", { opacity: 0 }, ui);
    RS.ui.rect(note, u, bx, 300, W, 170, { r: 18, fill: T.white, stroke: T.line });
    RS.ui.iconWell(note, u, "bell", bx + 22, 324, 58, {});
    RS.ui.text(note, u, bx + 100, 352, F.notif, { size: 28, weight: 700, fill: T.heading });
    RS.ui.text(note, u, bx + 100, 392, F.when, { size: 23, fill: T.ink });
    RS.ui.text(note, u, bx + 100, 434, F.from, { size: 21, weight: 600, fill: T.petrol600 });
    // the tile: a rounded frame with Nour inside (the frame later grows into the end card)
    const tileX = RS.ui.X(u, bx, W);
    const tile = el("rect", { x: tileX, y: 250, width: W, height: 420, rx: 22, fill: "#e9eef0", opacity: 0 }, ui);
    const vid = el("g", { opacity: 0 }, ui);
    const vcp = el("clipPath", { id: `${ctx.lang}-s10vid` }, RS.defs(svg));
    el("rect", { x: tileX, y: 250, width: W, height: 420, rx: 22 }, vcp);
    const vin = el("g", { "clip-path": `url(#${ctx.lang}-s10vid)` }, vid);
    el("rect", { x: tileX, y: 250, width: W, height: 420, fill: RS.linear(svg, `${ctx.lang}-s10vbg`, [[0, "#eef3f2"], [1, "#dfe7e6"]]) }, vin);
    el("rect", { x: tileX + 380, y: 280, width: 200, height: 150, rx: 6, fill: "#f6f1e7", opacity: 0.9 }, vin); // her office window
    const nour = RS.place(vin, "nour", { x: tileX + 90, y: 120, s: 0.95, seed: 103, id: `${ctx.lang}-s10-nour` });
    const label = el("g", {}, vid);
    RS.ui.rect(label, { w: 1920, rtl: false }, tileX + 18, 620, 250, 34, { r: 17, fill: "rgba(19,41,46,0.6)" });
    const lt = el("text", { x: tileX + 143, y: 643, "text-anchor": "middle", class: rtl ? "rs-body-ar" : "rs-body", "font-size": 18, "font-weight": 600, fill: "#fff" }, label);
    lt.textContent = F.from;
    el("circle", { cx: tileX + W - 34, cy: 284, r: 8, fill: T.coral }, vid);

    // ---------------------------------------------------------------- acting
    amal.key(-1, { shoulderNear: -12, elbowNear: 6, wristNear: -2, shoulderFar: -10, elbowFar: 10, lookX: 0.8, lookY: 0.55, headNod: 4, headTurn: 0.4, lidL: 0.9, lidR: 0.9 })
      .key(-1, RS.EXPRESSIONS.warm).key(-1, { smile: 0.22 }).hand(-1, "Near", "hold").hand(-1, "Far", "hold");
    // the notification: she looks down to the screen, reads, pleased
    amal.key(1.5, { lookX: 0.8, lookY: 1, headNod: 10 }, "out").key(2.6, { smile: 0.34 }, "inOut");
    // the call opens: eyes up to the tile, a real smile, a nod while Nour talks, a short reply
    amal.key(3.9, { lookX: 1, lookY: 0.45, headNod: 3, headTurn: 0.8 }, "inOut").key(4.1, { smile: 0.5, lidL: 0.85, lidR: 0.85 }, "inOut")
      .key(4.8, { headNod: 6 }, "sine").key(5.2, { headNod: 3 }, "sine");
    RS.speak(amal, 5.3, 6.0, { seed: 21, rate: 4.2, scale: 0.7 });
    nour.key(-1, { lookX: 0.2, lookY: 0.3, headTurn: 0, lean: 0, shoulderNear: -6, elbowNear: 20, shoulderFar: -6, elbowFar: 20 })
      .key(-1, RS.EXPRESSIONS.warm).key(-1, { smile: 0.45 }).hand(-1, "Near", "rest").hand(-1, "Far", "rest");
    RS.speak(nour, 4.1, 5.2, { seed: 23, rate: 4.0, scale: 0.7 });
    nour.key(5.4, { headNod: 3, smile: 0.55 }, "sine").key(5.8, { headNod: 0 }, "sine");
    amal.autoBlink(-1, OPEN + 0.4, {}).blink(1.45).blink(3.85);
    nour.autoBlink(3.4, OPEN + 0.4, {});
    RS.driveScene(ctx, [amal, nour]);

    tl.fromTo(note, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at(1.3));
    ctx.sfx(1.3, "ui_calendar", -27);
    // notification → tile
    tl.to(note, { opacity: 0, duration: 0.3, ease: "sine.in" }, at(3.4));
    tl.fromTo(tile, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at(3.4));
    tl.fromTo(vid, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "sine.out" }, at(3.6));
    ctx.sfx(3.5, "ui_message", -28);

    // ================================================================ the tile opens into the end card
    const card = el("g", { opacity: 0 }, shell);
    tl.to(vid, { opacity: 0, duration: 0.3, ease: "sine.in" }, at(OPEN));
    tl.to(tile, { attr: { x: -20, y: -20, width: 1960, height: 1120, rx: 0, fill: T.paper }, duration: 0.85, ease: "power3.inOut" }, at(OPEN));
    ctx.sfx(OPEN, "transition_air", -27);
    el("rect", { width: 1920, height: 1080, fill: T.paper }, card);
    el("circle", { cx: 960, cy: 470, r: 760, fill: RS.radial(svg, `${ctx.lang}-s10halo`, [[0, T.petrol50, 1], [1, T.paper, 0]]) }, card);
    tl.set(card, { opacity: 1 }, at(OPEN + 0.84));
    // logo lockup (always LTR: it is the mark), centered
    const lgWrap = el("g", {}, card);
    const lg = RS.ui.logo(lgWrap, 0, 0, 132);
    const lx = (1920 - lg.w) / 2, ly = 282;
    lg.setAttribute("transform", `translate(${lx} ${ly})`);
    const icon = lg.querySelector("image"), dot = lg.querySelector(".logo-dot");
    const wcp = el("clipPath", { id: `${ctx.lang}-s10wm` }, RS.defs(svg));
    const wRect = el("rect", { x: 132 * 1.02, y: -40, width: 0, height: 260 }, wcp);
    const words = [...lg.querySelectorAll("text")];
    words.forEach((w) => w.setAttribute("clip-path", `url(#${ctx.lang}-s10wm)`));
    const L0 = CARD + (ctx.lang === "ar" ? 0.25 : 0.55); // land the mark on the spoken brand name
    tl.fromTo(icon, { opacity: 0, scale: 0.82, svgOrigin: "66 66" }, { opacity: 1, scale: 1, svgOrigin: "66 66", duration: 0.7, ease: "back.out(1.6)" }, at(L0));
    tl.fromTo(wRect, { attr: { width: 0 } }, { attr: { width: lg.w }, duration: 0.8, ease: "power2.inOut" }, at(L0 + 0.25));
    tl.fromTo(dot, { scale: 0, svgOrigin: `${dot.getAttribute("cx")} ${dot.getAttribute("cy")}` }, { scale: 1, svgOrigin: `${dot.getAttribute("cx")} ${dot.getAttribute("cy")}`, duration: 0.45, ease: "back.out(3)" }, at(L0 + 0.95));
    ctx.sfx(L0, "logo_signature", -20);
    // tagline, coral rule, CTA, URL
    const tag = el("g", { opacity: 0 }, card);
    el("rect", { x: 940, y: 520, width: 40, height: 4, rx: 2, fill: T.coral }, tag);
    const tt = el("text", { x: 960, y: 600, "text-anchor": "middle", class: rtl ? "rs-head-ar" : "rs-head", "font-size": rtl ? 54 : 50, "font-weight": 600, fill: T.heading, direction: rtl ? "rtl" : "ltr" }, tag);
    tt.textContent = E.tagline;
    tl.fromTo(tag, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, at(CARD + 1.6));
    const cta = el("g", { opacity: 0 }, card);
    el("rect", { x: 960 - 200, y: 672, width: 400, height: 84, rx: 12, fill: T.petrol600 }, cta);
    const ct = el("text", { x: 960, y: 726, "text-anchor": "middle", class: rtl ? "rs-body-ar" : "rs-body", "font-size": 32, "font-weight": 700, fill: "#fff", direction: rtl ? "rtl" : "ltr" }, cta);
    ct.textContent = E.cta;
    const url = el("text", { x: 960, y: 812, "text-anchor": "middle", class: "rs-body", "font-size": 27, "font-weight": 600, fill: T.petrol700, direction: "ltr", opacity: 0 }, card);
    url.textContent = E.url;
    tl.fromTo(cta, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, at(CARD + 3.3));
    ctx.sfx(CARD + 3.3, "ui_confirm", -30);
    tl.fromTo(url, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "sine.out" }, at(CARD + 3.7));
    // the card breathes, barely
    tl.fromTo(lgWrap, { scale: 1, svgOrigin: "960 350" }, { scale: 1.025, svgOrigin: "960 350", duration: D - CARD, ease: "sine.inOut" }, at(CARD));

    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.5], [L.mid, 0.7], [L.near, 1], [L.fg, 1]], [
      { t: -ctx.transIn, ...cam(1.0, 960, 540) }, { t: OPEN + 0.9, ...cam(1.07, 900, 520), ease: "sine.inOut" },
    ], [0, 0]);
    ctx.amb("amb_home_evening", -47, { to: CARD + 0.8, fadeOut: 1.2 });
  };
})();
