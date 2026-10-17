/*
 * RehletShifaa character rig runtime.
 *
 * A character is a layered SVG hierarchy (body → shoulder → elbow → wrist, neck → head) plus parametric face
 * parts. Every visual property is a pure function of time: keyframe tracks + seeded procedural layers (blink,
 * breathing, micro-saccades) are evaluated by `rig.evaluate(t)` and written to the DOM by `rig.apply()`.
 * A single driver tween per scene calls `rig.pose(t)` on every rendered frame, so any timestamp renders
 * identically on direct seek (HyperFrames determinism contract).
 */
(function () {
  const RS = (window.RS = window.RS || {});
  const SVGNS = "http://www.w3.org/2000/svg";

  // ---------------------------------------------------------------- math
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const EASES = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    // anticipation → action → overshoot → settle, compressed into one curve
    settle: (t) => {
      const c1 = 1.15, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    hold: (t) => (t < 1 ? 0 : 1),
  };
  RS.EASES = EASES;
  RS.clamp = clamp;
  RS.lerp = lerp;

  /** Mulberry32 — seeded PRNG; never Math.random in render paths. */
  RS.prng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** Smooth value noise in [-1, 1], deterministic per seed. */
  RS.noise1 = function (seed) {
    const rnd = RS.prng(seed);
    const pts = Array.from({ length: 512 }, () => rnd() * 2 - 1);
    return (x) => {
      const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
      return lerp(pts[((i % 512) + 512) % 512], pts[(((i + 1) % 512) + 512) % 512], u);
    };
  };

  // ---------------------------------------------------------------- keyframe tracks
  /**
   * Track: sorted keys [{t, v, ease}]; value before the first key is the first key's value, and the
   * segment ending at key k uses key k's ease (so "arrive at v by t with ease e").
   */
  class Track {
    constructor(initial) { this.keys = [{ t: -1e9, v: initial, ease: "linear" }]; }
    key(t, v, ease = "inOut") { this.keys.push({ t, v, ease }); this.keys.sort((a, b) => a.t - b.t); return this; }
    at(t) {
      const k = this.keys;
      if (t <= k[0].t) return k[0].v;
      for (let i = 1; i < k.length; i++) {
        if (t < k[i].t) {
          const a = k[i - 1], b = k[i];
          const span = b.t - a.t;
          const p = span <= 0 ? 1 : (t - a.t) / span;
          return lerp(a.v, b.v, (EASES[b.ease] || EASES.inOut)(clamp(p, 0, 1)));
        }
      }
      return k[k.length - 1].v;
    }
  }
  RS.Track = Track;

  // ---------------------------------------------------------------- svg helpers
  RS.el = function (tag, attrs = {}, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };
  RS.frag = function (svgMarkup, parent) {
    const tmp = document.createElementNS(SVGNS, "g");
    tmp.innerHTML = svgMarkup;
    while (tmp.firstChild) parent.appendChild(tmp.firstChild);
    return parent;
  };
  const f = (n) => (Math.round(n * 100) / 100).toString();
  RS.f = f;

  // ---------------------------------------------------------------- parametric face parts
  /**
   * Almond eye. open ∈ [0,1] (1 = relaxed open), squint lifts the lower lid, look = [-1..1, -1..1].
   * Returns path data for the eye opening and the upper-lid line.
   */
  RS.eyePaths = function (e, p) {
    const { cx, cy, w, h, tilt = 0, inner = -1 } = e; // inner: -1 inner corner on the left, +1 on the right
    const open = clamp(p.open, 0, 1.15), sq = clamp(p.squint || 0, 0, 1);
    const hw = w / 2;
    const xi = cx + inner * hw, xo = cx - inner * hw;      // inner / outer corners
    const yi = cy + 1.5, yo = cy - tilt;                     // outer corner sits slightly higher
    const up = h * 0.62 * open;                              // upper lid height
    const lo = h * 0.38 * (1 - 0.55 * sq) * Math.max(open, 0.25) + 0.6;
    // peak of the upper lid sits toward the inner third (natural asymmetry)
    const pkx = cx + inner * hw * 0.18;
    const upper = `M${f(xi)} ${f(yi)} C${f(lerp(xi, pkx, 0.45))} ${f(yi - up * 0.95)} ${f(lerp(pkx, xo, 0.35))} ${f(yo - up * 1.05)} ${f(xo)} ${f(yo)}`;
    const lower = `C${f(lerp(xo, cx, 0.4))} ${f(yo + lo * 0.9)} ${f(lerp(cx, xi, 0.55))} ${f(yi + lo)} ${f(xi)} ${f(yi)}Z`;
    const crease = `M${f(lerp(xi, pkx, 0.2))} ${f(yi - up - h * 0.42 - 2)} C${f(pkx)} ${f(yi - up * 1.1 - h * 0.55)} ${f(lerp(pkx, xo, 0.6))} ${f(yo - up - h * 0.5)} ${f(xo + inner * 2)} ${f(yo - h * 0.18)}`;
    return { opening: upper + " " + lower, lid: upper, crease };
  };

  /** Tapered brow. raise lifts the whole brow, inner lifts/knits the inner head, outer lifts the tail. */
  RS.browPath = function (b, p) {
    const { x1, y1, x2, y2, thick = 7, inner = -1 } = b; // (x1,y1) inner head, (x2,y2) tail
    const r = p.raise || 0, ir = p.inner || 0, orr = p.outer || 0, knit = p.knit || 0;
    const hx = x1 - inner * knit * 4, hy = y1 - r - ir * 7 + knit * 2;
    const tx = x2, ty = y2 - r - orr * 5 + ir * 1.5;
    const mx = lerp(hx, tx, 0.58), my = lerp(hy, ty, 0.58) - 5 - r * 0.3 + ir * 1.5;
    const t = thick;
    return `M${f(hx)} ${f(hy + t * 0.55)} Q${f(hx)} ${f(hy - t * 0.45)} ${f(hx - inner * t * 0.6)} ${f(hy - t * 0.5)} ` +
      `Q${f(mx)} ${f(my - t * 0.55)} ${f(tx)} ${f(ty)} ` +
      `Q${f(mx)} ${f(my + t * 0.55)} ${f(hx)} ${f(hy + t * 0.55)}Z`;
  };

  /**
   * Mouth with two lips. smile ∈ [-1,1] lifts corners, open ∈ [0,1] parts the lips, wide scales width,
   * shape ∈ [0,1] rounds the opening for "o"/"u" visemes.
   */
  RS.mouthPaths = function (m, p) {
    const { cx, cy, wNear, wFar, lipUp = 5, lipLo = 7 } = m;
    const sm = clamp(p.smile || 0, -1, 1), op = clamp(p.open || 0, 0, 1), wd = p.wide ?? 1, rd = p.round || 0;
    const kn = wNear * wd * (1 - rd * 0.35), kf = wFar * wd * (1 - rd * 0.35);
    const xl = cx - kn, xr = cx + kf;
    const cyC = cy - sm * 4.5;                      // corners
    const gap = op * 13 * (1 + rd * 0.3);
    const midTop = cy - gap * 0.45, midBot = cy + gap * 0.55;
    const bow = 2.2 * (1 - op * 0.5);
    const upperTop = `M${f(xl)} ${f(cyC)} C${f(xl + kn * 0.35)} ${f(cy - lipUp * 0.9 - gap * 0.4)} ${f(cx - kn * 0.35)} ${f(midTop - lipUp - 0.5)} ${f(cx - 2)} ${f(midTop - lipUp + bow * 0.2)} ` +
      `Q${f(cx)} ${f(midTop - lipUp + bow)} ${f(cx + 2)} ${f(midTop - lipUp + bow * 0.1)} C${f(cx + kf * 0.35)} ${f(midTop - lipUp - 0.6)} ${f(xr - kf * 0.3)} ${f(cy - lipUp * 0.8 - gap * 0.4)} ${f(xr)} ${f(cyC)}`;
    const upperLine = `C${f(xr - kf * 0.35)} ${f(midTop + 0.8 - sm * 1.2)} ${f(cx + kf * 0.2)} ${f(midTop + 1.4)} ${f(cx)} ${f(midTop + 1.2)} C${f(cx - kn * 0.25)} ${f(midTop + 1.4)} ${f(xl + kn * 0.35)} ${f(midTop + 0.8 - sm * 1.2)} ${f(xl)} ${f(cyC)}Z`;
    const lowerLine = `M${f(xl)} ${f(cyC)} C${f(xl + kn * 0.35)} ${f(midBot - 0.6 - sm * 1.2)} ${f(cx - kn * 0.2)} ${f(midBot)} ${f(cx)} ${f(midBot)} C${f(cx + kf * 0.2)} ${f(midBot)} ${f(xr - kf * 0.35)} ${f(midBot - 0.6 - sm * 1.2)} ${f(xr)} ${f(cyC)}`;
    const lowerBottom = `C${f(xr - kf * 0.3)} ${f(midBot + lipLo * 0.85)} ${f(cx + kf * 0.3)} ${f(midBot + lipLo + 0.6)} ${f(cx)} ${f(midBot + lipLo + 0.4)} C${f(cx - kn * 0.35)} ${f(midBot + lipLo + 0.6)} ${f(xl + kn * 0.3)} ${f(midBot + lipLo * 0.8)} ${f(xl)} ${f(cyC)}Z`;
    const inner = `M${f(xl + 1)} ${f(cyC)} C${f(xl + kn * 0.35)} ${f(midTop + 0.8)} ${f(cx - 4)} ${f(midTop + 1.2)} ${f(cx)} ${f(midTop + 1.2)} C${f(cx + 4)} ${f(midTop + 1.2)} ${f(xr - kf * 0.35)} ${f(midTop + 0.8)} ${f(xr - 1)} ${f(cyC)} ` +
      `C${f(xr - kf * 0.35)} ${f(midBot - 0.6)} ${f(cx + 4)} ${f(midBot)} ${f(cx)} ${f(midBot)} C${f(cx - 4)} ${f(midBot)} ${f(xl + kn * 0.35)} ${f(midBot - 0.6)} ${f(xl + 1)} ${f(cyC)}Z`;
    const line = `M${f(xl - 1)} ${f(cyC + 0.5)} C${f(xl + kn * 0.4)} ${f(cy + 1.2 - sm * 1.5)} ${f(cx - 3)} ${f(cy + 1.4)} ${f(cx)} ${f(cy + 1.1)} C${f(cx + 3)} ${f(cy + 1.4)} ${f(xr - kf * 0.4)} ${f(cy + 1.2 - sm * 1.5)} ${f(xr + 1)} ${f(cyC + 0.5)}`;
    return { upper: upperTop + " " + upperLine, lower: lowerLine + " " + lowerBottom, inner, line, gap };
  };


  // ---------------------------------------------------------------- procedural hand (back view)
  /**
   * Builds a hand in wrist space (wrist at 0,0; hand points +x; index finger on the -y side).
   * h = {curl 0..1, spread deg, index 0..1 (extend index), thumb deg, scale}. Curling fingers foreshorten
   * (they bend away from camera), which is what sells the 2.5D read at film scale.
   */
  RS.handShapes = function (h) {
    const s = h.scale || 1, rad = Math.PI / 180;
    const curl = clamp(h.curl ?? 0.2, 0, 1), spread = h.spread ?? 4, idx = clamp(h.index ?? 0, 0, 1);
    const fingers = [
      { b: [60, -19], a: -4, l: [25, 16, 12.5], w: 13, c: 1 - idx },     // index
      { b: [63, -7], a: -1, l: [28, 17.5, 13.5], w: 13.6, c: 1 },        // middle
      { b: [60, 5], a: 2.5, l: [26, 16.5, 12.5], w: 12.8, c: 1.05 },     // ring
      { b: [54, 15.5], a: 6, l: [20, 13, 11], w: 11, c: 1.12 },          // little
    ];
    const smooth = (q) => {
      let d = `M${f(q[0][0])} ${f(q[0][1])}`;
      for (let i = 1; i < q.length - 1; i++) {
        const m = [(q[i][0] + q[i + 1][0]) / 2, (q[i][1] + q[i + 1][1]) / 2];
        d += ` Q${f(q[i][0])} ${f(q[i][1])} ${f(m[0])} ${f(m[1])}`;
      }
      const L = q[q.length - 1];
      return d + ` L${f(L[0])} ${f(L[1])}`;
    };
    const build = (base, ang, lens, curls, w0) => {
      const pts = [base]; let cum = 0, a = ang;
      const dirs = [];
      for (let i = 0; i < 3; i++) {
        cum += curls[i];
        const L = lens[i] * s * Math.max(0.12, Math.cos(cum * rad * 0.92));
        const da = (a + cum * 0.55) * rad;
        dirs.push(da);
        const pr = pts[pts.length - 1];
        pts.push([pr[0] + Math.cos(da) * L, pr[1] + Math.sin(da) * L]);
      }
      const ws = [w0, w0 * 0.93, w0 * 0.84, w0 * 0.74].map((w) => (w * s) / 2);
      const left = [], right = [];
      pts.forEach((p, i) => {
        const da = dirs[Math.min(i, 2)] * (i === 0 ? 1 : 0.5) + (i === 0 ? 0 : dirs[Math.max(0, i - 1)] * 0.5);
        const nx = -Math.sin(da), ny = Math.cos(da);
        left.push([p[0] + nx * ws[i], p[1] + ny * ws[i]]);
        right.push([p[0] - nx * ws[i], p[1] - ny * ws[i]]);
      });
      const tip = pts[3], r = ws[3];
      let d = `M${f(right[0][0])} ${f(right[0][1])} A${f(ws[0])} ${f(ws[0])} 0 0 0 ${f(left[0][0])} ${f(left[0][1])}` + smooth(left).replace(/^M[^Q]+/, "");
      d += ` A${f(r)} ${f(r)} 0 0 0 ${f(right[3][0])} ${f(right[3][1])}`;
      const back = smooth(right.slice().reverse()).replace(/^M[^Q]+/, "");
      d += back + "Z";
      const tipDir = dirs[2];
      const nail = { x: tip[0] - Math.cos(tipDir) * r * 1.1, y: tip[1] - Math.sin(tipDir) * r * 1.1, a: tipDir / rad, w: r * 1.5, h: r * 1.15, vis: clamp(1 - cum / 120, 0, 1) };
      const knuckles = pts.slice(1, 3);
      return { d, nail, knuckles, pts };
    };
    const out = { fingers: [], nails: [], creases: "" };
    fingers.forEach((fg, i) => {
      const c = curl * fg.c * 1;
      const curls = [c * 62, c * 78, c * 48];
      const sp = (i - 1.4) * spread * 0.7;
      out.fingers.push(build([fg.b[0] * s, fg.b[1] * s], fg.a + sp, fg.l, curls, fg.w));
    });
    // thumb: from the side of the wrist, angled toward the index finger
    const th = h.thumb ?? 0;
    out.thumb = build([20 * s, -14 * s], -30 + th, [21, 17, 13], [6 + curl * 16, 10 + curl * 26, 8], 14.5);
    // back of hand: wrist → index knuckle → across knuckles → little-finger knuckle → wrist
    const k = out.fingers.map((g) => g.pts[0]);
    out.back = `M${f(-4 * s)} ${f(-19 * s)} C${f(20 * s)} ${f(-24 * s)} ${f(44 * s)} ${f(-28 * s)} ${f(k[0][0] - 2)} ${f(k[0][1] - 6.5 * s)} ` +
      `Q${f(k[1][0] + 8 * s)} ${f(k[1][1] - 6 * s)} ${f(k[1][0] + 4 * s)} ${f(k[1][1] + 2 * s)} Q${f(k[2][0] + 6 * s)} ${f(k[2][1])} ${f(k[2][0] + 1 * s)} ${f(k[2][1] + 7 * s)} ` +
      `Q${f(k[3][0] + 6 * s)} ${f(k[3][1] + 2 * s)} ${f(k[3][0] - 2 * s)} ${f(k[3][1] + 7 * s)} C${f(40 * s)} ${f(30 * s)} ${f(18 * s)} ${f(24 * s)} ${f(-6 * s)} ${f(17 * s)} Z`;
    out.tendons = [0, 1, 2, 3].map((i) => `M${f(14 * s)} ${f((-9 + i * 6.5) * s)} Q${f(40 * s)} ${f((-14 + i * 9) * s)} ${f(k[i][0] - 6 * s)} ${f(k[i][1])}`).join(" ");
    out.creases = out.fingers.map((g) => `M${f(g.knuckles[0][0])} ${f(g.knuckles[0][1])} m-2 -3 q2 3 0 6`).join(" ");
    return out;
  };

  /** Markup slots for a procedural hand; `apply()` fills the path data every frame. */
  RS.handMarkup = function (id, side, C, gradId) {
    const fingerSlots = [3, 2, 1, 0].map((i) => `<path data-part="h${side}f${i}" fill="url(#${gradId})" stroke="${C.skinDeep}" stroke-width=".8" stroke-opacity=".45"/>`).join("");
    const nailSlots = [0, 1, 2, 3, 4].map((i) => `<ellipse data-part="h${side}n${i}" fill="#efd3bf" opacity=".85"/>`).join("");
    return `<g data-part="h${side}ThumbBack"><path data-part="h${side}th" fill="url(#${gradId})" stroke="${C.skinShade}" stroke-width=".8" stroke-opacity=".4"/></g>
      ${fingerSlots}
      <path data-part="h${side}back" fill="url(#${gradId})"/>
      <path data-part="h${side}ten" fill="none" stroke="${C.skinLit}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
      <path data-part="h${side}cr" fill="none" stroke="${C.skinDeep}" stroke-width="1.1" stroke-linecap="round" opacity=".35"/>
      ${nailSlots}
      <g data-part="h${side}ThumbFront"></g>`;
  };

  RS.HAND_POSES = {
    rest: { curl: 0.28, spread: 3, index: 0, thumb: 4, thumbFront: 0 },
    hold: { curl: 0.55, spread: 1, index: 0.1, thumb: 22, thumbFront: 1 },
    phone: { curl: 0.62, spread: 0, index: 0, thumb: 34, thumbFront: 1 },
    point: { curl: 0.85, spread: 0, index: 1, thumb: 24, thumbFront: 1 },
    open: { curl: 0.08, spread: 9, index: 0, thumb: -6, thumbFront: 0 },
    loose: { curl: 0.45, spread: 2, index: 0, thumb: 10, thumbFront: 0 },
    type: { curl: 0.5, spread: 4, index: 0.25, thumb: 18, thumbFront: 0 },
  };

  // ---------------------------------------------------------------- rig
  /**
   * def = {
   *   id, svg (static markup with named <g data-part> groups), joints: {name: {x,y}},
   *   eyes: [{id, cx, cy, w, h, ...}], brows: [{id, ...}], mouth: {...}, defaults: {param: value}
   *   handPoses: {near: [names], far: [names]}
   * }
   */
  class Rig {
    constructor(def, mount, opts = {}) {
      this.def = def;
      this.id = opts.id || def.id;
      this.seed = opts.seed ?? 7;
      this.root = RS.el("g", { class: "rs-rig", "data-rig": this.id }, mount);
      RS.frag(def.build(this.id), this.root);
      this.parts = {};
      this.root.querySelectorAll("[data-part]").forEach((n) => (this.parts[n.getAttribute("data-part")] = n));
      this.params = Object.assign({}, RS.RIG_DEFAULTS, def.defaults || {});
      this.tracks = {};
      this.blinks = [];
      this.procedural = { breath: 1, sway: 1, saccade: 1 };
      this.noiseA = RS.noise1(this.seed * 13 + 1);
      this.noiseB = RS.noise1(this.seed * 29 + 5);
    }

    /** Keyframe a set of params: rig.key(t, {headTilt: 4, smile: .2}, "settle") */
    key(t, values, ease = "inOut") {
      for (const [k, v] of Object.entries(values)) {
        if (!this.tracks[k]) this.tracks[k] = new Track(this.params[k] ?? 0);
        this.tracks[k].key(t, v, ease);
      }
      return this;
    }
    /** Key a named hand pose: rig.hand(t, "Near", "point") — fingers interpolate, they do not swap. */
    hand(t, side, name, ease = "inOut") {
      const hp = RS.HAND_POSES[name];
      return this.key(t, { [`hand${side}Curl`]: hp.curl, [`hand${side}Spread`]: hp.spread, [`hand${side}Index`]: hp.index, [`hand${side}Thumb`]: hp.thumb }, ease)
        .key(t, { [`hand${side}ThumbFront`]: hp.thumbFront }, "hold");
    }
    /** Hold current values from t (creates explicit keys so later moves start from here). */
    hold(t, names) {
      for (const k of names) {
        const tr = this.tracks[k] || (this.tracks[k] = new Track(this.params[k] ?? 0));
        tr.key(t, tr.at(t), "linear");
      }
      return this;
    }
    /** A full blink at time t (closing 70ms, closed 40ms, opening 120ms). */
    blink(t, depth = 1) { this.blinks.push({ t, depth }); return this; }
    /** Seeded natural blink schedule between t0 and t1, avoiding explicit `quiet` windows. */
    autoBlink(t0, t1, opts = {}) {
      const rnd = RS.prng(this.seed * 101 + Math.round(t0 * 10));
      let t = t0 + 0.6 + rnd() * 1.4;
      while (t < t1) {
        if (!(opts.quiet || []).some(([a, b]) => t >= a && t <= b)) {
          this.blinks.push({ t, depth: 1 });
          if (rnd() < 0.12) this.blinks.push({ t: t + 0.32, depth: 1 }); // occasional double blink
        }
        t += 2.2 + rnd() * 3.6;
      }
      return this;
    }
    blinkAmount(t) {
      let c = 0;
      for (const b of this.blinks) {
        const d = t - b.t;
        if (d < -0.07 || d > 0.23) continue;
        const v = d < 0 ? 1 + d / 0.07 : d < 0.04 ? 1 : 1 - (d - 0.04) / 0.19;
        c = Math.max(c, EASES.sine(clamp(v, 0, 1)) * b.depth);
      }
      return c;
    }

    evaluate(t) {
      const p = Object.assign({}, this.params);
      for (const [k, tr] of Object.entries(this.tracks)) p[k] = tr.at(t);
      // procedural layers — subtle, seeded, never looping visibly
      const br = Math.sin((t / 4.1) * Math.PI * 2) * 0.5 + Math.sin((t / 6.7) * Math.PI * 2 + 1.3) * 0.5;
      p.breath = br * this.procedural.breath;
      p.headTilt += this.noiseA(t * 0.35) * 0.8 * this.procedural.sway;
      p.headNod += this.noiseB(t * 0.3) * 0.5 * this.procedural.sway;
      p.lean += this.noiseB(t * 0.18 + 40) * 0.35 * this.procedural.sway;
      // micro-saccades: tiny gaze steps every ~0.6–1.4s, held (not drifting)
      if (this.procedural.saccade) {
        const step = Math.floor(t * 1.15);
        const r = RS.prng(this.seed * 977 + step);
        p.lookX += (r() - 0.5) * 0.09;
        p.lookY += (r() - 0.5) * 0.07;
      }
      const bl = this.blinkAmount(t);
      p.lidL = p.lidL * (1 - bl);
      p.lidR = p.lidR * (1 - bl);
      p._blink = bl;
      return p;
    }

    pose(t) { this._t = t; this.apply(this.evaluate(t)); }

    apply(p) {
      const d = this.def, P = this.parts;
      const J = d.joints;
      const rot = (node, deg, j, extra = "") => node && node.setAttribute("transform", `${extra}rotate(${f(deg)} ${f(j.x)} ${f(j.y)})`);
      // body
      const bodyT = `translate(${f(p.bodyX)} ${f(p.bodyY - p.breath * 0.8)}) rotate(${f(p.lean)} ${f(J.hip.x)} ${f(J.hip.y)})`;
      if (P.body) P.body.setAttribute("transform", bodyT);
      // limbs re-parented above furniture (see RS.seatAtDesk) follow the body
      if (this.limbHolders) this.limbHolders.forEach((h) => h.setAttribute("transform", bodyT));
      if (P.chest) P.chest.setAttribute("transform", `translate(0 ${f(-p.breath * 1.2)})`);
      if (P.shoulders) P.shoulders.setAttribute("transform", `translate(0 ${f(-p.breath * 1.6 + p.shrug * -6)})`);
      // head
      if (P.head) P.head.setAttribute("transform",
        `translate(${f(p.headX + p.headTurn * 2.2)} ${f(p.headY + p.headNod * 0.9)}) rotate(${f(p.headTilt)} ${f(J.neck.x)} ${f(J.neck.y)})`);
      // features shift with turn/nod to fake rotation (2.5D parallax inside the face)
      if (P.features) P.features.setAttribute("transform", `translate(${f(p.headTurn * 3.2)} ${f(p.headNod * 0.35)})`);
      if (P.nose) P.nose.setAttribute("transform", `translate(${f(p.headTurn * 1.8)} ${f(p.headNod * 0.6)})`);
      if (P.hairFront) P.hairFront.setAttribute("transform", `translate(${f(p.headTurn * 1.2)} 0)`);
      // eyes
      (d.eyes || []).forEach((e) => {
        const isL = e.id === "L";
        const ep = { open: isL ? p.lidL : p.lidR, squint: p.squint };
        const paths = RS.eyePaths(e, ep);
        const op = P[`eyeOpen${e.id}`], lid = P[`eyeLid${e.id}`], cr = P[`eyeCrease${e.id}`], clip = this.root.querySelector(`#${this.id}-eyeclip-${e.id} path`);
        if (op) op.setAttribute("d", paths.opening);
        if (clip) clip.setAttribute("d", paths.opening);
        if (lid) lid.setAttribute("d", paths.lid);
        if (cr) cr.setAttribute("d", paths.crease);
        const iris = P[`iris${e.id}`];
        if (iris) iris.setAttribute("transform", `translate(${f(e.cx + p.lookX * e.w * 0.26)} ${f(e.cy + 0.5 + p.lookY * e.h * 0.28 - (1 - Math.min(1, ep.open)) * 1.5)})`);
      });
      // brows
      (d.brows || []).forEach((b) => {
        const node = P[`brow${b.id}`];
        if (!node) return;
        const asym = b.id === "L" ? p.browAsym : -p.browAsym;
        node.setAttribute("d", RS.browPath(b, { raise: p.browRaise + asym * 2, inner: p.browInner, outer: p.browOuter, knit: p.browKnit }));
      });
      // mouth
      if (d.mouth) {
        const mp = RS.mouthPaths(d.mouth, { smile: p.smile, open: p.mouthOpen, wide: p.mouthWide, round: p.mouthRound });
        P.lipUpper && P.lipUpper.setAttribute("d", mp.upper);
        P.lipLower && P.lipLower.setAttribute("d", mp.lower);
        P.mouthInner && P.mouthInner.setAttribute("d", mp.inner);
        P.mouthInner && P.mouthInner.setAttribute("opacity", f(clamp(mp.gap / 3, 0, 1)));
        P.mouthLine && P.mouthLine.setAttribute("d", mp.line);
        P.cheeks && P.cheeks.setAttribute("transform", `translate(0 ${f(-p.smile * 2.2)})`);
        P.cheeks && P.cheeks.setAttribute("opacity", f(0.55 + Math.max(0, p.smile) * 0.45));
      }
      // arms (2-bone): shoulder → elbow → wrist; hand poses swap by opacity
      for (const side of ["Near", "Far"]) {
        rot(P[`arm${side}`], p[`shoulder${side}`], J[`shoulder${side}`]);
        rot(P[`fore${side}`], p[`elbow${side}`], J[`elbow${side}`]);
        rot(P[`hand${side}`], p[`wrist${side}`], J[`wrist${side}`]);
        const pre = `h${side}`;
        if (P[`${pre}back`]) {
          const hs = RS.handShapes({ curl: p[`hand${side}Curl`], spread: p[`hand${side}Spread`], index: p[`hand${side}Index`], thumb: p[`hand${side}Thumb`], scale: d.handScale || 1 });
          hs.fingers.forEach((g, i) => P[`${pre}f${i}`].setAttribute("d", g.d));
          P[`${pre}back`].setAttribute("d", hs.back);
          P[`${pre}ten`].setAttribute("d", hs.tendons);
          P[`${pre}cr`].setAttribute("d", hs.creases);
          P[`${pre}th`].setAttribute("d", hs.thumb.d);
          [...hs.fingers, hs.thumb].forEach((g, i) => {
            const n = P[`${pre}n${i}`]; if (!n) return;
            n.setAttribute("cx", f(g.nail.x)); n.setAttribute("cy", f(g.nail.y));
            n.setAttribute("rx", f(g.nail.w / 2)); n.setAttribute("ry", f(g.nail.h / 2));
            n.setAttribute("transform", `rotate(${f(g.nail.a)} ${f(g.nail.x)} ${f(g.nail.y)})`);
            n.setAttribute("opacity", f(0.85 * g.nail.vis));
          });
          const front = p[`hand${side}ThumbFront`] > 0.5;
          const target = front ? P[`${pre}ThumbFront`] : P[`${pre}ThumbBack`];
          if (P[`${pre}th`].parentNode !== target) target.appendChild(P[`${pre}th`]);
        }
      }
      // generic extra transforms the character may define (prop slides, scarf sway…)
      if (d.applyExtra) d.applyExtra(P, p, this);
    }
  }
  RS.Rig = Rig;

  /** Attach a prop to a hand (wrist space): drawn behind the fingers by default. Returns the prop group. */
  RS.attach = function (rig, side, o = {}) {
    const inner = rig.parts[`hand${side}`].firstElementChild; // the translate/scale group around the hand
    const g = RS.el("g", { class: "held", transform: o.transform || "" });
    if (o.front) inner.appendChild(g); else inner.insertBefore(g, inner.firstChild);
    return g;
  };

  /** Typing: seeded finger/wrist micro-motion on both hands over [t0, t1]. */
  RS.type = function (rig, t0, t1, o = {}) {
    const rnd = RS.prng((o.seed ?? 5) * 31 + Math.round(t0 * 10));
    let t = t0;
    while (t < t1) {
      const side = rnd() < 0.5 ? "Near" : "Far";
      const dt = 0.11 + rnd() * 0.09;
      rig.key(t, { [`hand${side}Curl`]: 0.62 + rnd() * 0.12, [`hand${side}Index`]: 0.1 + rnd() * 0.4, [`wrist${side}`]: (o.wrist ?? 0) + (rnd() - 0.5) * 3 }, "sine");
      rig.key(t + dt * 0.6, { [`hand${side}Curl`]: 0.48, [`hand${side}Index`]: 0.25 }, "sine");
      t += dt;
      if (rnd() < 0.08) t += 0.35; // a natural pause between words
    }
    return rig;
  };

  RS.RIG_DEFAULTS = {
    bodyX: 0, bodyY: 0, lean: 0, shrug: 0, breath: 0,
    headX: 0, headY: 0, headTilt: 0, headNod: 0, headTurn: 0,
    lidL: 1, lidR: 1, squint: 0, lookX: 0, lookY: 0,
    browRaise: 0, browInner: 0, browOuter: 0, browKnit: 0, browAsym: 0,
    smile: 0, mouthOpen: 0, mouthWide: 1, mouthRound: 0,
    shoulderNear: 0, elbowNear: 0, wristNear: 0, handNearCurl: .28, handNearSpread: 3, handNearIndex: 0, handNearThumb: 4, handNearThumbFront: 0,
    shoulderFar: 0, elbowFar: 0, wristFar: 0, handFarCurl: .28, handFarSpread: 3, handFarIndex: 0, handFarThumb: 4, handFarThumbFront: 0,
  };

  /** Expression presets — combined, never looped. Values are deltas from a neutral face. */
  RS.EXPRESSIONS = {
    neutral: { browRaise: 0, browInner: 0, browOuter: 0, browKnit: 0, smile: 0, squint: 0, mouthOpen: 0 },
    concerned: { browRaise: 0.5, browInner: 0.9, browOuter: -0.3, browKnit: 0.45, smile: -0.25, squint: 0.1, mouthOpen: 0 },
    attentive: { browRaise: 1.6, browInner: 0.2, browOuter: 0.25, browKnit: 0, smile: 0.08, squint: 0, mouthOpen: 0 },
    thoughtful: { browRaise: 0.4, browInner: 0.35, browOuter: -0.15, browKnit: 0.7, smile: -0.05, squint: 0.3, mouthOpen: 0 },
    reassured: { browRaise: 0.6, browInner: 0.05, browOuter: 0.2, browKnit: 0, smile: 0.4, squint: 0.25, mouthOpen: 0 },
    warm: { browRaise: 1, browInner: 0.15, browOuter: 0.3, browKnit: 0, smile: 0.55, squint: 0.35, mouthOpen: 0.05 },
    listening: { browRaise: 1.1, browInner: 0.25, browOuter: 0, browKnit: 0.1, smile: 0.12, squint: 0.1, mouthOpen: 0 },
  };

  /**
   * Speech helper: a sequence of visemes over [t0, t1] at a natural syllable rate, seeded.
   * Only used where a character visibly speaks (the film is narrator-led; dialogue is shown, not heard).
   */
  RS.speak = function (rig, t0, t1, opts = {}) {
    const rnd = RS.prng((opts.seed ?? 3) * 71 + Math.round(t0 * 100));
    const rate = opts.rate ?? 4.2; // syllables per second
    let t = t0;
    rig.key(t0 - 0.05, { mouthOpen: 0, mouthRound: 0 }, "linear");
    while (t < t1) {
      const dur = (0.7 + rnd() * 0.6) / rate;
      const v = rnd();
      const open = v < 0.18 ? 0.08 : 0.22 + rnd() * 0.45;
      rig.key(t + dur * 0.5, { mouthOpen: open * (opts.scale ?? 1), mouthRound: rnd() < 0.2 ? 0.6 : 0 }, "sine");
      t += dur;
      if (rnd() < 0.12) { rig.key(t + 0.08, { mouthOpen: 0.03 }, "sine"); t += 0.22; } // word gap
    }
    rig.key(t1 + 0.08, { mouthOpen: 0, mouthRound: 0 }, "out");
    return rig;
  };
})();
