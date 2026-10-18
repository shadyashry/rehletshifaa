/*
 * Scene 7 — Medical appointments first, then optional travel support.
 * Nour builds Amal's journey plan. The appointment is requested and confirmed before anything else; only then
 * does the optional-support section open, and only the services Amal asked for are ticked (flights and visa
 * stay unticked: travel support is optional and arranged only after her decision). The plan is handed to Operations.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s07-appointments"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T, P = S.plan;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.office(svg, world, { pinboard: false });
    const DESK_Y = 868;

    // ---------------------------------------------------------------- monitor: journey plan
    const mon = RS.props.monitor(svg, L.near, { id: `${ctx.lang}-s7mon`, sw: 760, sh: 470 });
    mon.g.setAttribute("transform", "translate(950 262)");
    const sc = mon.screen;
    const u = { w: 760, rtl };
    el("rect", { width: 760, height: 470, fill: T.paper }, sc);
    el("rect", { width: 760, height: 58, fill: T.white }, sc);
    el("rect", { y: 57, width: 760, height: 1.5, fill: T.line }, sc);
    RS.ui.text(sc, u, 24, 26, P.title, { size: 12, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1.4 });
    RS.ui.text(sc, u, 24, 46, S.phone.caseNo + "  ·  " + S.office.patient, { size: 15, weight: 700, fill: T.heading });

    // 1 · medical appointments
    RS.ui.text(sc, u, 24, 90, "1  ·  " + P.medical, { size: 13, weight: 700, fill: T.muted });
    const appt = el("g", { opacity: 0 }, sc);
    RS.ui.rect(appt, u, 24, 102, 712, 86, { r: 12, fill: T.white, stroke: T.line });
    RS.ui.iconWell(appt, u, "calendar", 40, 119, 52, {});
    RS.ui.text(appt, u, 108, 140, P.appt, { size: 17, weight: 700, fill: T.heading });
    RS.ui.text(appt, u, 108, 166, P.apptWhen, { size: 14, fill: T.ink });
    const pill = (label, on) => {
      const g = el("g", { opacity: 0 }, appt);
      const w = 132;
      RS.ui.rect(g, u, 760 - 40 - w, 130, w, 30, { r: 15, fill: on ? T.petrol600 : T.paperDeep });
      RS.ui.text(g, u, 760 - 40 - w, 150, label, { size: 13.5, weight: 700, fill: on ? T.white : T.muted, anchor: "middle" }).setAttribute("x", RS.ui.X(u, 760 - 40 - w, w) + w / 2);
      return g;
    };
    const pReq = pill(P.requested, false), pOk = pill(P.confirmed, true);

    // 2 · optional support (opens only after the appointment is confirmed)
    const opt = el("g", { opacity: 0 }, sc);
    RS.ui.text(opt, u, 24, 222, "2  ·  " + P.optional, { size: 13, weight: 700, fill: T.muted });
    const noteW = 300;
    RS.ui.rect(opt, u, 760 - 24 - noteW, 206, noteW, 24, { r: 12, fill: T.petrol50 });
    RS.ui.text(opt, u, 760 - 24 - noteW, 223, P.optNote, { size: 12, weight: 600, fill: T.petrol700, anchor: "middle" }).setAttribute("x", RS.ui.X(u, 760 - 24 - noteW, noteW) + noteW / 2);
    const icons = ["plane", "bed", "passport", "car"];
    const tiles = P.services.map((label, i) => {
      const x = 24 + (i % 2) * 364, y = 240 + Math.floor(i / 2) * 82;
      const g = el("g", { opacity: 0 }, opt);
      RS.ui.rect(g, u, x, y, 348, 70, { r: 12, fill: T.white, stroke: T.line });
      RS.ui.iconWell(g, u, icons[i], x + 13, y + 13, 44, {});
      RS.ui.text(g, u, x + 70, y + 41, label, { size: 15, weight: 600, fill: T.heading });
      const cb = RS.ui.checkbox(g, u, x + 348 - 16 - 24, y + 23, 24, "");
      return { g, cb };
    });
    // hand-off to Operations
    const ops = el("g", { opacity: 0 }, sc);
    RS.ui.rect(ops, u, 24, 414, 712, 40, { r: 10, fill: T.petrol600 });
    RS.ui.icon(ops, "user", RS.ui.X(u, 40, 22), 423, 22, T.white, 2);
    RS.ui.text(ops, u, 74, 440, P.ops + "  ·  " + P.services[1] + (rtl ? "، " : ", ") + P.services[3], { size: 14.5, weight: 700, fill: T.white });

    // ---------------------------------------------------------------- desk, props, Nour
    RS.desk(svg, L.fg, { id: `${ctx.lang}-s7desk`, y0: DESK_Y, y1: 1060, topFar: "#d9c6a6", topNear: "#e6d5b9" });
    RS.props.keyboard(svg, L.fg, { transform: "translate(600 900) matrix(1 0 -0.5 0.36 0 0)" });
    RS.props.mug(svg, L.fg, { transform: "translate(1660 930) scale(1.15)" });
    world.insertBefore(L.fg, L.near.nextSibling);
    const armsBehind = el("g", {}, world); world.insertBefore(armsBehind, L.near);
    const nourLayer = el("g", {}, world); world.insertBefore(nourLayer, L.fg);
    const armsTop = el("g", {}, world);
    world.appendChild(L.light);
    const nour = RS.place(nourLayer, "nour", { x: 105, y: -18, s: 1.25, seed: 71, id: `${ctx.lang}-s7-nour` });
    RS.seatAtDesk(svg, nour, DESK_Y, { behind: armsBehind, front: armsTop });
    RS.props.beam(svg, L.light, { id: `${ctx.lang}-s7beam`, a: 0.16, d: "M1380 60 L1800 60 L1500 1080 L700 1080 Z" });

    // ---------------------------------------------------------------- acting
    nour.key(-1, { shoulderNear: -16, elbowNear: 16, wristNear: 2, shoulderFar: -8, elbowFar: 8, lookX: 0.6, lookY: 0.2, headTurn: 0.4, lean: 1.5 })
      .key(-1, RS.EXPRESSIONS.attentive).hand(-1, "Near", "type").hand(-1, "Far", "type");
    RS.type(nour, 0.2, 1.5, { seed: 13, wrist: 2 });
    // books the appointment: reads, types the request, waits for the confirmation
    nour.key(1.7, { lookX: 0.7, lookY: 0.1, headNod: 1.5 }, "inOut").key(2.3, { headNod: 0 }, "sine");
    RS.type(nour, 2.6, 4.0, { seed: 17, wrist: 2 });
    nour.key(4.1, { lean: 2.2, browRaise: 0.4 }, "inOut").blink(4.3);
    // confirmed: a small satisfied nod
    nour.key(5.0, RS.EXPRESSIONS.reassured, "inOut").key(5.1, { headNod: 3, lean: 1.5 }, "sine").key(5.5, { headNod: 0 }, "sine");
    // optional support: only what Amal asked for — two deliberate clicks
    nour.key(6.2, RS.EXPRESSIONS.attentive, "inOut").key(6.3, { lookY: 0.3, lookX: 0.6 }, "inOut");
    [7.0, 7.6].forEach((t) => nour.key(t - 0.12, { handNearIndex: 0.55, wristNear: 4 }, "sine").key(t + 0.08, { handNearIndex: 0.2, wristNear: 2 }, "sine"));
    // hands the plan to Operations and sits back, warm
    nour.key(8.9, RS.EXPRESSIONS.warm, "inOut").key(9.1, { lean: 0.6, shrug: -0.3 }, "inOut").hand(9.2, "Near", "rest")
      .key(9.6, { headNod: 2 }, "sine").key(10.1, { headNod: 0 }, "sine");
    nour.autoBlink(-1, D, { quiet: [[4.0, 4.8]] }).blink(1.65).blink(6.15);
    RS.driveScene(ctx, [nour]);

    // ---------------------------------------------------------------- UI choreography
    tl.fromTo(appt, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at(2.7));
    tl.set(pReq, { opacity: 1 }, at(2.7));
    tl.to(pReq, { opacity: 0, duration: 0.2 }, at(4.95));
    tl.fromTo(pOk, { opacity: 0, scale: 0.85, svgOrigin: `${RS.ui.X(u, 654, 0)} 145` }, { opacity: 1, scale: 1, svgOrigin: `${RS.ui.X(u, 654, 0)} 145`, duration: 0.35, ease: "back.out(2)" }, at(5.0));
    ctx.sfx(5.0, "ui_calendar", -24);
    tl.fromTo(opt, { opacity: 0 }, { opacity: 1, duration: 0.4 }, at(5.9));
    tiles.forEach((t, i) => tl.fromTo(t.g, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, at(6.0 + i * 0.16)));
    // Accommodation and Airport transfer — the two Amal chose
    [[1, 7.0], [3, 7.6]].forEach(([i, t]) => {
      tl.fromTo(tiles[i].cb.tick, { opacity: 0 }, { opacity: 1, duration: 0.12 }, at(t));
      ctx.sfx(t, "ui_confirm", -30);
    });
    tl.fromTo(ops, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at(8.9));
    ctx.sfx(8.9, "ui_message", -27);
    ctx.sfx(0.25, "keyboard_soft", -25, { dur: 1.2 });
    ctx.sfx(2.65, "keyboard_soft", -25, { dur: 1.3 });
    ctx.sfx(9.15, "chair_settle", -29);
    ctx.amb("roomtone_office", -46);

    // ---------------------------------------------------------------- camera: Nour at work → the plan
    const mcx = 950 + 380, mcy = 262 + 235;
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.6], [L.mid, 0.8], [armsBehind, 1], [nourLayer, 1], [L.near, 1], [L.fg, 1], [armsTop, 1], [L.light, 0.7]], [
      { t: -ctx.transIn, ...cam(1.0, 960, 560) }, { t: 3.6, ...cam(1.06, 980, 550), ease: "sine.inOut" },
      // close enough to read the plan, wide enough to keep Nour's face in frame
      { t: 4.7, ...cam(1.26, 1115, 520), ease: "power2.inOut" }, { t: 6.3, ...cam(1.3, 1125, 520), ease: "sine.inOut" },
      { t: D + 0.05, ...cam(1.34, 1130, 520), ease: "sine.inOut" },
    ], [0, 0]);
  };
})();
