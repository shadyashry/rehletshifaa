/*
 * Scene 2 — Discovering RehletShifaa. Close, intimate: the phone fills the right of frame and runs the real
 * site flow (home → Send my case → upload what she has → consent → send → "Your case is received").
 * Amal's face, lit by the screen, watches from the left; the thumb travels, presses and releases.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.SCENES["s02-discover"] = function (ctx) {
    const { svg, shell, tl, S, rtl } = ctx;
    const D = ctx.dur, at = ctx.at;
    const T = RS.T, P = S.phone;
    const world = el("g", { class: "world" }, shell);
    const L = RS.env.home(svg, world);
    // depth of field by atmosphere: veil the room so the face and phone carry the frame
    el("rect", { x: -200, y: -200, width: 2400, height: 1500, fill: T.paper, opacity: 0.5 }, L.mid);

    // Amal, close: face on the left, looking down toward the phone
    const amal = RS.place(L.near, "amal", { x: -150, y: -300, s: 2.15, seed: 12, id: `${ctx.lang}-s2-amal` });
    const glow = el("ellipse", { cx: 780, cy: 470, rx: 240, ry: 220, fill: RS.radial(svg, `${ctx.lang}-s2glow`, [[0, "#e8f6f3", 0.4], [1, "#e8f6f3", 0]]), opacity: 0 }, L.near);

    // ---------------------------------------------------------------- the phone
    const phoneG = el("g", { transform: "translate(1180 60) rotate(-3 230 470) scale(1.72)" }, L.fg);
    // fingers wrapping the reading-end edge behind the phone
    const fingers = el("g", {}, phoneG);
    [[248, 300], [252, 352], [250, 404]].forEach(([x, y]) => el("path", { d: `M${x - 6} ${y - 16} C${x + 14} ${y - 18} ${x + 22} ${y - 4} ${x + 20} ${y + 6} C${x + 18} ${y + 16} ${x + 4} ${y + 18} ${x - 6} ${y + 14} Z`, fill: "#cf9f7c" }, fingers));
    const ph = RS.props.phone(svg, phoneG, { id: `${ctx.lang}-s2ph` });
    const W = 236, H = 516, u = { w: W, rtl };
    const scr = ph.screen;
    const pages = el("g", { transform: "translate(0 26)" }, scr);
    const pageA = el("g", { class: "page-a" }, pages), pageB = el("g", { class: "page-b", opacity: 0 }, pages), pageC = el("g", { class: "page-c", opacity: 0 }, pages);
    el("rect", { x: 0, y: 0, width: W, height: 28, fill: T.paper }, scr);
    const clock = el("text", { x: 22, y: 19, class: "rs-body", "font-size": 10, "font-weight": 700, fill: T.heading }, scr);
    clock.textContent = "9:41";
    [0, 1, 2].forEach((k) => el("rect", { x: W - 46 + k * 6, y: 15 - k * 2, width: 4, height: 4 + k * 2, rx: 1, fill: T.heading }, scr));
    el("rect", { x: W - 26, y: 10, width: 16, height: 8, rx: 2, fill: "none", stroke: T.heading, "stroke-width": 1.2 }, scr);
    el("rect", { x: W - 24, y: 12, width: 10, height: 4, rx: 1, fill: T.heading }, scr);

    // page A — home hero
    RS.ui.siteHeader(pageA, u, 46);
    el("rect", { x: RS.ui.X(u, 18, 18), y: 72, width: 18, height: 2, fill: T.coral }, pageA);
    RS.ui.wrap(pageA, u, 18, 104, S.end.tagline.replace(/\.$/, ""), { kind: "head", size: 20, weight: 600, fill: T.heading, maxW: 200, lh: 24 });
    RS.ui.wrap(pageA, u, 18, 208, P.sub, { size: 10.5, fill: T.ink, maxW: 200 });
    const btnA = RS.ui.button(pageA, u, 18, 236, 140, 34, P.send, { size: 12 });
    // a glimpse of the site's case-file card
    RS.ui.rect(pageA, u, 18, 296, 200, 150, { r: 10, fill: T.white, stroke: T.line });
    RS.ui.text(pageA, u, 32, 320, S.office.caseFile, { size: 8.5, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1 });
    RS.ui.text(pageA, u, 32, 338, P.caseNo, { size: 11, weight: 700, fill: T.heading });
    ["file", "image", "camera"].forEach((ic, i) => {
      RS.ui.iconWell(pageA, u, ic, 32, 352 + i * 30, 22, {});
      el("rect", { x: RS.ui.X(u, 62, 110), y: 361 + i * 30, width: 110, height: 5, rx: 2.5, fill: T.lineStrong }, pageA);
    });

    // page B — send my case (scrolls)
    const scrollB = el("g", {}, pageB);
    RS.ui.siteHeader(pageB, u, 46);
    el("rect", { x: RS.ui.X(u, 18, 14), y: 70, width: 14, height: 2, fill: T.coral }, scrollB);
    RS.ui.text(scrollB, u, 38, 74, P.eyebrow, { size: 8.5, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1 });
    RS.ui.wrap(scrollB, u, 18, 102, P.heading, { kind: "head", size: 18.5, weight: 600, fill: T.heading, maxW: 205, lh: 22 });
    // stepper 1–2–3 (step 2 active)
    [0, 1, 2].forEach((k) => {
      const cx = RS.ui.X(u, 30 + k * 44, 0);
      if (k < 2) el("line", { x1: cx, y1: 150, x2: RS.ui.X(u, 30 + (k + 1) * 44, 0), y2: 150, stroke: k < 1 ? T.petrol400 : T.lineStrong, "stroke-width": 1.5 }, scrollB);
      el("circle", { cx, cy: 150, r: 11, fill: k === 0 ? T.petrol600 : T.white, stroke: k === 1 ? T.coral : k === 0 ? T.petrol600 : T.lineStrong, "stroke-width": 1.8 }, scrollB);
      const n = el("text", { x: cx, y: 154, "text-anchor": "middle", class: "rs-body", "font-size": 10, "font-weight": 700, fill: k === 0 ? "#fff" : T.heading }, scrollB);
      n.textContent = String(k + 1);
    });
    RS.ui.text(scrollB, u, 18, 186, P.step, { size: 11, weight: 700, fill: T.heading });
    const upBox = el("g", {}, scrollB);
    el("rect", { x: 18, y: 196, width: 200, height: 62, rx: 10, fill: T.petrol50, stroke: T.petrol400, "stroke-dasharray": "5 4", "stroke-width": 1.4 }, upBox);
    RS.ui.icon(upBox, "upload", W / 2 - 9, 206, 18, T.petrol600, 2);
    RS.ui.text(upBox, u, 0, 244, P.upload, { anchor: "middle", size: 9.5, weight: 600, fill: T.petrol700 }).setAttribute("x", W / 2);
    const fileRows = P.files.map((f, i) => {
      const r = RS.ui.fileRow(scrollB, u, 18, 268 + i * 40, 200, 34, ["file", "image", "camera"][i], f);
      r.g.setAttribute("opacity", 0);
      return r;
    });
    const consent = RS.ui.checkbox(scrollB, u, 18, 398, 14, P.consent, { size: 9.5, maxW: 172 });
    const btnB = RS.ui.button(scrollB, u, 18, 452, 200, 36, P.send, { size: 12.5 });
    RS.ui.icon(scrollB, "lock", RS.ui.X(u, 70, 0) - (rtl ? 12 : 0), 498, 12, T.muted, 2);
    RS.ui.text(scrollB, u, 86, 508, P.private, { size: 9.5, fill: T.muted });

    // page C — received
    RS.ui.siteHeader(pageC, u, 46);
    const okC = RS.ui.check(pageC, W / 2, 120, 26);
    RS.ui.text(pageC, u, 0, 186, P.received, { anchor: "middle", kind: "head", size: 17, weight: 600, fill: T.heading }).setAttribute("x", W / 2);
    RS.ui.wrap(pageC, u, 24, 212, P.receivedSub, { size: 10.5, fill: T.ink, maxW: 190 });
    RS.ui.rect(pageC, u, 18, 252, 200, 120, { r: 12, fill: T.white, stroke: T.line });
    RS.ui.text(pageC, u, 34, 280, S.office.caseFile, { size: 8.5, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1 });
    RS.ui.text(pageC, u, 34, 302, P.caseNo, { size: 14, weight: 700, fill: T.heading });
    RS.ui.icon(pageC, "lock", RS.ui.X(u, 34, 12), 320, 12, T.muted, 2);
    RS.ui.text(pageC, u, 52, 330, P.private, { size: 9.5, fill: T.muted });
    const stamp = RS.ui.stamp(pageC, rtl ? 62 : 172, 352, P.stamp, { size: 11, w: 80, h: 26, rtl });

    // thumb (over the screen, from the lower reading-end corner)
    const { thumb, shape: thumbShape } = RS.props.thumb(svg, phoneG, { id: `${ctx.lang}-s2` }); // right hand holds the phone in both languages
    // thumb tip is the group origin; targets are screen-local (+12 offset to phone space)
    const tgt = (x, y) => ({ x: (rtl ? W - x : x) + 12, y: y + 12 + 26 });
    const home = { x: rtl ? -40 : 300, y: 620 };

    // ---------------------------------------------------------------- choreography
    const tap = (t, p, label) => {
      tl.to(thumb, { x: p.x, y: p.y, duration: 0.42, ease: "power2.inOut" }, at(t - 0.45));
      tl.to(thumbShape, { scale: 0.94, y: 3, duration: 0.08, ease: "power1.in" }, at(t));
      tl.to(thumbShape, { scale: 1, y: 0, duration: 0.14, ease: "power1.out" }, at(t + 0.1));
      ctx.sfx(t, "phone_taps", -24, { dur: 0.32, pan: 0.65 });
    };
    tl.set(thumb, { x: home.x, y: home.y }, at(-ctx.transIn));
    tl.set(thumbShape, { transformOrigin: "50% 0%" }, at(-ctx.transIn));
    // A: tap "Send my case"
    tap(1.25, tgt(88, 252), "send-home");
    tl.fromTo(btnA, { opacity: 1 }, { opacity: 0.75, duration: 0.08, yoyo: true, repeat: 1 }, at(1.25));
    tl.to(pageA, { opacity: 0, x: rtl ? 40 : -40, duration: 0.35, ease: "power2.in" }, at(1.45));
    tl.fromTo(pageB, { opacity: 0, x: rtl ? -40 : 40 }, { opacity: 1, x: 0, duration: 0.4, ease: "power2.out" }, at(1.6));
    // B: upload what she already has
    tap(2.45, tgt(118, 226), "upload");
    fileRows.forEach((r, i) => {
      const t = 2.8 + i * 0.42;
      tl.fromTo(r.g, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, at(t));
      tl.fromTo(r.bar, { scaleX: 0 }, { scaleX: 1, duration: 0.55, ease: "power1.inOut" }, at(t + 0.1));
      tl.fromTo(r.check, { opacity: 0 }, { opacity: 1, duration: 0.2 }, at(t + 0.65));
    });
    ctx.sfx(3.6, "ui_confirm", -30, { pan: 0.65 });
    // scroll to consent and the button
    tl.fromTo(scrollB, { y: 0 }, { y: -150, duration: 0.7, ease: "power2.inOut" }, at(4.3));
    tap(5.05, tgt(25, 405 - 150), "consent");
    tl.fromTo(consent.tick, { opacity: 0 }, { opacity: 1, duration: 0.12 }, at(5.07));
    tap(5.85, tgt(118, 470 - 150), "send");
    tl.fromTo(btnB, { opacity: 1 }, { opacity: 0.7, duration: 0.08, yoyo: true, repeat: 1 }, at(5.85));
    tl.to(thumb, { x: home.x, y: home.y, duration: 0.6, ease: "power2.inOut" }, at(6.1));
    tl.to(pageB, { opacity: 0, duration: 0.3 }, at(6.05));
    tl.fromTo(pageC, { opacity: 0 }, { opacity: 1, duration: 0.35 }, at(6.15));
    tl.fromTo(okC, { scale: 0.4, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, at(6.25));
    tl.fromTo(stamp, { scale: 1.6, opacity: 0, transformOrigin: "50% 50%" }, { scale: 1, opacity: 1, duration: 0.32, ease: "power3.in" }, at(6.95));
    ctx.sfx(6.25, "ui_submitted", -22, { pan: 0.65 });

    // ---------------------------------------------------------------- Amal: attention, small relief
    amal.key(-1, { lookX: 0.95, lookY: 0.75, headNod: 6, headTurn: 1, headTilt: 2, lidL: 0.75, lidR: 0.75 }).key(-1, RS.EXPRESSIONS.thoughtful);
    amal.key(1.2, { browRaise: 0.5 }, "inOut").key(2.8, { lookY: 0.85 }, "inOut").key(4.4, { lookY: 0.6 }, "inOut")
      .key(5.9, RS.EXPRESSIONS.attentive, "inOut").key(6.5, { lookY: 0.7, lidL: 0.82, lidR: 0.82 }, "inOut")
      // relief: shoulders settle on an exhale, brows release, a small private smile
      .key(7.4, { shrug: 0.3 }, "inOut").key(8.0, { shrug: -0.7, browInner: 0, browKnit: 0, smile: 0.2, mouthOpen: 0.06 }, "inOut")
      .key(8.6, { mouthOpen: 0, headNod: 3, headTilt: 0 }, "inOut").key(9.4, { smile: 0.26 }, "inOut");
    amal.autoBlink(-1, D, { quiet: [[5.0, 6.2]] }).blink(1.55).blink(6.75);
    RS.driveScene(ctx, [amal]);
    tl.fromTo(glow, { opacity: 0.15 }, { opacity: 0.35, duration: 1.2, ease: "sine.inOut" }, at(-0.6));

    ctx.amb("amb_home_day", -47);
    // camera: gentle drift, then a push into the confirmation card (it becomes the case on Nour's screen)
    const cam = RS.camAt;
    RS.sceneCamera(ctx, [[L.far, 0.5], [L.mid, 0.6], [L.near, 0.9], [L.fg, 1]], [
      { t: -ctx.transIn, ...cam(1.0, 960, 540) }, { t: 7.6, ...cam(1.05, 1000, 540), ease: "sine.inOut" },
      { t: D + 0.05, ...cam(1.6, 1395, 560), ease: "power2.in" },
    ], [0, 0]);
    ctx.sfx(D - 0.9, "transition_paper", -26);
  };
})();
