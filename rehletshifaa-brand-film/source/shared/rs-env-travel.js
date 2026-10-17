/*
 * Travel environments: Cairo arrivals hall and a car interior with the city passing outside.
 * Same layer contract as rs-env.js (far, mid, near, fg, light). Built wide (≈ 3200px) so the camera can track.
 * No real airline, airport or hospital branding; landmarks stay generic (palms, Nile, low skyline, minarets).
 */
(function () {
  const RS = window.RS;
  const el = RS.el;

  /** Arrivals hall: tall glazing onto a pale sky and low skyline, linear ceiling lights, polished floor. */
  RS.env.airport = function (svg, parent, o = {}) {
    const L = RS.layers(svg, parent);
    const id = o.id || "ap";
    el("rect", { x: -400, y: -300, width: 3800, height: 1700, fill: RS.linear(svg, `${id}-wall`, [[0, "#eee9df"], [1, "#e2dbcf"]]) }, L.far);
    // glazing: sky, distant skyline and palms, mullions
    const gl = el("g", {}, L.far);
    el("rect", { x: -300, y: 70, width: 3600, height: 600, fill: RS.linear(svg, `${id}-sky`, [[0, "#e4eeec"], [0.7, "#f4efe3"], [1, "#efe4d0"]]) }, gl);
    const sky = el("g", { opacity: 0.55 }, gl);
    let x = -300;
    const rnd = RS.prng(31);
    while (x < 3300) {
      const w = 60 + rnd() * 140, h = 40 + rnd() * 110;
      el("rect", { x, y: 640 - h, width: w, height: h + 30, fill: "#c9d3cf" }, sky);
      if (rnd() < 0.18) { el("rect", { x: x + w / 2 - 5, y: 640 - h - 70, width: 10, height: 70, fill: "#c9d3cf" }, sky); el("circle", { cx: x + w / 2, cy: 640 - h - 74, r: 9, fill: "#c9d3cf" }, sky); }
      x += w + 8;
    }
    for (let i = 0; i < 7; i++) {
      const px = -200 + i * 520 + rnd() * 120;
      const p = el("g", { transform: `translate(${px} 670)`, opacity: 0.7 }, gl);
      el("path", { d: "M-5 0 C-3 -90 2 -170 8 -230 L14 -230 C10 -170 6 -90 6 0 Z", fill: "#a9b8a8" }, p);
      [-60, -25, 15, 50, 80].forEach((a) => el("path", { d: `M11 -232 C${11 + Math.cos(a * Math.PI / 180) * 50} ${-252 + Math.sin(a * Math.PI / 180) * 20} ${11 + Math.cos(a * Math.PI / 180) * 90} ${-232 + Math.sin(a * Math.PI / 180) * 50} ${11 + Math.cos(a * Math.PI / 180) * 110} ${-212 + Math.sin(a * Math.PI / 180) * 60}`, fill: "none", stroke: "#a9b8a8", "stroke-width": 9, "stroke-linecap": "round" }, p));
    }
    for (let mx = -300; mx < 3300; mx += 300) el("rect", { x: mx, y: 70, width: 14, height: 600, fill: "#d6cfc2" }, gl);
    el("rect", { x: -300, y: 360, width: 3600, height: 8, fill: "#d6cfc2" }, gl);
    el("rect", { x: -300, y: 56, width: 3600, height: 18, fill: "#cfc7b9" }, gl);
    // ceiling light lines
    for (let i = 0; i < 4; i++) el("rect", { x: -300, y: 6 + i * 14, width: 3600, height: 4, rx: 2, fill: "#fbf7ef", opacity: 0.9 - i * 0.18 }, L.far);
    // floor
    el("rect", { x: -400, y: 670, width: 3800, height: 800, fill: RS.linear(svg, `${id}-floor`, [[0, "#ddd4c5"], [1, "#cfc4b2"]]) }, L.far);
    el("rect", { x: -400, y: 670, width: 3800, height: 120, fill: RS.linear(svg, `${id}-refl`, [[0, "#f3efe6", 0.6], [1, "#f3efe6", 0]]) }, L.far);
    for (let fx = -400; fx < 3400; fx += 260) el("path", { d: `M${fx} 670 L${fx - 340} 1400`, stroke: "#c8bca9", "stroke-width": 2, opacity: 0.5 }, L.far);

    // arrivals sign (generic pictograms + the localized word), soft petrol
    const sign = el("g", { transform: `translate(${o.signX ?? 1500} 300)` }, L.mid);
    el("rect", { x: -10, y: -240, width: 8, height: 240, fill: "#9aa4a3" }, sign);
    el("rect", { x: 412, y: -240, width: 8, height: 240, fill: "#9aa4a3" }, sign);
    el("rect", { width: 420, height: 96, rx: 10, fill: "#0e4f55" }, sign);
    RS.ui.icon(sign, "plane", 24, 24, 48, "#ffffff", 2.2);
    const st = el("text", { x: 210, y: 62, "text-anchor": "middle", class: o.rtl ? "rs-head-ar" : "rs-head", "font-size": 38, "font-weight": 600, fill: "#ffffff" }, sign);
    st.textContent = o.hall || "Arrivals";
    RS.ui.icon(sign, "car", 352, 26, 44, "#a9ddd6", 2.2);
    // a few soft, out-of-focus travellers far back (no faces)
    const blur = el("filter", { id: `${id}-blur`, x: "-20%", y: "-20%", width: "140%", height: "140%" }, RS.defs(svg));
    el("feGaussianBlur", { stdDeviation: 7 }, blur);
    const crowd = el("g", { filter: `url(#${id}-blur)`, opacity: 0.55 }, L.mid);
    [[300, "#8fa3a4"], [760, "#c9a497"], [1180, "#7f8f86"], [2350, "#b8a58f"], [2750, "#8fa3a4"]].forEach(([cx, c], i) => {
      const s = 0.8 + (i % 2) * 0.12;
      const f = el("g", { transform: `translate(${cx} 430) scale(${s})` }, crowd);
      el("circle", { cx: 0, cy: 0, r: 26, fill: "#8a7466" }, f);
      el("path", { d: "M-46 40 C-40 20 40 20 46 40 L52 230 L-52 230 Z", fill: c }, f);
      el("rect", { x: -40, y: 226, width: 30, height: 120, fill: "#5f6467" }, f);
      el("rect", { x: 10, y: 226, width: 30, height: 120, fill: "#5f6467" }, f);
    });
    L.sign = sign;
    return L;
  };

  /** Back seat of a car, window to screen-right, the city sliding past. Returns layers plus {outside, frame}. */
  RS.env.car = function (svg, parent, o = {}) {
    const L = RS.layers(svg, parent);
    const id = o.id || "car";
    el("rect", { x: -200, y: -200, width: 2400, height: 1500, fill: RS.linear(svg, `${id}-int`, [[0, "#5d5550"], [1, "#3e3834"]]) }, L.far);
    // window opening with the passing city (outside is its own group so it can scroll)
    const cp = el("clipPath", { id: `${id}-win` }, RS.defs(svg));
    const winD = "M980 150 C1100 120 1700 110 1880 160 L1960 620 L960 640 C940 480 940 300 980 150 Z";
    el("path", { d: winD }, cp);
    const win = el("g", { "clip-path": `url(#${id}-win)` }, L.far);
    el("rect", { x: 900, y: 80, width: 1100, height: 600, fill: RS.linear(svg, `${id}-sky`, [[0, "#f3dcc0"], [0.6, "#f6e8d2"], [1, "#e9dcc6"]]) }, win);
    const outside = el("g", {}, win);
    const rnd = RS.prng(77);
    // Nile + far bank skyline (slowest), palms (faster) — speeds handled by the scene
    const far = el("g", {}, outside), near = el("g", {}, outside);
    let x = 600;
    while (x < 6000) {
      const w = 70 + rnd() * 160, h = 50 + rnd() * 120;
      el("rect", { x, y: 470 - h, width: w, height: h, fill: "#d8c2aa", opacity: 0.85 }, far);
      if (rnd() < 0.15) el("rect", { x: x + w / 2 - 6, y: 470 - h - 90, width: 12, height: 90, fill: "#d8c2aa" }, far);
      x += w + 10;
    }
    el("rect", { x: 600, y: 470, width: 5400, height: 70, fill: "#a9c2bf" }, far);
    el("rect", { x: 600, y: 478, width: 5400, height: 4, fill: "#f3e7d3", opacity: 0.8 }, far);
    for (let i = 0; i < 26; i++) {
      const px = 700 + i * 210 + rnd() * 80, sc = 0.9 + rnd() * 0.5;
      const p = el("g", { transform: `translate(${px} 640) scale(${sc})` }, near);
      el("path", { d: "M-6 0 C-4 -110 2 -200 8 -270 L16 -270 C12 -200 8 -110 8 0 Z", fill: "#6e7f6a" }, p);
      [-70, -30, 10, 45, 80].forEach((a) => el("path", { d: `M12 -272 C${12 + Math.cos(a * Math.PI / 180) * 60} ${-292 + Math.sin(a * Math.PI / 180) * 20} ${12 + Math.cos(a * Math.PI / 180) * 100} ${-272 + Math.sin(a * Math.PI / 180) * 60} ${12 + Math.cos(a * Math.PI / 180) * 120} ${-250 + Math.sin(a * Math.PI / 180) * 70}`, fill: "none", stroke: "#6e7f6a", "stroke-width": 11, "stroke-linecap": "round" }, p));
    }
    el("rect", { x: 600, y: 560, width: 5400, height: 120, fill: "#b5a08a" }, near); // embankment wall
    // window frame, glass sheen, door panel, seat
    el("path", { d: winD, fill: "none", stroke: "#2c2724", "stroke-width": 26, "stroke-linejoin": "round" }, L.mid);
    el("path", { d: "M1020 170 L1300 150 L1080 630 L990 630 Z", fill: "#fff", opacity: 0.07 }, L.mid);
    el("path", { d: "M900 640 L2000 610 L2000 1300 L880 1300 Z", fill: "#4a433e" }, L.mid);
    el("path", { d: "M940 700 L1960 676", stroke: "#5c544e", "stroke-width": 10, "stroke-linecap": "round" }, L.mid);
    el("path", { d: "M-100 520 C200 480 600 470 860 520 L900 1300 L-100 1300 Z", fill: RS.linear(svg, `${id}-seat`, [[0, "#6f655d"], [1, "#544b45"]]) }, L.mid);
    el("path", { d: "M60 560 C300 530 600 528 820 560", stroke: "#7d726a", "stroke-width": 6, fill: "none", opacity: 0.7 }, L.mid);
    // warm light from the window onto her
    el("path", { d: "M980 150 L1900 160 L1100 1080 L120 1080 Z", fill: RS.linear(svg, `${id}-sun`, [[0, "#ffe2b8", 0.22], [1, "#ffe2b8", 0]], 1, 0, 0, 1) }, L.light);
    L.outside = { far, near };
    return L;
  };
})();
