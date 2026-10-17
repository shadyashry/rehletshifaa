/*
 * Scene 4 — Consultant-led review. Match from the prepared case on Nour's screen to the same case on the
 * Consultant's tablet; pull back to the Consultant reading the printed report, tracking lines with a finger,
 * checking the imaging, pausing to think, then writing the recommendation (mirrored on the tablet).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s04-consultant"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.consultRoom(svg, world);
    const DESK_Y = 868;

    // ---------------------------------------------------------------- tablet on a stand, with the case
    const tb = RS.props.tablet(svg, L.near, { id: `${ctx.lang}-s4tb` });
    tb.g.setAttribute("transform", "translate(330 470) rotate(-2) scale(1.02)");
    el("path", { d: "M200 352 L320 352 L300 404 L220 404 Z", fill: "#bdb4a5" }, tb.g);
    const sc = tb.screen, u = { w: 488, rtl };
    el("rect", { width: 488, height: 40, fill: T.white }, sc);
    RS.ui.icon(sc, "steth", RS.ui.X(u, 14, 20), 10, 20, T.petrol600, 2);
    RS.ui.text(sc, u, 42, 26, S.consult.review + "  ·  " + S.phone.caseNo, { size: 12.5, weight: 700, fill: T.heading });
    // imaging tile (reading-start column)
    const img = el("g", {}, sc);
    const ix = RS.ui.X(u, 14, 200);
    el("rect", { x: ix, y: 52, width: 200, height: 210, rx: 8, fill: "#1d2a2f" }, img);
    el("path", { d: `M${ix + 84} 60 C${ix + 80} 110 ${ix + 70} 130 ${ix + 74} 150 C${ix + 100} 158 ${ix + 120} 152 ${ix + 126} 140 C${ix + 120} 120 ${ix + 118} 96 ${ix + 118} 60 Z`, fill: "#b9c6c8", opacity: 0.85 }, img);
    el("path", { d: `M${ix + 72} 168 C${ix + 92} 160 ${ix + 112} 160 ${ix + 130} 168 C${ix + 124} 190 ${ix + 120} 220 ${ix + 120} 256 L${ix + 86} 256 C${ix + 86} 220 ${ix + 80} 190 ${ix + 72} 168 Z`, fill: "#b9c6c8", opacity: 0.8 }, img);
    const ring = el("ellipse", { cx: ix + 102, cy: 160, rx: 34, ry: 14, fill: "none", stroke: T.petrol400, "stroke-width": 2.5, opacity: 0 }, img);
    // findings + recommendation (reading-end column)
    const fx = 228, fw = 488 - fx - 14;
    RS.ui.text(sc, u, fx, 70, S.consult.findings, { size: 11.5, weight: 700, fill: T.muted });
    const finds = [0, 1, 2].map((i) => {
      const g = el("g", { opacity: 0 }, sc);
      el("circle", { cx: RS.ui.X(u, fx + 5, 0), cy: 92 + i * 26, r: 3.5, fill: T.petrol600 }, g);
      el("rect", { x: RS.ui.X(u, fx + 16, fw - 30 - i * 18), y: 88 + i * 26, width: fw - 30 - i * 18, height: 7, rx: 3.5, fill: T.lineStrong }, g);
      return g;
    });
    const rec = el("g", { opacity: 0 }, sc);
    RS.ui.rect(rec, u, fx, 172, fw, 116, { r: 10, fill: T.petrol50, stroke: T.petrol100 });
    RS.ui.text(rec, u, fx + 12, 194, S.consult.rec, { size: 11.5, weight: 700, fill: T.petrol700 });
    const recText = RS.ui.wrap(rec, u, fx + 12, 216, S.consult.note, { size: 11.5, fill: T.heading, maxW: fw - 24, lh: 16 });
    const rcid = `${ctx.lang}-s4-rclip`;
    const rclip = el("clipPath", { id: rcid }, RS.defs(svg));
    const rRect = el("rect", { x: RS.ui.X(u, fx + 8, fw - 16), y: 200, width: 0, height: 80 }, rclip);
    recText.setAttribute("clip-path", `url(#${rcid})`);

    // ---------------------------------------------------------------- desk + Consultant (faces left)
    RS.desk(svg, L.fg, { id: `${ctx.lang}-s4desk`, y0: DESK_Y, y1: 1060 });
    const sheet = RS.props.sheet(svg, L.fg, { id: `${ctx.lang}-s4sheet`, transform: "translate(1010 890) matrix(1.1 0 -0.46 0.36 0 0) rotate(4)", variant: "knee", rows: 9 });
    const pen = el("g", { transform: "translate(1300 960) rotate(-24)" }, L.fg);
    el("rect", { x: 0, y: 0, width: 96, height: 9, rx: 4.5, fill: T.petrol700 }, pen);
    el("rect", { x: 0, y: 0, width: 18, height: 9, rx: 4, fill: "#c9a45c" }, pen);
    world.insertBefore(L.fg, L.near.nextSibling);
    const behind = el("g", {}, world); world.insertBefore(behind, L.fg.nextSibling);
    const docLayer = el("g", {}, world); world.insertBefore(docLayer, behind.nextSibling);
    const front = el("g", {}, world);
    world.appendChild(L.light);
    const doc = RS.place(docLayer, "consultant", { x: 1820, y: -36, s: 1.3, flip: true, seed: 52, id: `${ctx.lang}-s4-doc` });
    RS.seatAtDesk(svg, doc, DESK_Y, { behind, front });
    // pen in hand while writing (hand space)
    const heldPen = RS.attach(doc, "Near", { front: true, transform: "translate(70 -14) rotate(-38)" });
    el("rect", { x: 0, y: 0, width: 92, height: 8, rx: 4, fill: T.petrol700 }, heldPen);
    el("rect", { x: 74, y: 0, width: 18, height: 8, rx: 4, fill: "#c9a45c" }, heldPen);
    heldPen.setAttribute("opacity", 0);
    RS.props.beam(svg, L.light, { id: `${ctx.lang}-s4beam`, a: 0.16, d: "M70 110 L450 110 L760 1080 L-120 1080 Z" });

    // ---------------------------------------------------------------- acting
    doc.key(-1, { shoulderNear: -16, elbowNear: 14, wristNear: 4, lean: 2.5, lookX: 0.25, lookY: 0.95, headNod: 7, headTilt: 2, lidL: 0.7, lidR: 0.7 })
      .key(-1, RS.EXPRESSIONS.thoughtful).hand(-1, "Near", "point").hand(-1, "Far", "rest");
    // finger tracks the lines, small wrist steps with reading eye-sweeps
    for (let k = 0; k < 4; k++) {
      const t = 0.2 + k * 0.7;
      doc.key(t, { wristNear: 4 + (k % 2) * 6, elbowNear: 14 - k * 1.5, lookX: 0.15 }, "sine").key(t + 0.5, { lookX: 0.35 }, "linear");
    }
    // looks up to the imaging on the tablet: eyes lead, head follows
    doc.key(3.2, { lookX: 0.95, lookY: 0.25 }, "out").key(3.5, { headNod: 1, headTurn: 0.6, headTilt: -1, lidL: 0.95, lidR: 0.95 }, "inOut");
    tl.fromTo(ring, { opacity: 0, attr: { rx: 46, ry: 20 } }, { opacity: 1, attr: { rx: 34, ry: 14 }, duration: 0.55, ease: "power2.out" }, at(3.6));
    // a considered pause: hand to chin, brows knit, slow blink
    doc.hand(4.3, "Near", "loose").key(4.5, { shoulderNear: -22, elbowNear: -64, wristNear: -30, lean: 1.2 }, "settle")
      .key(4.5, { browKnit: 0.8, browInner: 0.4, squint: 0.3, headTilt: 3 }, "inOut").blink(5.1, 1)
      .key(5.8, { headNod: 3 }, "sine").key(6.2, { headNod: 0 }, "sine");
    finds.forEach((g, i) => tl.fromTo(g, { opacity: 0, x: rtl ? 10 : -10 }, { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, at(5.4 + i * 0.35)));
    // picks up the pen and writes; the recommendation appears on the tablet as he writes
    doc.hand(6.5, "Near", "hold").key(6.7, { shoulderNear: -14, elbowNear: 16, wristNear: 2, lookX: 0.25, lookY: 0.95, headNod: 7, headTurn: 0, lean: 2.4 }, "inOut")
      .key(6.7, RS.EXPRESSIONS.attentive, "inOut").key(6.7, { browRaise: 0.6 }, "inOut");
    tl.to(pen, { opacity: 0, duration: 0.05 }, at(6.95));
    tl.fromTo(heldPen, { opacity: 0 }, { opacity: 1, duration: 0.05 }, at(6.95));
    for (let k = 0; k < 8; k++) doc.key(7.1 + k * 0.2, { wristNear: 2 + (k % 2 ? 4 : -2) }, "sine");
    ctx.sfx(7.1, "pen_write", -26, { pan: 0.6 });
    tl.fromTo(rec, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at(7.0));
    tl.fromTo(rRect, { attr: { width: 0 } }, { attr: { width: fw - 16 }, duration: 1.7, ease: "none" }, at(7.15));
    // done: pen down, looks up with quiet confidence
    tl.to(heldPen, { opacity: 0, duration: 0.05 }, at(9.0));
    tl.to(pen, { opacity: 1, duration: 0.05 }, at(9.0));
    doc.hand(8.9, "Near", "rest").key(9.2, { lean: 0.6, lookX: 0.7, lookY: 0.05, headNod: 0, headTilt: 0 }, "inOut")
      .key(9.3, RS.EXPRESSIONS.reassured, "inOut").key(10.1, { headNod: 2 }, "sine").key(10.6, { headNod: 0 }, "sine");
    doc.autoBlink(-1, D, { quiet: [[0.2, 2.6]] }).blink(3.15).blink(9.15);
    RS.driveScene(ctx, [doc]);

    ctx.sfx(0.3, "page_turn", -26, { pan: 0.6 });
    ctx.sfx(9.0, "phone_set_down", -30, { pan: 0.6 });
    ctx.amb("roomtone_clinic", -46);

    // camera: tight on the tablet (match), then reveal the Consultant
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.6], [L.mid, 0.8], [L.near, 1], [L.fg, 1], [behind, 1], [docLayer, 1], [front, 1], [L.light, 0.7]], [
      { t: -ctx.transIn, ...cam(1.95, 600, 650) }, { t: 1.2, ...cam(1.9, 600, 650) },
      { t: 3.4, ...cam(1.03, 980, 560), ease: "power2.inOut" }, { t: D + 0.05, ...cam(1.1, 1060, 560), ease: "sine.inOut" },
    ], [0, 0]);
  };
})();
