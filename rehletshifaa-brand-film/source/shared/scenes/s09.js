/*
 * Scene 9 — Care, confirmed by the treating team.
 * Shot A: the in-person consultation (the Gate 2 staging). The Consultant explains, indicates the imaging, and the
 * care plan is confirmed on the tablet between them — after the assessment, never before. Shot B: a closer single
 * on Amal; her phone lights with a message from Nour, who stays connected through the agreed journey.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s09-care"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T, C = S.care;
    const CUT = 5.6;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.consultRoom(svg, world);
    const amal = RS.place(L.near, "amal", { x: 60, y: -78, s: 1.35, seed: 91, id: `${ctx.lang}-s9-amal` });
    const doc = RS.place(L.near, "consultant", { x: 1860, y: -86, s: 1.35, flip: true, seed: 93, id: `${ctx.lang}-s9-doc` });
    const DESK_Y = 846;
    RS.desk(svg, L.fg, { id: `${ctx.lang}-s9desk`, y0: DESK_Y, y1: 1040 });
    const rep = el("g", { transform: "translate(1150 900) matrix(1.15 0 -0.5 0.4 0 0)" }, L.fg);
    RS.props.report(svg, rep, { w: 300, h: 380, variant: "knee", rows: 8, id: `${ctx.lang}-s9rep` });
    const repFocus = rep.querySelector(".focus");
    // Amal's phone, face up on the desk near her hand
    const ph = el("g", { transform: "translate(600 930) matrix(0.42 0 -0.2 0.15 0 0)" }, L.fg);
    el("rect", { width: 260, height: 540, rx: 40, fill: "#1c2a2e" }, ph);
    const phScreen = el("rect", { x: 12, y: 12, width: 236, height: 516, rx: 30, fill: "#26363b" }, ph);
    const phGlow = el("ellipse", { cx: 600, cy: 700, rx: 260, ry: 320, fill: RS.radial(svg, `${ctx.lang}-s9pg`, [[0, "#dff1ee", 0.28], [1, "#dff1ee", 0]]), opacity: 0 }, L.light); // the screen lights her face from below

    // care plan on a tablet stand between them
    const tb = RS.props.tablet(svg, L.fg, { id: `${ctx.lang}-s9tb` });
    tb.g.setAttribute("transform", "translate(790 600) scale(0.64)");
    el("path", { d: "M200 352 L320 352 L300 404 L220 404 Z", fill: "#bdb4a5" }, tb.g);
    const sc = tb.screen, u = { w: 488, rtl };
    el("rect", { width: 488, height: 328, fill: T.paper }, sc);
    el("rect", { width: 488, height: 52, fill: T.white }, sc);
    RS.ui.icon(sc, "heart", RS.ui.X(u, 18, 24), 14, 24, T.petrol600, 2);
    RS.ui.text(sc, u, 52, 34, C.plan, { kind: "head", size: 20, weight: 600, fill: T.heading });
    const items = C.items.map((txt, i) => {
      const g = el("g", { opacity: 0 }, sc);
      RS.ui.rect(g, u, 18, 70 + i * 54, 452, 44, { r: 10, fill: T.white, stroke: T.line });
      RS.ui.check(g, RS.ui.X(u, 40, 0), 92 + i * 54, 11, {});
      RS.ui.text(g, u, 62, 98 + i * 54, txt, { size: 15, weight: 600, fill: T.heading });
      return g;
    });
    const conf = el("g", { opacity: 0 }, sc);
    RS.ui.rect(conf, u, 18, 238, 452, 40, { r: 20, fill: T.petrol600 });
    RS.ui.text(conf, u, 18, 264, C.confirmed, { size: 15, weight: 700, fill: T.white, anchor: "middle" }).setAttribute("x", RS.ui.X(u, 18, 452) + 226);

    // depth: walls → desk → far arms → torsos (clipped) → near arms → light
    world.insertBefore(L.fg, L.near);
    const armsBehind = el("g", {}, world); world.insertBefore(armsBehind, L.near);
    const armsTop = el("g", {}, world);
    RS.seatAtDesk(svg, amal, DESK_Y, { behind: armsBehind, front: armsTop });
    RS.seatAtDesk(svg, doc, DESK_Y, { behind: armsBehind, front: armsTop });
    world.appendChild(L.light);
    RS.props.beam(svg, L.light, { id: `${ctx.lang}-s9beam`, a: 0.2, d: "M60 100 L460 100 L1100 1080 L-200 1080 Z" });
    // Nour's message (shot B): screen space, in the room the cut-in leaves beside her
    const msg = el("g", { opacity: 0 }, shell);
    const mu = { w: 1920, rtl }, mx = rtl ? 1920 - 1040 - 680 : 1040; // screen-right in both languages, beside her
    RS.ui.bubble(msg, mu, mx, 420, 680, C.nour, { side: "in", size: 32 });
    RS.ui.iconWell(msg, mu, "message", mx, 350, 50, { fill: T.white });
    RS.ui.text(msg, mu, mx + 64, 384, S.follow.from, { size: 25, weight: 700, fill: T.petrol700 });

    // ---------------------------------------------------------------- acting
    amal.key(-1, { shoulderNear: -10, elbowNear: 14, wristNear: -4, lookX: 0.5, lookY: 0.7, headNod: 3, headTilt: 2, lidL: 0.85, lidR: 0.85 })
      .key(-1, RS.EXPRESSIONS.attentive).hand(-1, "Near", "rest").hand(-1, "Far", "rest");
    doc.key(-1, { shoulderNear: -14, elbowNear: 12, wristNear: 2, lookX: 0.35, lookY: 0.95, headNod: 6, headTilt: 3, lidL: 0.7, lidR: 0.7, lean: 2 })
      .key(-1, RS.EXPRESSIONS.thoughtful).hand(-1, "Near", "point").hand(-1, "Far", "rest");
    // he finishes reading, looks up to her and explains with an open hand
    doc.key(0.6, { headNod: 8, lookY: 1 }, "inOut").key(1.1, { headNod: -1, headTilt: 0, lookX: 0.55, lookY: 0.05, lidL: 1, lidR: 1 }, "settle")
      .key(1.1, RS.EXPRESSIONS.warm, "settle").hand(1.2, "Near", "open").key(1.4, { shoulderNear: -15, elbowNear: -1, wristNear: -14, lean: 0.6 }, "settle");
    RS.speak(doc, 1.4, 3.6, { seed: 19, rate: 4.0, scale: 0.7 });
    amal.key(1.0, { lookX: 0.6, lookY: 0.1, headNod: 0, headTilt: 0, lidL: 1, lidR: 1 }, "out").key(1.6, RS.EXPRESSIONS.listening, "inOut");
    // indicates the imaging; the care plan confirms on the tablet
    doc.key(2.6, { shoulderNear: -16, elbowNear: 12, wristNear: 4, lookX: 0.35, lookY: 0.95, headNod: 6 }, "inOut").hand(2.65, "Near", "point");
    tl.fromTo(repFocus, { attr: { opacity: 0 } }, { attr: { opacity: 0.85 }, duration: 0.5, ease: "sine.out" }, at(2.9));
    amal.key(2.8, { lookX: 0.9, lookY: 0.75, headNod: 4 }, "inOut");
    items.forEach((g, i) => tl.fromTo(g, { opacity: 0, x: rtl ? -10 : 10 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, at(2.5 + i * 0.35)));
    tl.fromTo(conf, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, at(3.7));
    ctx.sfx(3.7, "ui_confirm", -28);
    doc.key(3.9, { lookX: 0.55, lookY: 0.05, headNod: 0 }, "inOut").key(4.1, { smile: 0.36 }, "inOut").hand(4.2, "Near", "rest")
      .key(4.3, { shoulderNear: -14, elbowNear: 12, wristNear: 2 }, "inOut");
    amal.key(4.0, { lookX: 0.6, lookY: 0.1, headNod: 0 }, "inOut").key(4.2, RS.EXPRESSIONS.reassured, "inOut")
      .key(4.5, { headNod: 4 }, "sine").key(4.9, { headNod: 0, shrug: -0.5 }, "sine").key(5.1, { smile: 0.34 }, "inOut");
    // shot B: the phone lights; she glances down, reads, and smiles
    tl.to(phScreen, { attr: { fill: "#e8f3f1" }, duration: 0.25 }, at(CUT + 0.4));
    tl.to(phGlow, { opacity: 1, duration: 0.3 }, at(CUT + 0.4));
    ctx.sfx(CUT + 0.4, "ui_message", -27, { pan: 0.4 });
    amal.key(CUT + 0.55, { lookX: 0.7, lookY: 1, headNod: 7 }, "out").key(CUT + 0.6, RS.EXPRESSIONS.attentive, "inOut")
      .key(CUT + 1.6, { lookX: 0.9, lookY: 0.4, headNod: 2, headTurn: 0.6 }, "inOut")
      .key(CUT + 2.0, RS.EXPRESSIONS.warm, "inOut").key(CUT + 2.3, { smile: 0.5 }, "inOut").key(CUT + 2.6, { headNod: 4 }, "sine").key(CUT + 3.0, { headNod: 1 }, "sine");
    tl.fromTo(msg, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at(CUT + 1.0));
    amal.autoBlink(-1, D, { quiet: [[CUT + 0.5, CUT + 1.4]] }).blink(1.0).blink(CUT + 0.45);
    doc.autoBlink(-1, D, { quiet: [[1.4, 2.0]] }).blink(1.05);
    RS.driveScene(ctx, [amal, doc]);
    ctx.sfx(0.4, "page_turn", -30, { pan: 0.7 });
    ctx.amb("roomtone_clinic", -46);

    // camera: two-shot, slow drift; cut-in to Amal for the message
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.6], [L.mid, 0.8], [L.fg, 1], [armsBehind, 1], [L.near, 1], [armsTop, 1], [L.light, 1]], [
      { t: -ctx.transIn, ...cam(1.02, 960, 540) }, { t: CUT - 0.01, ...cam(1.07, 940, 540), ease: "sine.inOut" },
      { t: CUT, ...cam(1.42, 640, 500), ease: "none" }, { t: D + 0.05, ...cam(1.5, 630, 500), ease: "sine.inOut" },
    ], [0, 0]);
    // a hard cut reads as a cut-in only with a breath of fade
    const veil = el("rect", { x: -200, y: -200, width: 2400, height: 1500, fill: T.paper, opacity: 0 }, shell);
    tl.fromTo(veil, { opacity: 0 }, { opacity: 0.6, duration: 0.12, ease: "sine.in" }, at(CUT - 0.12));
    tl.to(veil, { opacity: 0, duration: 0.25, ease: "sine.out" }, at(CUT));
  };
})();
