/*
 * RehletShifaa scene kit: brand tokens, environments, props, camera and the deterministic rig driver.
 * Everything here builds static SVG/DOM once; motion is authored on the scene's paused GSAP timeline.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  // ---------------------------------------------------------------- brand tokens (live site: Petrol & Paper)
  RS.T = {
    petrol600: "#0e5f66", petrol700: "#0e4f55", petrol500: "#1d6b6b", petrol400: "#5fb3ac", petrol100: "#d9e8e6", petrol50: "#eef4f3",
    heading: "#13292e", ink: "#33474c", muted: "#5d6e72", line: "#e3ded4", lineStrong: "#cfc8ba",
    paper: "#f7f4ee", paperDeep: "#efeae0", white: "#ffffff", coral: "#e07a5f",
    logoInk: "#29454d", logoAccent: "#247c86", logoDot: "#e98d78", iconLight: "#6ab7b1", iconDeep: "#297680",
  };

  // ---------------------------------------------------------------- deterministic rig driver
  /** One tween drives every rig: pose = f(scene time). Seek-safe by construction. */
  RS.drive = function (tl, rigs, duration, extra) {
    const clock = { t: 0 };
    const render = () => { rigs.forEach((r) => r.pose(clock.t)); if (extra) extra(clock.t); };
    tl.fromTo(clock, { t: 0 }, { t: duration, duration, ease: "none", onUpdate: render }, 0);
    render();
    return clock;
  };

  /** Mount a rig inside a positioned group: {x, y, s, flip} */
  RS.place = function (parent, charId, o = {}) {
    const g = el("g", { transform: `translate(${o.x || 0} ${o.y || 0}) scale(${(o.flip ? -1 : 1) * (o.s || 1)} ${o.s || 1})` }, parent);
    const rig = new RS.Rig(RS.CHARS[charId], g, { id: o.id || charId, seed: o.seed ?? 11 });
    rig.group = g;
    return rig;
  };

  /**
   * Seat a rig at a desk/table. Depth order becomes: far arm → torso (clipped at the desk's back edge)
   * → desk → near arm, so forearms rest ON the surface while the lower body disappears behind it.
   * layers = {behind, front}: groups drawn before and after the desk. deskY is in screen space.
   */
  RS.seatAtDesk = function (svg, rig, deskY, layers) {
    const tr = rig.group.getAttribute("transform");
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)/.exec(tr);
    const oy = +m[2], sy = +m[4];
    const localY = (deskY - oy) / sy;
    const cid = `${rig.id}-deskclip`;
    const cp = el("clipPath", { id: cid, clipPathUnits: "userSpaceOnUse" }, RS.defs(svg));
    el("rect", { x: -2000, y: -2000, width: 5000, height: 2000 + localY }, cp);
    rig.parts.body.setAttribute("clip-path", `url(#${cid})`);
    // wrap body in a holder so the clip stays fixed while the body leans
    const bodyHolder = el("g", { "clip-path": `url(#${cid})` }, rig.group);
    rig.parts.body.removeAttribute("clip-path");
    bodyHolder.appendChild(rig.parts.body);
    rig.limbHolders = [];
    const lift = (part, parent, before) => {
      const holder = el("g", { transform: tr }, parent);
      if (before) parent.insertBefore(holder, parent.firstChild);
      const inner = el("g", {}, holder);
      part.parentNode.removeChild(part);
      inner.appendChild(part);
      rig.limbHolders.push(inner);
    };
    lift(rig.parts.armFar, layers.behind, true);
    lift(rig.parts.armNear, layers.front, false);
    return rig;
  };

  // ---------------------------------------------------------------- gradients helper
  RS.defs = function (svg) {
    let d = svg.querySelector("defs");
    if (!d) d = el("defs", {}, svg);
    return d;
  };
  RS.linear = function (svg, id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1, units) {
    const g = el("linearGradient", { id, x1, y1, x2, y2, gradientUnits: units }, RS.defs(svg));
    stops.forEach(([o, c, a = 1]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
    return `url(#${id})`;
  };
  RS.radial = function (svg, id, stops, cx = 0.5, cy = 0.5, r = 0.5) {
    const g = el("radialGradient", { id, cx, cy, r }, RS.defs(svg));
    stops.forEach(([o, c, a = 1]) => el("stop", { offset: o, "stop-color": c, "stop-opacity": a }, g));
    return `url(#${id})`;
  };

  // ---------------------------------------------------------------- props
  RS.props = {};
  /** A clinical report sheet in local space (0,0)-(w,h); variant "knee" shows an imaging thumbnail. */
  RS.props.report = function (svg, parent, o = {}) {
    const w = o.w || 300, h = o.h || 400, id = o.id || "rep";
    const g = el("g", { class: "prop-report" }, parent);
    el("rect", { x: 4, y: 6, width: w, height: h, rx: 6, fill: "#000", opacity: 0.08 }, g);
    el("rect", { width: w, height: h, rx: 6, fill: "#fffdf8", stroke: "#e5dfd3", "stroke-width": 1.5 }, g);
    el("rect", { x: 22, y: 24, width: w * 0.36, height: 10, rx: 3, fill: RS.T.petrol600, opacity: 0.85 }, g);
    el("rect", { x: w - 22 - w * 0.2, y: 24, width: w * 0.2, height: 8, rx: 3, fill: RS.T.lineStrong }, g);
    const lines = el("g", { class: "lines" }, g);
    const rows = o.rows || 9;
    for (let i = 0; i < rows; i++) {
      const yy = 62 + i * ((h - 120) / rows);
      const lw = (w - 44) * [0.92, 0.8, 0.86, 0.6, 0.9, 0.74, 0.84, 0.5, 0.88][i % 9];
      el("rect", { x: 22, y: yy, width: lw, height: 6, rx: 3, fill: "#c9c3b8", class: "line" }, lines);
    }
    if (o.variant === "knee") {
      const k = el("g", { transform: `translate(${w - 22 - w * 0.34} ${h * 0.5})` }, g);
      el("rect", { width: w * 0.34, height: h * 0.3, rx: 4, fill: "#1f2d31" }, k);
      const kw = w * 0.34, kh = h * 0.3;
      el("path", { d: `M${kw * 0.38} 6 C${kw * 0.36} ${kh * 0.3} ${kw * 0.3} ${kh * 0.38} ${kw * 0.32} ${kh * 0.46} C${kw * 0.5} ${kh * 0.5} ${kw * 0.62} ${kh * 0.44} ${kw * 0.64} ${kh * 0.36} C${kw * 0.6} ${kh * 0.26} ${kw * 0.58} ${kh * 0.14} ${kw * 0.58} 6 Z`, fill: "#b9c6c8", opacity: 0.85 }, k);
      el("path", { d: `M${kw * 0.32} ${kh * 0.56} C${kw * 0.42} ${kh * 0.52} ${kw * 0.56} ${kh * 0.52} ${kw * 0.66} ${kh * 0.56} C${kw * 0.62} ${kh * 0.66} ${kw * 0.6} ${kh * 0.8} ${kw * 0.6} ${kh - 6} L${kw * 0.4} ${kh - 6} C${kw * 0.4} ${kh * 0.8} ${kw * 0.36} ${kh * 0.66} ${kw * 0.32} ${kh * 0.56} Z`, fill: "#b9c6c8", opacity: 0.8 }, k);
      el("ellipse", { cx: kw * 0.49, cy: kh * 0.51, rx: kw * 0.1, ry: kh * 0.03, fill: RS.T.petrol400, opacity: 0.0, class: "focus" }, k);
    }
    if (o.signature) el("path", { d: `M22 ${h - 40} c12 -10 20 6 30 -4 s18 4 28 -2`, fill: "none", stroke: RS.T.petrol600, "stroke-width": 2, opacity: 0.7 }, g);
    return g;
  };

  /** Smartphone in local space, screen content mounted in returned `.screen` group (w=260,h=540). */
  RS.props.phone = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-phone" }, parent);
    el("rect", { x: 6, y: 10, width: 260, height: 540, rx: 40, fill: "#000", opacity: 0.18 }, g);
    el("rect", { width: 260, height: 540, rx: 40, fill: "#1c2a2e" }, g);
    el("rect", { x: 3, y: 3, width: 254, height: 534, rx: 38, fill: "none", stroke: "#3c4c50", "stroke-width": 2 }, g);
    const clipId = (o.id || "ph") + "-clip";
    const cp = el("clipPath", { id: clipId }, RS.defs(svg));
    el("rect", { x: 12, y: 12, width: 236, height: 516, rx: 30 }, cp);
    const screen = el("g", { "clip-path": `url(#${clipId})` }, g);
    el("rect", { x: 12, y: 12, width: 236, height: 516, fill: RS.T.paper }, screen);
    const content = el("g", { class: "screen", transform: "translate(12 12)" }, screen);
    el("rect", { x: 100, y: 20, width: 60, height: 14, rx: 7, fill: "#1c2a2e" }, g);
    const glare = el("path", { d: "M30 12 L120 12 L40 300 L12 300 L12 40 Z", fill: "#fff", opacity: 0.06 }, g);
    return { g, screen: content, glare };
  };

  /** Tablet (w=520,h=360) with returned screen group. */
  RS.props.tablet = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-tablet" }, parent);
    el("rect", { x: 6, y: 10, width: 520, height: 360, rx: 26, fill: "#000", opacity: 0.15 }, g);
    el("rect", { width: 520, height: 360, rx: 26, fill: "#25343a" }, g);
    const clipId = (o.id || "tb") + "-clip";
    const cp = el("clipPath", { id: clipId }, RS.defs(svg));
    el("rect", { x: 16, y: 16, width: 488, height: 328, rx: 14 }, cp);
    const sc = el("g", { "clip-path": `url(#${clipId})` }, g);
    el("rect", { x: 16, y: 16, width: 488, height: 328, fill: RS.T.paper }, sc);
    const content = el("g", { class: "screen", transform: "translate(16 16)" }, sc);
    return { g, screen: content };
  };

  RS.props.plant = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-plant" }, parent);
    const s = o.s || 1;
    el("path", { d: `M${-40 * s} 0 L${40 * s} 0 L${32 * s} ${70 * s} L${-32 * s} ${70 * s} Z`, fill: o.pot || "#d7cdbd" }, g);
    el("rect", { x: -44 * s, y: -6 * s, width: 88 * s, height: 10 * s, rx: 4, fill: o.rim || "#c9bda9" }, g);
    const leaves = el("g", { class: "leaves" }, g);
    const rnd = RS.prng(o.seed || 5);
    for (let i = 0; i < (o.n || 11); i++) {
      const a = -150 + i * (120 / ((o.n || 11) - 1)) + (rnd() - 0.5) * 10;
      const L = (110 + rnd() * 90) * s;
      const rad = (a * Math.PI) / 180;
      const tx = Math.cos(rad) * L, ty = Math.sin(rad) * L;
      const lf = el("g", { class: "leaf", "data-a": a.toFixed(1) }, leaves);
      el("path", { d: `M0 -4 Q${tx * 0.5 + ty * 0.18} ${ty * 0.5 - tx * 0.18} ${tx} ${ty} Q${tx * 0.5 - ty * 0.18} ${ty * 0.5 + tx * 0.18} 0 -4 Z`, fill: i % 3 ? "#5f8a72" : "#4c7560" }, lf);
      el("path", { d: `M0 -4 Q${tx * 0.5} ${ty * 0.5} ${tx * 0.95} ${ty * 0.95}`, fill: "none", stroke: "#a7c3a9", "stroke-width": 1.2, opacity: 0.5 }, lf);
    }
    return g;
  };

  /** Window with daylight, mullions and a soft curtain whose fold can sway (returns {g, curtain, glow}). */
  RS.props.window = function (svg, parent, o = {}) {
    const w = o.w || 360, h = o.h || 520, id = o.id || "win";
    const g = el("g", { class: "prop-window" }, parent);
    const sky = RS.linear(svg, `${id}-sky`, [[0, "#e9f1ef"], [0.6, "#f7f3e8"], [1, "#fbf3e2"]]);
    el("rect", { x: -14, y: -14, width: w + 28, height: h + 28, rx: 6, fill: "#e8e1d4" }, g);
    el("rect", { width: w, height: h, fill: sky }, g);
    // distant soft city/trees silhouette
    el("path", { d: `M0 ${h * 0.72} C${w * 0.15} ${h * 0.64} ${w * 0.25} ${h * 0.7} ${w * 0.4} ${h * 0.66} C${w * 0.55} ${h * 0.62} ${w * 0.7} ${h * 0.7} ${w} ${h * 0.64} L${w} ${h} L0 ${h} Z`, fill: "#cfdcd5", opacity: 0.7 }, g);
    el("rect", { x: w / 2 - 4, y: 0, width: 8, height: h, fill: "#e8e1d4" }, g);
    el("rect", { x: 0, y: h * 0.45, width: w, height: 8, fill: "#e8e1d4" }, g);
    const glow = el("rect", { x: -60, y: -60, width: w + 120, height: h + 120, fill: RS.radial(svg, `${id}-glow`, [[0, "#fff8e8", 0.55], [1, "#fff8e8", 0]]), class: "glow" }, g);
    const curtain = el("g", { class: "curtain" }, g);
    const cf = RS.linear(svg, `${id}-cur`, [[0, "#efe7da"], [0.5, "#e2d7c6"], [1, "#efe7da"]], 0, 0, 1, 0);
    el("path", { d: `M${w - 70} -20 C${w - 40} ${h * 0.3} ${w - 60} ${h * 0.6} ${w - 40} ${h + 30} L${w + 40} ${h + 30} L${w + 40} -20 Z`, fill: cf, opacity: 0.95 }, curtain);
    el("path", { d: `M${w - 40} -10 C${w - 20} ${h * 0.4} ${w - 30} ${h * 0.7} ${w - 14} ${h + 20}`, fill: "none", stroke: "#d4c7b3", "stroke-width": 3, opacity: 0.6 }, curtain);
    return { g, curtain, glow };
  };

  /** Light beam overlay (window light falling across the room); animate opacity for daylight shifts. */
  RS.props.beam = function (svg, parent, o = {}) {
    const id = o.id || "beam";
    const f = RS.linear(svg, id, [[0, "#fff4dc", o.a ?? 0.32], [1, "#fff4dc", 0]], 0, 0, 1, 0.4);
    return el("path", { d: o.d || "M0 120 L620 60 L1280 1080 L0 1080 Z", fill: f, class: "beam", style: "mix-blend-mode:screen" }, parent);
  };

  // ---------------------------------------------------------------- camera
  /** Camera = transform on a world group around a focus point. keys: [{t, s, x, y, ease}] */
  RS.camera = function (tl, node, keys, origin = [960, 540]) {
    gsap.set(node, { svgOrigin: `${origin[0]} ${origin[1]}` });
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i];
      tl.fromTo(node, { scale: a.s, x: a.x || 0, y: a.y || 0 }, { scale: b.s, x: b.x || 0, y: b.y || 0, duration: b.t - a.t, ease: b.ease || "sine.inOut", immediateRender: i === 1 }, a.t);
    }
  };
  /** Camera key that frames world point (cx, cy) at screen centre with scale s (origin 0,0). */
  RS.camAt = (s, cx, cy) => ({ s, x: 960 - cx * s, y: 540 - cy * s });

  /** Parallax: same camera motion scaled per layer depth (0 = locked to frame, 1 = world). */
  RS.parallax = function (tl, layers, keys, origin = [960, 540]) {
    layers.forEach(([node, depth]) => {
      RS.camera(tl, node, keys.map((k) => ({ ...k, s: 1 + (k.s - 1) * depth, x: (k.x || 0) * depth, y: (k.y || 0) * depth })), origin);
    });
  };
})();
