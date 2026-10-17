/*
 * Scene 1 — The patient's uncertainty. Home, soft daylight.
 * Amal picks up her report from the coffee table, reads, the concern builds quietly; she lowers it with a
 * gentle exhale, her eyes go to the phone, and she reaches for it (motivates the cut into scene 2).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s01-uncertainty"] = function (ctx) {
    const { svg, shell, tl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.home(svg, world);
    const TABLE_Y = 884;

    // coffee table with the report and the phone
    RS.desk(svg, L.fg, { id: `${ctx.lang}-s1table`, y0: TABLE_Y, y1: 1010, topFar: "#cdb08e", topNear: "#dcc4a3", faceTop: "#a78a68", faceBot: "#8f7456", seed: 3 });
    const repTable = el("g", { transform: "translate(860 905) matrix(1 0 0.46 0.34 0 0) rotate(-5)" }, L.fg);
    RS.props.report(svg, repTable, { w: 250, h: 330, variant: "knee", rows: 8, id: `${ctx.lang}-s1rep` });
    const phoneOnTable = el("g", { transform: "translate(1150 930) matrix(0.5 0 0.25 0.19 0 0) rotate(-14)" }, L.fg);
    const ph = RS.props.phone(svg, phoneOnTable, { id: `${ctx.lang}-s1ph` });
    el("rect", { x: 0, y: 0, width: 236, height: 516, fill: "#1f2f35" }, ph.screen);
    const phoneGlow = el("rect", { x: 0, y: 0, width: 236, height: 516, fill: "#eaf4f2", opacity: 0 }, ph.screen);
    RS.props.mug(svg, L.fg, { transform: "translate(1430 950) scale(1.05)", color: "#d9cbb2" });

    // Amal on the sofa, forearms over the table edge
    const behind = el("g", {}, world); world.insertBefore(behind, L.near);
    world.insertBefore(L.fg, L.near.nextSibling);
    const front = el("g", {}, world);
    world.appendChild(L.light);
    const amal = RS.place(L.near, "amal", { x: 330, y: 52, s: 1.32, seed: 7, id: `${ctx.lang}-s1-amal` });
    RS.seatAtDesk(svg, amal, TABLE_Y, { behind, front });
    // the report she holds (back of the sheet faces camera; lines show faintly through)
    // the report she holds: world-aligned sheet (counter-rotates the hand), back toward camera, foreshortened
    const held = RS.attach(amal, "Near", { transform: "translate(64 -6)" });
    held.setAttribute("opacity", 0);
    const sheetG = el("g", { class: "held-sheet" }, held);
    el("path", { d: "M-6 6 L104 24 L74 -214 L-40 -228 Z", fill: "#000", opacity: 0.08, transform: "translate(6 6)" }, sheetG);
    el("path", { d: "M-6 6 L104 24 L74 -214 L-40 -228 Z", fill: "#f7f3ec", stroke: "#e2dacb", "stroke-width": 1.4 }, sheetG);
    for (let i = 0; i < 8; i++) {
      const y0 = -196 + i * 25, x0 = -30 + i * 3.2;
      el("path", { d: `M${x0 + 8} ${y0} L${x0 + 8 + 82 - (i % 3) * 14} ${y0 + 10}`, stroke: "#dcd4c7", "stroke-width": 3, "stroke-linecap": "round", opacity: 0.6 }, sheetG);
    }
    held.sheet = sheetG;
    RS.props.beam(svg, L.light, { id: `${ctx.lang}-s1beam`, a: 0.13, d: "M1300 90 L1700 90 L1820 1080 L1060 1080 Z" });

    // ---------------------------------------------------------------- acting
    amal.key(-1, { shoulderNear: -8, elbowNear: 12, wristNear: 0, lookX: 0.6, lookY: 0.85, headNod: 6, headTilt: 3, lidL: 0.78, lidR: 0.78 })
      .key(-1, RS.EXPRESSIONS.thoughtful).hand(-1, "Near", "rest").hand(-1, "Far", "loose");
    // reach for the report (anticipation: weight shifts forward), pick it up, bring it to reading height
    amal.key(0.7, { lean: 2.5, shoulderNear: -14, elbowNear: 18, wristNear: 6 }, "inOut").hand(0.95, "Near", "hold")
      .key(1.35, { lean: 1.2, shoulderNear: -18, elbowNear: -7, wristNear: -14, lookY: 0.55, headNod: 2 }, "settle")
      .key(1.9, { shoulderNear: -19, elbowNear: -9, wristNear: -14 }, "out");
    tl.fromTo(repTable, { opacity: 1 }, { opacity: 0, duration: 0.12 }, at(1.05));
    tl.fromTo(held, { opacity: 0 }, { opacity: 1, duration: 0.08 }, at(1.05));
    ctx.sfx(1.0, "paper_pickup", -13, { pan: 0.45 });
    // reading: left-to-right line sweeps with small returns; concern grows in the inner brows
    let t = 2.0;
    for (let line = 0; line < 4; line++) {
      amal.key(t, { lookX: 0.2, lookY: 0.45 + line * 0.06 }, "out").key(t + 0.65, { lookX: 0.75 }, "linear");
      t += 0.8;
    }
    amal.key(2.2, RS.EXPRESSIONS.concerned, "inOut").key(4.4, { browInner: 1.2, browKnit: 0.6, headTilt: 4 }, "inOut");
    ctx.sfx(3.9, "page_turn", -20, { pan: 0.45 });
    amal.key(3.9, { wristNear: -19 }, "sine").key(4.3, { wristNear: -14 }, "sine");
    // a gentle exhale: shoulders settle, lids lower, lips part slightly; the report comes down
    amal.key(5.4, { shrug: 0.5, lidL: 0.85, lidR: 0.85 }, "inOut").key(5.9, { shrug: -0.8, mouthOpen: 0.12, lidL: 0.55, lidR: 0.55 }, "out")
      .key(6.6, { mouthOpen: 0, lidL: 0.9, lidR: 0.9 }, "inOut")
      .key(6.1, { shoulderNear: -12, elbowNear: 4, wristNear: -4 }, "inOut");
    // eyes go to the phone first, then the head follows (natural attention shift)
    amal.key(6.9, { lookX: 0.95, lookY: 0.85 }, "out").key(7.4, { headTurn: 0.9, headNod: 7, headTilt: 1 }, "inOut")
      .key(7.6, RS.EXPRESSIONS.thoughtful, "inOut");
    // decision to reach for it: far hand moves toward the phone
    amal.key(8.6, { shoulderFar: -10, elbowFar: 14, wristFar: 6, lean: 2 }, "inOut").hand(8.9, "Far", "open")
      .key(9.6, { shoulderFar: -14, elbowFar: 20 }, "settle");
    tl.fromTo(phoneGlow, { opacity: 0 }, { opacity: 0.85, duration: 0.5, ease: "sine.out" }, at(9.2));
    ctx.sfx(9.5, "phone_set_down", -24, { pan: 0.6 });
    amal.autoBlink(-1, D, { quiet: [[2.0, 3.6]] }).blink(1.95).blink(5.85, 0.6).blink(6.85);
    RS.driveScene(ctx, [amal], () => {
      const p = amal.params, k = amal.tracks;
      const v = (n) => (k[n] ? k[n].at(amal._t) : p[n]);
      held.sheet.setAttribute("transform", `rotate(${RS.f(-(v("shoulderNear") + v("elbowNear") + v("wristNear")) - 13 - v("lean") * 0.5)})`);
    });

    // ---------------------------------------------------------------- environment life
    tl.fromTo(L.window.curtain, { x: 0, skewX: 0 }, { x: 7, skewX: 0.6, duration: D / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, at(0));
    tl.fromTo(L.window.glow, { opacity: 0.75 }, { opacity: 1, duration: D, ease: "sine.inOut" }, at(0));
    ctx.amb("amb_home_day", -45, { fadeIn: 2.5 });

    // camera: slow push toward Amal's face and the report
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.55], [L.mid, 0.8], [behind, 1], [L.near, 1], [L.fg, 1.06], [front, 1], [L.light, 0.6]], [
      { t: 0, ...cam(1.0, 960, 560) }, { t: 5.5, ...cam(1.12, 900, 560), ease: "sine.inOut" }, { t: D, ...cam(1.26, 940, 600), ease: "sine.inOut" },
    ], [0, 0]);
    // opening: fade up from paper with the music
    const veil = el("rect", { x: 0, y: 0, width: 1920, height: 1080, fill: RS.T.paper }, shell);
    tl.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: 1.4, ease: "sine.inOut" }, at(0));
  };
})();
