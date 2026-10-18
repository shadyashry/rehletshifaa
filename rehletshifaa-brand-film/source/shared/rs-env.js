/*
 * Environments. Each builder draws one location into layered groups so the camera can parallax them:
 * { far, mid, near, fg } — far moves least, fg moves most. All static; motion lives on scene timelines.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;
  RS.env = {};

  function layers(svg, parent) {
    const L = {};
    ["far", "mid", "near", "fg", "light"].forEach((k) => (L[k] = el("g", { class: `layer-${k}` }, parent)));
    return L;
  }
  RS.layers = layers;

  /** A desk/table surface seen slightly from above. Returns the group; top plane spans y0..y1. */
  RS.desk = function (svg, parent, o = {}) {
    const id = o.id || "desk";
    const g = el("g", { class: "desk" }, parent);
    const y0 = o.y0 ?? 840, y1 = o.y1 ?? 975, x0 = o.x0 ?? -40, x1 = o.x1 ?? 1960;
    const top = RS.linear(svg, `${id}-top`, [[0, o.topFar || "#dcc8a8"], [1, o.topNear || "#e8d7bb"]]);
    const face = RS.linear(svg, `${id}-face`, [[0, o.faceTop || "#b89c78"], [1, o.faceBot || "#9c8162"]]);
    el("path", { d: `M${x0} ${y0} L${x1} ${y0 - (o.skew || 0)} L${x1} ${y1} L${x0} ${y1} Z`, fill: top }, g);
    el("rect", { x: x0, y: y1, width: x1 - x0, height: 1080 - y1 + 40, fill: face }, g);
    el("rect", { x: x0, y: y1 - 3, width: x1 - x0, height: 5, fill: "#f3e6cf", opacity: 0.8 }, g);
    // soft wood grain
    const rnd = RS.prng(o.seed || 9);
    for (let i = 0; i < 9; i++) {
      const yy = y0 + 10 + rnd() * (y1 - y0 - 20);
      el("path", { d: `M${x0} ${yy} C${600 + rnd() * 200} ${yy - 6} ${1200 + rnd() * 200} ${yy + 6} ${x1} ${yy - 2}`, fill: "none", stroke: "#c8b08c", "stroke-width": 1.2, opacity: 0.35 }, g);
    }
    return g;
  };

  /** Consultation room (clinic): warm paper wall, window left, shelf right, plant. */
  RS.env.consultRoom = function (svg, parent, o = {}) {
    const L = layers(svg, parent);
    const wall = RS.linear(svg, "cr-wall", [[0, "#f3eee5"], [0.7, "#ebe4d8"], [1, "#e2d9ca"]]);
    el("rect", { x: -200, y: -200, width: 2320, height: 1480, fill: wall }, L.far);
    el("rect", { x: -200, y: 700, width: 2320, height: 6, fill: "#ddd3c3" }, L.far);
    const win = RS.props.window(svg, L.far, { id: "cr-win", w: 380, h: 520 });
    win.g.setAttribute("transform", "translate(70 110)");
    // shelf with folders behind the Consultant
    const sh = el("g", { transform: "translate(1490 300)" }, L.far);
    el("rect", { x: 0, y: 120, width: 440, height: 12, fill: "#cdbda3" }, sh);
    const cols = ["#0e5f66", "#5fb3ac", "#d9cbb2", "#1d6b6b", "#b6d3cf", "#c9b896", "#0e4f55"];
    cols.forEach((c, i) => el("rect", { x: 20 + i * 26, y: 120 - (70 + (i % 3) * 12), width: 22, height: 70 + (i % 3) * 12, rx: 2, fill: c }, sh));
    el("rect", { x: 240, y: 40, width: 120, height: 80, rx: 4, fill: "#fbf8f2", stroke: "#d8cfbf", "stroke-width": 6 }, sh);
    el("path", { d: "M262 102 C282 70 316 62 340 76", fill: "none", stroke: "#5fb3ac", "stroke-width": 5, "stroke-linecap": "round" }, sh);
    el("circle", { cx: 300, cy: 92, r: 8, fill: "#e07a5f", opacity: 0.85 }, sh);
    const plant = RS.props.plant(svg, L.mid, { s: 1.15, seed: 4 });
    plant.setAttribute("transform", "translate(1840 700)");
    L.plant = plant;
    L.window = win;
    return L;
  };

  /** Home (Amal's living room): window with curtain, sofa back, side table with lamp, framed art. */
  RS.env.home = function (svg, parent, o = {}) {
    const L = layers(svg, parent);
    const evening = !!o.evening;
    const wall = RS.linear(svg, "hm-wall" + (evening ? "e" : ""), evening
      ? [[0, "#ede3d4"], [1, "#dccdb7"]] : [[0, "#f4eee4"], [1, "#e7dece"]]);
    el("rect", { x: -200, y: -200, width: 2320, height: 1480, fill: wall }, L.far);
    const win = RS.props.window(svg, L.far, { id: "hm-win" + (evening ? "e" : ""), w: 460, h: 600 });
    win.g.setAttribute("transform", "translate(1240 90)");
    // framed abstract art (brand arc motif, no text)
    const art = el("g", { transform: "translate(250 210)" }, L.far);
    el("rect", { width: 260, height: 190, fill: "#faf6ef", stroke: "#cbbca4", "stroke-width": 8 }, art);
    el("path", { d: "M40 150 C90 60 170 50 220 90", fill: "none", stroke: "#5fb3ac", "stroke-width": 6, "stroke-linecap": "round" }, art);
    el("circle", { cx: 120, cy: 120, r: 12, fill: "#e07a5f", opacity: 0.8 }, art);
    // lamp + side table
    const lamp = el("g", { transform: "translate(150 520)" }, L.mid);
    el("path", { d: "M-60 0 L60 0 L40 -90 L-40 -90 Z", fill: evening ? "#f6e3bf" : "#efe4d1" }, lamp);
    el("rect", { x: -4, y: 0, width: 8, height: 160, fill: "#9c8a70" }, lamp);
    el("rect", { x: -80, y: 160, width: 160, height: 14, rx: 4, fill: "#b49b7a" }, lamp);
    if (evening) el("circle", { cx: 0, cy: -20, r: 260, fill: RS.radial(svg, "lampglow", [[0, "#ffd99a", 0.4], [1, "#ffd99a", 0]]) }, lamp);
    // sofa: low back, rounded arms, seat cushions — reads as furniture, not a wall panel
    const sofa = RS.linear(svg, "sofa" + (evening ? "e" : ""), [[0, "#b3c1bb"], [1, "#93a59d"]]);
    const sf = el("g", { class: "sofa" }, L.mid);
    el("path", { d: "M300 700 C300 664 326 648 364 646 L1060 646 C1098 648 1124 664 1124 700 L1124 960 L300 960 Z", fill: sofa }, sf);
    el("path", { d: "M330 664 L1094 664", stroke: "#c6d2cd", "stroke-width": 5, "stroke-linecap": "round", opacity: 0.7 }, sf);
    el("path", { d: "M712 660 L712 760", stroke: "#8a9c94", "stroke-width": 3, opacity: 0.6 }, sf);
    el("path", { d: "M250 760 C250 724 270 708 300 708 C330 708 350 724 350 760 L350 970 L250 970 Z", fill: "#a2b2ab" }, sf);
    el("path", { d: "M1074 760 C1074 724 1094 708 1124 708 C1154 708 1174 724 1174 760 L1174 970 L1074 970 Z", fill: "#8c9e96" }, sf);
    el("path", { d: "M262 724 C280 714 314 714 336 726", stroke: "#c3cfca", "stroke-width": 4, fill: "none", opacity: 0.7 }, sf);
    L.window = win;
    return L;
  };

  /** Coordinator office: soft wall, large monitor, pinboard of coloured cards (no text), window light right. */
  RS.env.office = function (svg, parent, o = {}) {
    const L = layers(svg, parent);
    const wall = RS.linear(svg, "of-wall", [[0, "#f0ede6"], [1, "#e4dfd5"]]);
    el("rect", { x: -200, y: -200, width: 2320, height: 1480, fill: wall }, L.far);
    el("rect", { x: 1380, y: 60, width: 420, height: 640, fill: RS.linear(svg, "of-win", [[0, "#eaf2ef"], [1, "#f8f2e4"]]) }, L.far);
    el("rect", { x: 1586, y: 60, width: 8, height: 640, fill: "#dcd5c8" }, L.far);
    el("rect", { x: 1360, y: 40, width: 460, height: 20, fill: "#dcd5c8" }, L.far);
    // calm pinboard of case-stage cards (optional: kept off when it would sit behind a face or a title)
    const pb = el("g", { transform: o.pinboard || "translate(150 170)", opacity: o.pinboard === false ? 0 : 1 }, L.far);
    el("rect", { width: 420, height: 300, rx: 8, fill: "#ece4d6", stroke: "#d6cab6", "stroke-width": 4 }, pb);
    [["#d9e8e6", 30, 30], ["#ffffff", 160, 40], ["#f3dcd3", 290, 30], ["#ffffff", 40, 160], ["#d9e8e6", 170, 170], ["#ffffff", 300, 160]].forEach(([c, x, y], i) => {
      el("rect", { x, y, width: 100, height: 80, rx: 4, fill: c, transform: `rotate(${(i % 2 ? 2 : -2)} ${x + 50} ${y + 40})` }, pb);
      el("rect", { x: x + 14, y: y + 18, width: 60, height: 6, rx: 3, fill: "#a3afb1", opacity: 0.7, transform: `rotate(${(i % 2 ? 2 : -2)} ${x + 50} ${y + 40})` }, pb);
    });
    const plant = RS.props.plant(svg, L.mid, { s: 0.9, seed: 12 });
    plant.setAttribute("transform", "translate(1830 720)");
    return L;
  };
})();
