/*
 * Scene 8 — Arrival.
 * Shot A: Cairo arrivals hall. Amal walks in pulling her suitcase, a little travel-worn; the camera tracks with
 * her until she finds her driver's sign and her face eases. Shot B: the back seat of the car, the Nile and palms
 * sliding past; her phone holds the practical details, organized for her: driver, hotel, tomorrow's appointment.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s08-arrival"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T, A = S.arrival;
    const CUT = 4.6;

    // ================================================================ shot A — arrivals hall
    const shotA = el("g", { class: "shotA" }, shell);
    const worldA = el("g", { class: "world" }, shotA);
    const LA = RS.env.airport(svg, worldA, { id: `${ctx.lang}-s8ap`, rtl, hall: A.hall, signX: 1500 });

    // driver with a welcome tablet, softly out of focus except the screen
    const drv = el("g", { transform: "translate(2080 300) scale(0.95)" }, LA.mid);
    const dBlur = el("g", { filter: `url(#${ctx.lang}-s8ap-blur)` }, drv);
    el("circle", { cx: 0, cy: 0, r: 46, fill: "#6e5444" }, dBlur);
    el("path", { d: "M-46 -6 C-44 -44 44 -50 46 -8 C30 -24 -30 -24 -46 -6 Z", fill: "#2a211d" }, dBlur);
    el("path", { d: "M-90 70 C-80 40 80 40 90 70 L100 520 L-100 520 Z", fill: "#2f3b45" }, dBlur);
    el("path", { d: "M-20 64 L0 120 L20 64 Z", fill: "#e9e4dc" }, dBlur);
    el("rect", { x: -80, y: 512, width: 64, height: 280, fill: "#262f37" }, dBlur);
    el("rect", { x: 16, y: 512, width: 64, height: 280, fill: "#262f37" }, dBlur);
    const card = el("g", { transform: "translate(-150 150)" }, drv);
    el("rect", { x: -10, y: -10, width: 320, height: 210, rx: 18, fill: "#24343a" }, card);
    el("rect", { width: 300, height: 190, rx: 10, fill: T.white }, card);
    const cu = { w: 300, rtl };
    const lg = RS.ui.logo(card, 0, 22, 34);
    lg.setAttribute("transform", `translate(${(300 - lg.w) / 2} 22)`);
    el("rect", { x: 30, y: 84, width: 240, height: 2, fill: T.line }, card);
    RS.ui.text(card, cu, 0, 138, A.welcome, { kind: "head", size: 30, weight: 600, fill: T.heading, anchor: "middle" }).setAttribute("x", 150);
    el("path", { d: "M-40 220 C-20 200 0 196 20 200 L40 230 L-30 240 Z", fill: "#7b5a47", filter: `url(#${ctx.lang}-s8ap-blur)` }, card);

    // Amal, standing: holder (travels) → carrier (bobs) → rig
    const holder = el("g", {}, LA.near);
    const carrier = el("g", {}, holder);
    const amal = RS.place(carrier, "amal", { x: 0, y: -20, s: 0.86, seed: 81, id: `${ctx.lang}-s8-amal` });
    RS.standUp(svg, amal);
    // telescopic handle + trailing case, in hand space so the grip stays in her fingers
    const hcase = RS.attach(amal, "Near", { front: false, transform: "translate(14 4)" });
    el("rect", { x: -6, y: -30, width: 26, height: 60, rx: 10, fill: "#2b3236" }, hcase);
    el("rect", { x: 14, y: -22, width: 300, height: 8, fill: "#9aa3a6" }, hcase);
    el("rect", { x: 14, y: 14, width: 300, height: 8, fill: "#9aa3a6" }, hcase);
    el("rect", { x: 300, y: -170, width: 520, height: 340, rx: 36, fill: "#3f5b60" }, hcase);
    el("rect", { x: 300, y: -170, width: 520, height: 340, rx: 36, fill: "none", stroke: "#2f474b", "stroke-width": 8 }, hcase);
    [390, 500, 610, 720].forEach((x) => el("rect", { x, y: -160, width: 7, height: 320, fill: "#355054" }, hcase));
    el("rect", { x: 330, y: -120, width: 44, height: 44, rx: 8, fill: T.coral, opacity: 0.85 }, hcase); // luggage tag
    el("rect", { x: 806, y: -150, width: 30, height: 40, rx: 8, fill: "#22292c" }, hcase); // wheels
    el("rect", { x: 806, y: 110, width: 30, height: 40, rx: 8, fill: "#22292c" }, hcase);

    amal.key(-1, { shoulderNear: 16, elbowNear: 62, wristNear: -4, shoulderFar: 4, elbowFar: 50, wristFar: 6, lean: 1.2,
      lookX: 0.95, lookY: 0.45, headNod: 2, headTurn: 0.6, lidL: 0.85, lidR: 0.85 })
      .key(-1, RS.EXPRESSIONS.neutral).key(-1, { browInner: 0.4 }).hand(-1, "Near", "hold").hand(-1, "Far", "loose");
    // scanning the hall, a little tired
    amal.key(0.9, { lookX: 0.6, lookY: 0.35, headTurn: 0.3 }, "inOut").key(1.7, { lookX: 1, lookY: 0.45, headTurn: 0.7 }, "inOut");
    // she spots her name: eyes first, a small lift of the brows, then ease and a smile
    amal.key(2.6, { lookX: 1, lookY: 0.3 }, "out").key(2.7, { browRaise: 0.9, browInner: 0, lidL: 1, lidR: 1 }, "out")
      .key(2.9, { headTurn: 0.9, headNod: 0 }, "inOut").key(3.3, RS.EXPRESSIONS.reassured, "inOut").key(3.5, { smile: 0.42 }, "inOut")
      .key(3.7, { headNod: 5 }, "sine").key(4.1, { headNod: 1 }, "sine");
    amal.autoBlink(-1, CUT + 0.3, { quiet: [[2.5, 3.0]] });
    RS.walk(ctx, amal, carrier, { t0: -ctx.transIn, t1: 4.2, cadence: 1.7, swing: 12, bob: 5, freeArm: "Far", armBase: 4 });
    tl.fromTo(holder, { x: 380 }, { x: 860, duration: 4.2 + ctx.transIn, ease: "none" }, at(-ctx.transIn));
    tl.to(holder, { x: 900, duration: 0.6, ease: "power2.out" }, at(4.2));

    // ================================================================ shot B — the car
    const shotB = el("g", { class: "shotB", opacity: 0 }, shell);
    const worldB = el("g", { class: "world" }, shotB);
    const LB = RS.env.car(svg, worldB, { id: `${ctx.lang}-s8car` });
    const amalB = RS.place(LB.near, "amal", { x: 110, y: 70, s: 1.22, seed: 83, id: `${ctx.lang}-s8-amalB` });
    const phone = RS.attach(amalB, "Near", { front: false, transform: "translate(30 -6) rotate(-62)" });
    el("rect", { x: -6, y: -36, width: 52, height: 100, rx: 9, fill: "#1f2a2e" }, phone);
    el("rect", { x: -2, y: -32, width: 44, height: 92, rx: 6, fill: "#dfeeea", opacity: 0.85 }, phone);
    // the itinerary, organized by her coordination team (floats beside her, phone-card styling)
    const it = el("g", { class: "itinerary" }, LB.fg);
    const iu = { w: 1920, rtl }, ix = rtl ? 1920 - 1120 - 660 : 1120;
    const rows = [["car", A.driver], ["bed", A.to], ["calendar", A.appt]].map(([icon, label], i) => {
      const g = el("g", { opacity: 0 }, it);
      RS.ui.rect(g, iu, ix, 250 + i * 104, 660, 88, { r: 16, fill: T.white, stroke: T.line });
      RS.ui.iconWell(g, iu, icon, ix + 18, 266 + i * 104, 56, {});
      RS.ui.text(g, iu, ix + 92, 304 + i * 104, label, { size: 27, weight: 600, fill: T.heading });
      if (i === 2) RS.ui.check(g, RS.ui.X(iu, ix + 660 - 46, 0), 294 + i * 104, 16, {});
      return g;
    });
    amalB.key(-1, { shoulderNear: -14, elbowNear: 4, wristNear: -6, shoulderFar: -2, elbowFar: 34, wristFar: 8, lookX: 0.6, lookY: 0.95, headNod: 9, headTurn: 0.4, lidL: 0.78, lidR: 0.78 })
      .key(-1, RS.EXPRESSIONS.attentive).hand(-1, "Near", "phone").hand(-1, "Far", "rest");
    rows.forEach((g, i) => {
      const t = CUT + 0.7 + i * 0.55;
      tl.fromTo(g, { opacity: 0, x: rtl ? -14 : 14 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, at(t));
      ctx.sfx(t, "ui_message", -33 - i);
      amalB.key(t + 0.05, { lookY: 0.9 + (i % 2) * 0.08 }, "sine");
    });
    // reassured, she looks up and out at the city
    amalB.key(CUT + 2.6, RS.EXPRESSIONS.reassured, "inOut").key(CUT + 2.9, { lookX: 1, lookY: 0.3 }, "out")
      .key(CUT + 3.2, { headNod: 1, headTurn: 0.9, headTilt: -1 }, "inOut").key(CUT + 3.4, { shoulderNear: -10, elbowNear: 10, wristNear: 0 }, "inOut")
      .key(CUT + 3.9, { shrug: 0.5 }, "inOut").key(CUT + 4.6, { shrug: -0.4, smile: 0.38, lidL: 0.82, lidR: 0.82 }, "out");
    // the car's gentle sway
    for (let t = CUT; t < D; t += 0.9) amalB.key(t, { lean: 0.6 + Math.sin(t * 2.3) * 0.5 }, "sine");
    amalB.autoBlink(CUT - 0.2, D, {}).blink(CUT + 2.85);
    RS.driveScene(ctx, [amal, amalB]);
    tl.fromTo(LB.outside.far, { x: 0 }, { x: -260, duration: D - CUT + 0.4, ease: "none" }, at(CUT - 0.2));
    tl.fromTo(LB.outside.near, { x: 0 }, { x: -1500, duration: D - CUT + 0.4, ease: "none" }, at(CUT - 0.2));

    // ---------------------------------------------------------------- cut, cameras, sound
    tl.to(shotA, { opacity: 0, duration: 0.3, ease: "sine.inOut" }, at(CUT));
    tl.fromTo(shotB, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "sine.inOut" }, at(CUT));
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[LA.far, 0.45], [LA.mid, 0.75], [LA.near, 1], [LA.fg, 1.15]], [
      { t: -ctx.transIn, ...cam(1.0, 1000, 540) }, { t: 4.3, ...cam(1.0, 1420, 540), ease: "sine.inOut" },
      { t: CUT + 0.3, ...cam(1.03, 1450, 530), ease: "sine.out" },
    ], [0, 0]);
    tl.fromTo(worldB, { scale: 1.02, svgOrigin: "800 540" }, { scale: 1.08, svgOrigin: "800 540", duration: D - CUT + 0.1, ease: "sine.inOut" }, at(CUT));

    ctx.sfx(0.0, "footsteps", -29, { dur: 4.2, pan: 0.45 });
    ctx.sfx(0.0, "suitcase", -33, { dur: 4.3, pan: 0.35 });
    ctx.sfx(CUT - 0.05, "car_door", -24, { pan: 0.7 });
    ctx.amb("amb_airport", -44, { to: CUT + 0.4, fadeOut: 0.5 });
    ctx.amb("amb_street", -50, { from: CUT - 0.1, fadeIn: 0.5 });
  };
})();
