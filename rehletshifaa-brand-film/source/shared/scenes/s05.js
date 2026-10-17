/*
 * Scene 5 — Clarity before commitment.
 * Shot A: the care proposal on Amal's tablet reveals in reading order — recommendation, next steps, then the
 * preliminary estimate as a range, explicitly non-binding. Shot B: Amal, at home, takes it in; her face moves
 * from concern to understanding; she asks one question and Nour answers.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s05-clarity"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T;
    const CUT = 4.6;

    // ---------------------------------------------------------------- shot A: proposal insert
    const shotA = el("g", { class: "shotA" }, shell);
    el("rect", { x: -100, y: -100, width: 2200, height: 1300, fill: "#e9e2d6" }, shotA);
    const tabA = el("g", {}, shotA);
    el("rect", { x: 160, y: 70, width: 1600, height: 960, rx: 46, fill: "#24343a" }, tabA);
    const cpA = el("clipPath", { id: `${ctx.lang}-s5clip` }, RS.defs(svg));
    el("rect", { x: 200, y: 110, width: 1520, height: 880, rx: 18 }, cpA);
    const scrA = el("g", { "clip-path": `url(#${ctx.lang}-s5clip)` }, tabA);
    const prop = RS.proposalScreen(svg, el("g", { transform: "translate(200 110) scale(1.2667 1.158)" }, scrA), S, rtl, `${ctx.lang}-s5`);
    el("path", { d: "M200 110 L700 110 L380 990 L200 990 Z", fill: "#fff", opacity: 0.04 }, tabA);
    // reveal in reading order, each element with a purpose
    tl.fromTo(prop.c1, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, at(0.1));
    ctx.sfx(0.1, "ui_confirm", -32);
    tl.fromTo(prop.c2, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, at(1.0));
    prop.steps.forEach((s, i) => tl.fromTo(s, { opacity: 0, x: rtl ? -12 : 12 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, at(1.35 + i * 0.3)));
    tl.fromTo(prop.c3, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, at(2.45));
    ctx.sfx(2.45, "transition_paper", -30);
    // focus on the explanatory note: the estimate is preliminary
    tl.fromTo(prop.hl, { opacity: 0 }, { opacity: 0.12, duration: 0.5, ease: "sine.out" }, at(3.4));
    tl.fromTo(prop.acts, { opacity: 0 }, { opacity: 1, duration: 0.4 }, at(3.9));
    // slow push and a gentle drift toward the estimate as it becomes the subject
    tl.fromTo(tabA, { scale: 1.0, x: 0, y: 0, svgOrigin: "960 540" }, { scale: 1.05, x: -20, y: -24, duration: CUT + 0.3, ease: "sine.inOut", svgOrigin: "960 540" }, at(-ctx.transIn));

    // ---------------------------------------------------------------- shot B: Amal at home with the tablet
    const shotB = el("g", { class: "shotB", opacity: 0 }, shell);
    const world = el("g", { class: "world" }, shotB);
    const L = RS.env.home(svg, world);
    el("rect", { x: -200, y: -200, width: 2400, height: 1500, fill: "#f3e3c8", opacity: 0.18 }, L.mid); // warmer afternoon
    const amal = RS.place(L.near, "amal", { x: 120, y: -205, s: 1.7, seed: 31, id: `${ctx.lang}-s5-amal` });
    // tablet held low in her lap, tilted up toward her: seen almost edge-on from behind, so it never hides her face
    const tabB = RS.attach(amal, "Near", { front: false, transform: "translate(40 -8) rotate(14)" });
    el("path", { d: "M-30 6 L190 -4 L182 -46 L-36 -34 Z", fill: "#24343a" }, tabB);
    el("path", { d: "M-24 1 L184 -8 L178 -40 L-30 -30 Z", fill: "#2e4148" }, tabB);
    const screenGlow = el("ellipse", { cx: 790, cy: 560, rx: 240, ry: 300, fill: RS.radial(svg, `${ctx.lang}-s5glow`, [[0, "#eaf4f2", 0.22], [1, "#eaf4f2", 0]]) }, L.near);
    // her question and Nour's answer (message overlay beside her, site chat styling)
    const chat = el("g", { class: "chat" }, L.fg);
    const cu = { w: 1920, rtl }, bx = rtl ? 1920 - 1040 - 640 : 1040; // always screen-right, away from her face
    const q = RS.ui.bubble(chat, cu, bx, 380, 640, S.proposal.question, { side: "out", size: 30 });
    const a = RS.ui.bubble(chat, cu, bx, 380 + q.h + 26, 640, S.proposal.answer, { side: "in", size: 30 });
    q.setAttribute("opacity", 0); a.setAttribute("opacity", 0);

    amal.key(-1, { shoulderNear: -12, elbowNear: 6, wristNear: -2, shoulderFar: -10, elbowFar: 10, lookX: 0.8, lookY: 1.0, headNod: 10, headTurn: 0.5, lidL: 0.78, lidR: 0.78 })
      .key(-1, RS.EXPRESSIONS.concerned).hand(-1, "Near", "hold").hand(-1, "Far", "hold");
    // reading the estimate: concern → thoughtful (brows relax, a slight squint as she weighs it)
    amal.key(CUT + 0.6, RS.EXPRESSIONS.thoughtful, "inOut").key(CUT + 0.9, { lookY: 0.95 }, "inOut");
    // she asks: thumbs move on the tablet, small anticipatory lift of the brows
    for (let k = 0; k < 6; k++) amal.key(CUT + 1.4 + k * 0.18, { wristNear: -2 + (k % 2 ? 3 : -1) }, "sine");
    amal.key(CUT + 1.3, { browRaise: 1.0, browInner: 0.6 }, "inOut");
    tl.fromTo(q, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, at(CUT + 2.2));
    ctx.sfx(CUT + 2.2, "ui_message", -30);
    // waiting, eyes to the screen, then the answer arrives: understanding (not a broad smile)
    tl.fromTo(a, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, at(CUT + 4.0));
    ctx.sfx(CUT + 4.0, "ui_message", -28);
    amal.key(CUT + 4.4, { lookY: 1.0, lookX: 0.8 }, "inOut").key(CUT + 5.0, RS.EXPRESSIONS.reassured, "inOut")
      .key(CUT + 5.2, { headNod: 13, shrug: -0.5 }, "sine").key(CUT + 5.7, { headNod: 9 }, "sine").key(CUT + 6.3, { smile: 0.28 }, "inOut");
    amal.autoBlink(-1, D, { quiet: [[CUT + 1.4, CUT + 2.4]] }).blink(CUT + 0.4).blink(CUT + 4.3);
    RS.driveScene(ctx, [amal]);
    // cut A → B (soft, 0.35s)
    tl.to(shotA, { opacity: 0, duration: 0.35, ease: "sine.inOut" }, at(CUT));
    tl.fromTo(shotB, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "sine.inOut" }, at(CUT));
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.5], [L.mid, 0.7], [L.near, 1], [L.fg, 1]], [
      { t: CUT, ...cam(1.0, 960, 540) }, { t: D + 0.05, ...cam(1.08, 900, 520), ease: "sine.inOut" },
    ], [0, 0]);
    tl.fromTo(screenGlow, { opacity: 0.6 }, { opacity: 1, duration: 2, ease: "sine.inOut" }, at(CUT));
    ctx.amb("amb_home_day", -47);
  };
})();
