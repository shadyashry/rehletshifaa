/*
 * Scene 3 — Your dedicated Coordinator.
 * The received case lands on Nour's monitor and the documents sort themselves into an organized file; the
 * camera pulls back to reveal Nour checking it, cross-reading a paper report, confirming nothing is
 * missing, writing to Amal, and passing the prepared case to the Consultant (match into scene 4).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s03-coordinator"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur;
    const at = ctx.at;
    const T = RS.T;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.office(svg, world, { pinboard: false });
    const DESK_Y = 868;

    // ---------------------------------------------------------------- monitor + UI
    const mon = RS.props.monitor(svg, L.near, { id: `${ctx.lang}-s3mon`, sw: 760, sh: 470 });
    mon.g.setAttribute("transform", "translate(950 262)");
    const sc = mon.screen;
    const u = { w: 760, rtl };
    // header
    el("rect", { x: 0, y: 0, width: 760, height: 58, fill: T.white }, sc);
    el("rect", { x: 0, y: 57, width: 760, height: 1.5, fill: T.line }, sc);
    RS.ui.text(sc, u, 24, 26, S.office.caseFile, { size: 12, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1.4 });
    RS.ui.text(sc, u, 24, 46, S.phone.caseNo + "  ·  " + S.office.patient, { size: 15, weight: 700, fill: T.heading });
    // status pill (cycles Received → Organized → Ready for Consultant)
    const pillG = el("g", {}, sc);
    const pills = S.office.status.map((label, i) => {
      const g = el("g", { opacity: i === 0 ? 1 : 0 }, pillG);
      const w = 30 + label.length * (rtl ? 8.2 : 7.6);
      RS.ui.rect(g, u, 760 - 24 - w, 16, w, 28, { r: 14, fill: i === 2 ? T.petrol600 : T.petrol50, stroke: i === 2 ? null : T.petrol100 });
      RS.ui.text(g, u, 760 - 24 - w + 15, 35, label, { size: 12.5, weight: 700, fill: i === 2 ? T.white : T.petrol600 });
      return g;
    });
    // document list (reading-start column)
    const colW = 400;
    RS.ui.text(sc, u, 24, 92, S.phone.step, { size: 13, weight: 700, fill: T.muted });
    const icons = ["file", "image", "camera", "clipboard"];
    const rows = S.office.docs.map((d, i) => {
      const r = RS.ui.fileRow(sc, u, 24, 106 + i * 62, colW, 52, icons[i], d);
      r.g.setAttribute("opacity", 0);
      return r;
    });
    // coordinator check
    const chk = el("g", { opacity: 0 }, sc);
    RS.ui.rect(chk, u, 24, 362, colW, 44, { r: 10, fill: T.petrol50, stroke: T.petrol100 });
    RS.ui.check(chk, RS.ui.X(u, 24 + 22), 384, 11);
    RS.ui.text(chk, u, 24 + 44, 389, S.office.check, { size: 14, weight: 700, fill: T.petrol700 });
    // message panel (reading-end column)
    const mx = 24 + colW + 20, mw = 760 - mx - 24;
    const msgPanel = el("g", { opacity: 0 }, sc);
    RS.ui.rect(msgPanel, u, mx, 84, mw, 330, { r: 12, fill: T.paperDeep, stroke: T.line });
    RS.ui.iconWell(msgPanel, u, "message", mx + 14, 98, 30, { fill: T.white });
    RS.ui.text(msgPanel, u, mx + 54, 119, S.office.msgTo, { size: 14, weight: 700, fill: T.heading });
    const bubble = RS.ui.bubble(msgPanel, u, mx + 14, 146, mw - 28, S.office.msg, { side: "out", size: 13.5 });
    // typewriter: reveal the bubble with a growing clip from the reading-start edge
    const bcid = `${ctx.lang}-s3-bclip`;
    const bclip = el("clipPath", { id: bcid }, RS.defs(svg));
    const bRect = el("rect", { x: RS.ui.X(u, mx + 14, mw - 28), y: 146, width: 0, height: 0 }, bclip);
    bubble.setAttribute("clip-path", `url(#${bcid})`);
    const sent = el("g", { opacity: 0 }, msgPanel);
    RS.ui.text(sent, u, mx + 14, 146 + bubble.h + 22, "✓✓", { size: 13, weight: 700, fill: T.petrol400 });
    // assignment banner
    const asg = el("g", { opacity: 0 }, sc);
    RS.ui.rect(asg, u, 24, 420, 712, 38, { r: 10, fill: T.petrol600 });
    RS.ui.icon(asg, "steth", RS.ui.X(u, 38, 22), 428, 22, T.white, 2);
    RS.ui.text(asg, u, 70, 445, S.office.assign, { size: 14.5, weight: 700, fill: T.white });

    // ---------------------------------------------------------------- desk, props, Nour
    RS.desk(svg, L.fg, { id: `${ctx.lang}-s3desk`, y0: DESK_Y, y1: 1060, topFar: "#d9c6a6", topNear: "#e6d5b9" });
    const kb = RS.props.keyboard(svg, L.fg, { transform: "translate(600 900) matrix(1 0 -0.5 0.36 0 0)" });
    RS.props.mug(svg, L.fg, { transform: "translate(1660 930) scale(1.15)" });
    const sheet = RS.props.sheet(svg, L.fg, { id: `${ctx.lang}-s3sheet`, transform: "translate(250 905) matrix(1 0 0.42 0.34 0 0) rotate(-6)", variant: "knee" });
    world.insertBefore(L.fg, L.near.nextSibling);
    const armsBehind = el("g", {}, world); world.insertBefore(armsBehind, L.near);
    const nourLayer = el("g", {}, world); world.insertBefore(nourLayer, L.fg);
    const armsTop = el("g", {}, world);
    world.appendChild(L.light);

    const nour = RS.place(nourLayer, "nour", { x: 105, y: -18, s: 1.25, seed: 41, id: `${ctx.lang}-s3-nour` });
    RS.seatAtDesk(svg, nour, DESK_Y, { behind: armsBehind, front: armsTop });
    // L.near holds the monitor: keep it behind Nour's near arm but in front of the wall
    RS.props.beam(svg, L.light, { id: `${ctx.lang}-s3beam`, a: 0.2, d: "M1380 60 L1800 60 L1500 1080 L700 1080 Z" });

    // ---------------------------------------------------------------- acting (local seconds)
    const vo = ctx.vo(0);
    nour.key(-1, { shoulderNear: -16, elbowNear: 16, wristNear: 2, shoulderFar: -8, elbowFar: 8, lookX: 0.55, lookY: 0.2, headTurn: 0.4, lean: 1.5 })
      .key(-1, RS.EXPRESSIONS.attentive).hand(-1, "Near", "type").hand(-1, "Far", "type");
    // reads the arriving documents
    RS.type(nour, 0.3, 1.6, { seed: 3, wrist: 2 });
    nour.key(1.8, { lookX: 0.7, lookY: 0.05 }, "inOut").key(2.4, { headNod: 2.5 }, "sine").key(2.8, { headNod: 0 }, "sine");
    // compares with the printed report: looks down to the sheet, slight lean, then back
    nour.key(3.3, { lookX: -0.5, lookY: 0.95, headTurn: -0.8, headNod: 5, headTilt: 3, lidL: 0.75, lidR: 0.75 }, "inOut")
      .key(3.3, RS.EXPRESSIONS.thoughtful, "inOut").hand(3.4, "Far", "point")
      .key(3.5, { shoulderFar: -4, elbowFar: 20 }, "settle")
      .key(4.7, { lookX: 0.65, lookY: 0.15, headTurn: 0.4, headNod: 0, headTilt: 0, lidL: 1, lidR: 1 }, "inOut")
      .key(4.8, { shoulderFar: -8, elbowFar: 8 }, "inOut").hand(4.9, "Far", "type");
    // confirms nothing is missing: small satisfied nod
    nour.key(5.4, RS.EXPRESSIONS.reassured, "inOut").key(5.5, { headNod: 3 }, "sine").key(5.9, { headNod: 0 }, "sine");
    // writes to Amal
    RS.type(nour, 6.2, 8.3, { seed: 9, wrist: 2 });
    nour.key(6.2, RS.EXPRESSIONS.warm, "inOut").key(8.0, { smile: 0.3 }, "inOut");
    // sends, then passes the case on
    nour.key(8.6, { lean: 0.4, shrug: -0.3 }, "inOut").hand(8.7, "Near", "rest").key(8.8, { elbowNear: 12, wristNear: 0 }, "inOut")
      .key(9.6, { headNod: 2, lookY: 0.05 }, "sine").key(10.2, { headNod: 0 }, "sine");
    nour.autoBlink(-1, D, { quiet: [[3.3, 4.6]] }).blink(1.75).blink(4.75).blink(8.65);
    RS.driveScene(ctx, [nour]);

    // ---------------------------------------------------------------- UI choreography (synced to acting)
    rows.forEach((r, i) => {
      const t = 0.15 + i * 0.32;
      tl.fromTo(r.g, { opacity: 0, x: rtl ? -24 : 24 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" }, at(t));
      tl.fromTo(r.bar, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: "power1.inOut" }, at(t + 0.25));
      tl.fromTo(r.check, { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, at(t + 0.85));
    });
    ctx.sfx(0.1, "papers_slide", -14);
    tl.to(pills[0], { opacity: 0, duration: 0.25 }, at(5.1));
    tl.fromTo(pills[1], { opacity: 0 }, { opacity: 1, duration: 0.3 }, at(5.15));
    tl.fromTo(chk, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, at(5.35));
    ctx.sfx(5.35, "ui_confirm", -20);
    tl.fromTo(msgPanel, { opacity: 0 }, { opacity: 1, duration: 0.45 }, at(5.95));
    tl.fromTo(bRect, { attr: { height: bubble.h, width: 0 } }, { attr: { height: bubble.h, width: mw - 28 }, duration: 2.0, ease: "none" }, at(6.25));
    tl.fromTo(sent, { opacity: 0 }, { opacity: 1, duration: 0.2 }, at(8.75));
    ctx.sfx(8.75, "ui_message", -22);
    tl.to(pills[1], { opacity: 0, duration: 0.25 }, at(9.9));
    tl.fromTo(pills[2], { opacity: 0 }, { opacity: 1, duration: 0.3 }, at(9.95));
    tl.fromTo(asg, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, at(10.0));
    ctx.sfx(10.0, "ui_calendar", -22);
    // keystroke foley only where typing is visible
    ctx.sfx(0.35, "keyboard_soft", -24, { dur: 1.3 });
    ctx.sfx(6.25, "keyboard_soft", -23, { dur: 2.0 });
    ctx.sfx(3.45, "paper_pickup", -24);
    ctx.sfx(8.6, "chair_settle", -27);
    ctx.amb("roomtone_office", -46);

    // ---------------------------------------------------------------- camera: from the screen to the person
    // opens tight on the monitor (match from the phone), then a motivated pull-back reveals Nour
    const mcx = 950 + 380, mcy = 262 + 235;
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.6], [L.mid, 0.8], [armsBehind, 1], [nourLayer, 1], [L.near, 1], [L.fg, 1], [armsTop, 1], [L.light, 0.7]], [
      { t: -1, ...cam(1.85, mcx, mcy) }, { t: 1.6, ...cam(1.78, mcx, mcy) },
      { t: 3.6, ...cam(1.04, 960, 560), ease: "power2.inOut" }, { t: D, ...cam(1.1, 1010, 560), ease: "sine.inOut" },
    ], [0, 0]);
  };
})();
