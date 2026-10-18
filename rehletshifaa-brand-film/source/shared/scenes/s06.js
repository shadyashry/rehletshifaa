/*
 * Scene 6 — The decision is yours.
 * Shot A: a close, quiet moment on Amal. She lifts her eyes off the screen, breathes, and settles — the choice is
 * hers and nobody is rushing her. Shot B: her thumb taps "Continue journey"; the request is acknowledged and the
 * next step is handed back to Nour (no commitment beyond requesting the next step).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s06-decision"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T;
    const CUT = 4.8, TAP = 5.9;

    // ---------------------------------------------------------------- shot A: close on Amal (continuity with scene 5)
    const shotA = el("g", { class: "shotA" }, shell);
    const world = el("g", { class: "world" }, shotA);
    const L = RS.env.home(svg, world);
    el("rect", { x: -200, y: -200, width: 2400, height: 1500, fill: "#f3e3c8", opacity: 0.22 }, L.mid);
    const amal = RS.place(L.near, "amal", { x: 120, y: -205, s: 1.7, seed: 61, id: `${ctx.lang}-s6-amal` });
    const tabB = RS.attach(amal, "Near", { front: false, transform: "translate(40 -8) rotate(14)" });
    el("path", { d: "M-30 6 L190 -4 L182 -46 L-36 -34 Z", fill: "#24343a" }, tabB);
    el("path", { d: "M-24 1 L184 -8 L178 -40 L-30 -30 Z", fill: "#2e4148" }, tabB);
    el("ellipse", { cx: 790, cy: 560, rx: 240, ry: 300, fill: RS.radial(svg, `${ctx.lang}-s6glow`, [[0, "#eaf4f2", 0.2], [1, "#eaf4f2", 0]]) }, L.near);

    amal.key(-1, { shoulderNear: -12, elbowNear: 6, wristNear: -2, shoulderFar: -10, elbowFar: 10, lookX: 0.8, lookY: 1.0, headNod: 10, headTurn: 0.5, lidL: 0.78, lidR: 0.78 })
      .key(-1, RS.EXPRESSIONS.thoughtful).hand(-1, "Near", "hold").hand(-1, "Far", "hold");
    // eyes leave the screen first, the head follows: she is thinking, not reading
    amal.key(0.7, { lookX: 0.35, lookY: 0.45 }, "out").key(1.0, { headNod: 4, headTurn: 0.3, headTilt: 2 }, "inOut");
    // a breath in…
    amal.key(1.7, { shrug: 0.7, lidL: 0.88, lidR: 0.88, browInner: 0.5 }, "inOut");
    // …and out on "the decision is yours": brows release, a slow blink
    amal.key(2.9, { shrug: -0.5, browInner: 0, browKnit: 0, lidL: 0.7, lidR: 0.7 }, "out").blink(3.0, 1.4);
    // resolve: a small nod and the beginning of a smile, then back to the screen
    amal.key(3.6, { headNod: 8 }, "sine").key(4.0, { headNod: 5 }, "sine").key(4.1, RS.EXPRESSIONS.reassured, "inOut")
      .key(4.3, { smile: 0.32 }, "inOut").key(4.4, { lookX: 0.8, lookY: 1.0 }, "out").key(4.7, { headNod: 9, headTurn: 0.5, headTilt: 0 }, "inOut");
    amal.autoBlink(-1, CUT + 0.2, { quiet: [[2.6, 3.8]] });
    RS.driveScene(ctx, [amal]);
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.5], [L.mid, 0.7], [L.near, 1], [L.fg, 1]], [
      { t: -ctx.transIn, ...cam(1.85, 760, 470) }, { t: CUT + 0.1, ...cam(2.02, 750, 460), ease: "sine.inOut" },
    ], [0, 0]);

    // ---------------------------------------------------------------- shot B: the tap
    const shotB = el("g", { class: "shotB", opacity: 0 }, shell);
    el("rect", { x: -100, y: -100, width: 2200, height: 1300, fill: "#e9e2d6" }, shotB);
    const tab = el("g", {}, shotB);
    el("rect", { x: 160, y: 70, width: 1600, height: 960, rx: 46, fill: "#24343a" }, tab);
    const cp = el("clipPath", { id: `${ctx.lang}-s6clip` }, RS.defs(svg));
    el("rect", { x: 200, y: 110, width: 1520, height: 880, rx: 18 }, cp);
    const scr = el("g", { "clip-path": `url(#${ctx.lang}-s6clip)` }, tab);
    const screen = el("g", { transform: "translate(200 110) scale(1.2667 1.158)" }, scr);
    const prop = RS.proposalScreen(svg, screen, S, rtl, `${ctx.lang}-s6`);
    [prop.c1, prop.c2, prop.c3, prop.acts, ...prop.steps].forEach((n) => n.setAttribute("opacity", 1));
    prop.hl.setAttribute("opacity", 0.12);
    // acknowledgement: paper scrim + card, in layout space (1200 × 760)
    const ack = el("g", { opacity: 0 }, screen);
    el("rect", { width: 1200, height: 760, fill: T.paper, opacity: 0.86 }, ack);
    const card = el("g", {}, ack);
    const u = { w: 1200, rtl };
    RS.ui.rect(card, u, 330, 250, 540, 250, { r: 16, fill: T.white, stroke: T.line });
    const ck = RS.ui.check(card, 600, 318, 30, {});
    RS.ui.text(card, u, 330, 392, S.decision.done, { kind: "head", size: 30, weight: 600, fill: T.heading, anchor: "middle" }).setAttribute("x", 600);
    const note = RS.ui.wrap(card, u, 370, 436, S.decision.note, { size: 19, fill: T.ink, maxW: 460, lh: 28 });
    note.querySelectorAll("text").forEach((t) => { t.setAttribute("x", 600); t.setAttribute("text-anchor", "middle"); });
    el("path", { d: "M200 110 L700 110 L380 990 L200 990 Z", fill: "#fff", opacity: 0.04 }, tab);

    // thumb: tip on the button centre (screen space)
    const btn = { x: 200 + (rtl ? 1200 - 198 : 198) * 1.2667, y: 110 + 686 * 1.158 };
    const { thumb, shape } = RS.props.thumb(svg, tab, { id: `${ctx.lang}-s6`, rtl, s: 1.9 });
    const home = { x: btn.x + (rtl ? -320 : 320), y: 1260 };
    tl.set(thumb, { x: home.x, y: home.y }, at(CUT));
    tl.set(shape, { transformOrigin: "50% 0%" }, at(CUT));
    tl.to(thumb, { x: btn.x + (rtl ? -40 : 40), y: btn.y + 40, duration: 0.55, ease: "power2.out" }, at(CUT + 0.25));
    // a beat of hesitation over the button, then the press
    tl.to(thumb, { x: btn.x, y: btn.y, duration: 0.45, ease: "power2.inOut" }, at(TAP - 0.45));
    tl.to(shape, { scale: 0.94, y: 3, duration: 0.08, ease: "power1.in" }, at(TAP));
    tl.to(shape, { scale: 1, y: 0, duration: 0.14, ease: "power1.out" }, at(TAP + 0.1));
    tl.to(prop.cont, { scale: 0.97, svgOrigin: `${rtl ? 1002 : 198} 686`, duration: 0.08 }, at(TAP));
    tl.to(prop.cont, { scale: 1, svgOrigin: `${rtl ? 1002 : 198} 686`, duration: 0.18, ease: "power2.out" }, at(TAP + 0.1));
    ctx.sfx(TAP, "phone_taps", -24, { dur: 0.32, pan: rtl ? 0.4 : 0.6 });
    tl.to(thumb, { x: home.x, y: home.y, duration: 0.6, ease: "power2.in" }, at(TAP + 0.35));
    // acknowledgement
    tl.to(ack, { opacity: 1, duration: 0.4, ease: "sine.out" }, at(TAP + 0.45));
    tl.fromTo(card, { y: 18 }, { y: 0, duration: 0.5, ease: "power2.out" }, at(TAP + 0.45));
    tl.fromTo(ck, { scale: 0, svgOrigin: "600 318" }, { scale: 1, svgOrigin: "600 318", duration: 0.45, ease: "back.out(2)" }, at(TAP + 0.6));
    ctx.sfx(TAP + 0.6, "ui_submitted", -28);

    // framing: close on the estimate and the actions — the range is never framed without its non-binding note —
    // then ease back to the acknowledgement card
    tl.set(tab, { scale: 1.3, x: 0, y: 540 - 800, svgOrigin: "960 800" }, at(CUT));
    tl.to(tab, { scale: 1.34, x: 0, y: 540 - 800, svgOrigin: "960 800", duration: TAP - CUT, ease: "sine.inOut" }, at(CUT));
    tl.to(tab, { scale: 1.12, x: 0, y: -10, svgOrigin: "960 550", duration: 1.3, ease: "power2.inOut" }, at(TAP + 0.4));
    tl.to(tab, { scale: 1.16, duration: D - TAP - 1.7, ease: "sine.inOut", svgOrigin: "960 550" }, at(TAP + 1.7));

    tl.to(shotA, { opacity: 0, duration: 0.3, ease: "sine.inOut" }, at(CUT));
    tl.fromTo(shotB, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" }, at(CUT));
    ctx.amb("amb_home_day", -47);
  };
})();
