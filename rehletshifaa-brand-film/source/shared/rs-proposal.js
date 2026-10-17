/*
 * The care proposal screen (site styling) shared by scenes 5 and 6. Returns handles for choreography.
 * Layout space: 1200 × 760, RTL-aware.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  RS.proposalScreen = function (svg, parent, S, rtl, id) {
    const T = RS.T, P = S.proposal;
    const W = 1200, u = { w: W, rtl };
    const g = el("g", { class: "proposal" }, parent);
    el("rect", { width: W, height: 760, fill: T.paper }, g);
    // header
    el("rect", { width: W, height: 76, fill: T.white }, g);
    el("rect", { y: 75, width: W, height: 1.5, fill: T.line }, g);
    const logo = RS.ui.logo(g, 36, 16, 44);
    if (rtl) logo.setAttribute("transform", `translate(${W - 36 - logo.w} 16)`);
    const tag = el("g", {}, g);
    RS.ui.rect(tag, u, W - 36 - 190, 24, 190, 30, { r: 15, fill: T.paperDeep });
    RS.ui.text(tag, u, W - 36 - 190 + 18, 44, P.example, { size: 14, weight: 600, fill: T.muted });
    el("rect", { x: RS.ui.X(u, 48, 26), y: 116, width: 26, height: 3, rx: 1.5, fill: T.coral }, g);
    RS.ui.text(g, u, 86, 122, S.phone.caseNo, { size: 15, weight: 700, fill: T.petrol600, ls: rtl ? 0 : 1.2 });
    RS.ui.text(g, u, 48, 170, P.title, { kind: "head", size: 38, weight: 600, fill: T.heading });

    // card 1 — clinical recommendation
    const c1 = el("g", { opacity: 0 }, g);
    RS.ui.rect(c1, u, 48, 200, 540, 230, { r: 14, fill: T.white, stroke: T.line });
    RS.ui.iconWell(c1, u, "clipboard", 72, 224, 44, {});
    RS.ui.text(c1, u, 132, 254, P.recLabel, { size: 18, weight: 700, fill: T.heading });
    RS.ui.wrap(c1, u, 72, 300, P.rec, { size: 18, fill: T.ink, maxW: 488, lh: 28 });
    // card 2 — next steps
    const c2 = el("g", { opacity: 0 }, g);
    RS.ui.rect(c2, u, 612, 200, 540, 230, { r: 14, fill: T.white, stroke: T.line });
    RS.ui.text(c2, u, 636, 240, P.steps, { size: 18, weight: 700, fill: T.heading });
    const steps = P.stepsList.map((st, i) => {
      const r = el("g", { opacity: 0 }, c2);
      const cx = RS.ui.X(u, 650, 0);
      el("circle", { cx, cy: 282 + i * 48, r: 15, fill: i === 2 ? T.petrol600 : T.petrol50, stroke: T.petrol600, "stroke-width": 1.6 }, r);
      const n = el("text", { x: cx, y: 288 + i * 48, "text-anchor": "middle", class: "rs-body", "font-size": 15, "font-weight": 700, fill: i === 2 ? "#fff" : T.petrol600 }, r);
      n.textContent = String(i + 1);
      RS.ui.text(r, u, 678, 288 + i * 48, st, { size: 17, weight: 600, fill: T.heading });
      return r;
    });
    // card 3 — preliminary estimate (range, non-binding)
    const c3 = el("g", { opacity: 0 }, g);
    RS.ui.rect(c3, u, 48, 454, 1104, 170, { r: 14, fill: T.white, stroke: T.line });
    RS.ui.text(c3, u, 72, 494, P.est, { size: 18, weight: 700, fill: T.heading });
    const amt = RS.ui.text(c3, u, 72, 556, P.range, { kind: "head", size: 46, weight: 600, fill: T.petrol700 });
    const noteG = el("g", {}, c3);
    const note = RS.ui.wrap(noteG, u, 640, 524, P.estNote, { size: 17, fill: T.ink, maxW: 480, lh: 26 });
    const hl = el("rect", { x: RS.ui.X(u, 632, 500), y: 498, width: 500, height: 64, rx: 10, fill: T.coral, opacity: 0 }, noteG);
    noteG.insertBefore(hl, noteG.firstChild);
    // actions
    const acts = el("g", { opacity: 0 }, g);
    const cont = RS.ui.button(acts, u, 48, 656, 300, 60, P.continue, { size: 21 });
    const later = RS.ui.button(acts, u, 368, 656, 200, 60, P.notNow, { size: 21, variant: "secondary" });
    return { g, c1, c2, c3, steps, hl, acts, cont, later, amt };
  };
})();
