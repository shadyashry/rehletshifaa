/*
 * Workplace props drawn on the desk plane: monitor (with a screen group for UI), keyboard, mug, loose sheets.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  /** Monitor on a stand; screen local size sw×sh. Returns {g, screen, glow}. */
  RS.props.monitor = function (svg, parent, o = {}) {
    const sw = o.sw || 760, sh = o.sh || 470, id = o.id || "mon";
    const g = el("g", { class: "prop-monitor" }, parent);
    el("path", { d: `M${sw / 2 - 40} ${sh + 30} L${sw / 2 + 40} ${sh + 30} L${sw / 2 + 60} ${sh + 120} L${sw / 2 - 60} ${sh + 120} Z`, fill: "#c9c3b8" }, g);
    el("rect", { x: sw / 2 - 120, y: sh + 112, width: 240, height: 16, rx: 8, fill: "#b9b2a6" }, g);
    el("rect", { x: -22, y: -22, width: sw + 44, height: sh + 52, rx: 18, fill: "#24343a" }, g);
    el("rect", { x: -22, y: sh + 8, width: sw + 44, height: 22, rx: 0, fill: "#2c3d43" }, g);
    const cp = el("clipPath", { id: `${id}-clip` }, RS.defs(svg));
    el("rect", { x: 0, y: 0, width: sw, height: sh, rx: 4 }, cp);
    const scr = el("g", { "clip-path": `url(#${id}-clip)` }, g);
    el("rect", { width: sw, height: sh, fill: RS.T.paper }, scr);
    const screen = el("g", { class: "screen" }, scr);
    el("path", { d: `M0 0 L${sw * 0.32} 0 L${sw * 0.12} ${sh} L0 ${sh} Z`, fill: "#fff", opacity: 0.05 }, g);
    return { g, screen, sw, sh };
  };

  /** Low-profile keyboard seen on the desk plane (skewed). */
  RS.props.keyboard = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-keyboard", transform: o.transform || "" }, parent);
    el("rect", { x: 3, y: 5, width: 300, height: 92, rx: 10, fill: "#000", opacity: 0.12 }, g);
    el("rect", { width: 300, height: 92, rx: 10, fill: "#e7e2d8", stroke: "#cfc8ba" }, g);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++)
      el("rect", { x: 10 + c * 23.6, y: 10 + r * 19, width: 20, height: 15, rx: 3, fill: "#f7f4ee", stroke: "#d8d1c4", "stroke-width": 0.8 }, g);
    return g;
  };

  RS.props.mug = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-mug", transform: o.transform || "" }, parent);
    el("path", { d: "M-26 -50 L26 -50 L22 10 Q0 18 -22 10 Z", fill: o.color || "#5fb3ac" }, g);
    el("ellipse", { cx: 0, cy: -50, rx: 26, ry: 7, fill: "#4a9a93" }, g);
    el("path", { d: "M24 -38 C44 -36 44 -8 22 -8", fill: "none", stroke: o.color || "#5fb3ac", "stroke-width": 7 }, g);
    return g;
  };

  /** A sheet lying on the desk plane (perspective-skewed). */
  RS.props.sheet = function (svg, parent, o = {}) {
    const g = el("g", { class: "prop-sheet", transform: o.transform || "" }, parent);
    RS.props.report(svg, g, { w: o.w || 240, h: o.h || 320, rows: o.rows || 8, id: o.id, variant: o.variant });
    return g;
  };

  /** Anatomical thumb for touch screens. The tip is the group origin; returns {thumb, shape} (move thumb, press shape). */
  RS.props.thumb = function (svg, parent, o = {}) {
    const thumb = RS.el("g", { class: "thumb" }, parent);
    const shape = RS.el("g", {}, thumb);
    // the RTL mirror lives on the art, so press tweens on `shape` never fight it
    const art = RS.el("g", { transform: `scale(${(o.rtl ? -1 : 1) * (o.s || 1)} ${o.s || 1}) rotate(-20)` }, shape);
    const el = RS.el;
    el("path", { d: "M-24 6 C-30 -30 -14 -66 14 -72 C40 -76 54 -54 50 -28 C46 0 50 40 74 116 C88 170 104 230 120 320 L44 340 C30 250 4 150 -24 6 Z", fill: RS.linear(svg, `${o.id}-thumb`, [[0, "#e6c0a0"], [0.55, "#d3a582"], [1, "#b2815f"]], 0, 0, 1, 0) }, art);
    el("path", { d: "M38 -42 C47 -12 50 40 74 116 L60 122 C44 64 36 12 36 -30 Z", fill: "#9b6d4f", opacity: 0.45 }, art);
    el("path", { d: "M-16 22 C0 30 22 30 42 20", fill: "none", stroke: "#9b6d4f", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.5 }, art);
    el("path", { d: "M-10 34 C4 40 20 40 36 32", fill: "none", stroke: "#9b6d4f", "stroke-width": 1.4, "stroke-linecap": "round", opacity: 0.35 }, art);
    el("path", { d: "M-6 -50 C0 -66 24 -70 34 -54 C40 -42 32 -28 14 -28 C-2 -28 -12 -38 -6 -50 Z", fill: "#f2d8c5" }, art);
    el("path", { d: "M-4 -36 C6 -30 22 -30 32 -38", fill: "none", stroke: "#c99a7c", "stroke-width": 1.4, opacity: 0.8 }, art);
    el("path", { d: "M2 -58 C8 -64 18 -64 24 -60", fill: "none", stroke: "#fff", "stroke-width": 2, "stroke-linecap": "round", opacity: 0.55 }, art);
    return { thumb, shape };
  };
})();
