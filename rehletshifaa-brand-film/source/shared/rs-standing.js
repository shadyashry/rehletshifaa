/*
 * Standing / walking extension for the seated 3/4 rigs.
 * Grafts a lower body (garment hem, two legs, shoes) behind the torso, in rig-local space, pivoting at the hips.
 * Legs are animated by RS.walk with a seek-safe pure function of time (no repeat tweens), together with the
 * vertical bob, a counter-swinging free arm and a small shoulder roll — the cues that sell a calm walk at mid-shot.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  const WARDROBE = {
    amal: { hem: [188, 790, 446, 1060], knit: true, trouser: "#5b4b45", trouserShade: "#463a35", shoe: "#2d2724", hips: [[282, 930], [382, 924]] },
  };

  /** Graft legs onto a rig. Returns {legs:[near,far], hem}. */
  RS.standUp = function (svg, rig) {
    const W = WARDROBE[rig.def.id];
    const C = rig.def.palette;
    const id = rig.id;
    const lower = el("g", { class: "lower" });
    rig.root.insertBefore(lower, rig.root.firstChild);
    const leg = (hx, hy, far) => {
      const g = el("g", { transform: `translate(${hx} ${hy})` }, lower);
      const inner = el("g", {}, g);
      // wide-leg trouser: the knee is implied by the drape, so a single rotating segment reads naturally
      el("path", { d: "M-54 -20 C-56 180 -52 400 -46 620 L40 620 C44 400 48 180 50 -20 Z", fill: far ? W.trouserShade : W.trouser }, inner);
      el("path", { d: "M10 40 C14 240 18 430 20 610", fill: "none", stroke: W.trouserShade, "stroke-width": 3, opacity: far ? 0.3 : 0.55 }, inner);
      el("path", { d: "M-40 612 C-44 642 -30 656 -4 656 L66 656 C84 656 92 640 80 630 C62 620 42 614 30 610 Z", fill: W.shoe }, inner);
      return inner;
    };
    const far = leg(W.hips[1][0], W.hips[1][1], true);
    const near = leg(W.hips[0][0], W.hips[0][1], false);
    // long cardigan hem continues the torso below the hip line
    const [x0, y0, x1, y1] = W.hem;
    const hem = el("g", {}, rig.parts.chest);
    const knit = RS.linear(svg, `${id}-gHem`, [[0, C.knitLit], [0.55, C.knit], [1, C.knitShade]], 0, 0, 1, 0);
    el("path", { d: `M${x0} ${y0} L${x1 - 6} ${y0} C${x1} ${y0 + 90} ${x1 + 8} ${y0 + 180} ${x1 + 12} ${y1} L${x0 - 10} ${y1} C${x0 - 8} ${y0 + 160} ${x0 - 4} ${y0 + 80} ${x0} ${y0} Z`, fill: knit }, hem);
    el("path", { d: `M350 ${y0} L354 ${y1 - 120}`, fill: "none", stroke: C.top, "stroke-width": 50 }, hem); // the top continues under the open cardigan
    el("path", { d: `M392 ${y0} C396 ${y0 + 90} 402 ${y0 + 180} 406 ${y1}`, fill: "none", stroke: C.knitShade, "stroke-width": 10, opacity: 0.75 }, hem);
    el("path", { d: `M232 ${y0 + 40} C236 ${y0 + 120} 238 ${y0 + 190} 236 ${y1 - 20}`, fill: "none", stroke: C.knitShade, "stroke-width": 2.4, opacity: 0.5 }, hem);
    el("path", { d: `M${x0 - 10} ${y1 - 4} L${x1 + 12} ${y1 - 4}`, stroke: C.knitDeep, "stroke-width": 6, opacity: 0.5 }, hem);
    rig.legs = [near, far];
    rig.hem = hem;
    return rig;
  };

  /**
   * Calm walk over [t0, t1] (scene-local), cadence in steps/second. carrier is the group that is bobbed.
   * Everything is evaluated from time in one onUpdate, so any seek lands on the right pose.
   */
  RS.walk = function (ctx, rig, carrier, o = {}) {
    const { tl, at } = ctx;
    const t0 = o.t0 ?? 0, t1 = o.t1 ?? ctx.dur, cad = o.cadence ?? 1.7, swing = o.swing ?? 13, bob = o.bob ?? 7;
    const ease = (t) => Math.min(1, Math.max(0, (t - t0) / 0.5)) * Math.min(1, Math.max(0, (t1 - t) / 0.5)); // start/stop softly
    const state = { t: t0 };
    const apply = () => {
      const t = state.t, k = ease(t);
      const ph = (t - t0) * cad * Math.PI; // one step = half a cycle
      const s = Math.sin(ph) * swing * k;
      rig.legs[0].setAttribute("transform", `rotate(${RS.f(s)})`);
      rig.legs[1].setAttribute("transform", `rotate(${RS.f(-s)})`);
      carrier.setAttribute("transform", `translate(0 ${RS.f(-Math.abs(Math.cos(ph)) * bob * k)})`);
      if (rig.hem) rig.hem.setAttribute("transform", `rotate(${RS.f(Math.sin(ph - 0.6) * 1.2 * k)} 318 800)`);
    };
    tl.fromTo(state, { t: t0 }, { t: t1, duration: t1 - t0, ease: "none", onUpdate: apply, immediateRender: false }, at(t0));
    // the free arm swings against the near leg, through the rig's own tracks
    if (o.freeArm) {
      for (let t = t0; t < t1; t += 1 / cad) {
        const k = ease(t + 0.5 / cad);
        rig.key(t + 0.5 / cad, { [`shoulder${o.freeArm}`]: (o.armBase ?? 0) + Math.sin((t + 0.5 / cad - t0) * cad * Math.PI) * -6 * k }, "sine");
      }
    }
    return state;
  };
})();
