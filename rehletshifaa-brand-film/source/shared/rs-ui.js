/*
 * Website-styled UI kit (SVG). Mirrors the live RehletShifaa interface: paper surfaces, warm hairlines,
 * petrol actions, Alexandria headings, Plus Jakarta Sans / Cairo body, the coral "received" stamp and
 * lucide-style line icons. Every component is RTL-aware: pass ctx {w, rtl} and x is measured from the
 * reading-start edge.
 */
(function () {
  const RS = window.RS;
  const el = RS.el;
  const T = RS.T;

  const ui = (RS.ui = {});

  // fonts: classes defined in film.css (@font-face from the site's own font files)
  ui.font = (rtl, kind) => (rtl ? (kind === "head" ? "rs-head-ar" : "rs-body-ar") : kind === "head" ? "rs-head" : "rs-body");

  /** Position helper: x from the reading-start edge, w = element width, W = container width. */
  ui.X = (ctx, x, w = 0) => (ctx.rtl ? ctx.w - x - w : x);

  ui.text = function (g, ctx, x, y, str, o = {}) {
    const anchor = o.anchor || "start";
    const ax = anchor === "middle" ? x : ctx.rtl ? ctx.w - x : x;
    const node = el("text", {
      x: ax, y, class: ui.font(ctx.rtl, o.kind || "body"), "font-size": o.size || 14, "font-weight": o.weight || 400,
      fill: o.fill || T.ink, "text-anchor": anchor === "middle" ? "middle" : "start", direction: ctx.rtl ? "rtl" : "ltr",
      "letter-spacing": o.ls || 0, opacity: o.opacity,
    }, g);
    node.textContent = str;
    return node;
  };

  /** Wrapped paragraph: splits on spaces to fit maxW using a canvas measure (deterministic, no reflow). */
  const measureCanvas = document.createElement("canvas").getContext("2d");
  ui.wrap = function (g, ctx, x, y, str, o = {}) {
    const size = o.size || 14, lh = o.lh || size * 1.45, maxW = o.maxW || 200;
    const fam = ctx.rtl ? "Cairo, Alexandria, sans-serif" : o.kind === "head" ? "Alexandria, sans-serif" : "'Plus Jakarta Sans', sans-serif";
    measureCanvas.font = `${o.weight || 400} ${size}px ${fam}`;
    const words = str.split(" ");
    const lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? cur + " " + w : w;
      if (measureCanvas.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);
    const grp = el("g", {}, g);
    lines.forEach((ln, i) => ui.text(grp, ctx, x, y + i * lh, ln, o));
    grp.lineCount = lines.length;
    return grp;
  };

  ui.rect = (g, ctx, x, y, w, h, o = {}) =>
    el("rect", { x: ui.X(ctx, x, w), y, width: w, height: h, rx: o.r ?? 10, fill: o.fill || T.white, stroke: o.stroke, "stroke-width": o.sw || 1.2, opacity: o.opacity }, g);

  ui.button = function (g, ctx, x, y, w, h, label, o = {}) {
    const b = el("g", { class: "ui-button" }, g);
    const primary = o.variant !== "secondary";
    ui.rect(b, ctx, x, y, w, h, { r: o.r ?? 8, fill: primary ? T.petrol600 : T.white, stroke: primary ? null : T.heading, sw: 1.4 });
    ui.text(b, ctx, x + w / 2 - (ctx.rtl ? 0 : 0), y + h / 2 + (o.size || 14) * 0.36, label, { anchor: "middle", size: o.size || 14, weight: 600, fill: primary ? T.white : T.heading, kind: "body" })
      .setAttribute("x", ui.X(ctx, x, w) + w / 2);
    return b;
  };

  ui.check = function (g, cx, cy, r, o = {}) {
    const c = el("g", { class: "ui-check" }, g);
    el("circle", { cx, cy, r, fill: o.fill || T.petrol600 }, c);
    el("path", { d: `M${cx - r * 0.42} ${cy + r * 0.02} L${cx - r * 0.1} ${cy + r * 0.34} L${cx + r * 0.45} ${cy - r * 0.3}`, fill: "none", stroke: "#fff", "stroke-width": r * 0.26, "stroke-linecap": "round", "stroke-linejoin": "round" }, c);
    return c;
  };

  ui.checkbox = function (g, ctx, x, y, size, label, o = {}) {
    const c = el("g", { class: "ui-checkbox" }, g);
    const box = ui.rect(c, ctx, x, y, size, size, { r: 4, fill: T.white, stroke: T.lineStrong, sw: 1.5 });
    const tick = el("g", { class: "tick", opacity: 0 }, c);
    const bx = ui.X(ctx, x, size);
    el("rect", { x: bx, y, width: size, height: size, rx: 4, fill: T.petrol600 }, tick);
    el("path", { d: `M${bx + size * 0.22} ${y + size * 0.52} L${bx + size * 0.42} ${y + size * 0.72} L${bx + size * 0.78} ${y + size * 0.3}`, fill: "none", stroke: "#fff", "stroke-width": size * 0.14, "stroke-linecap": "round", "stroke-linejoin": "round" }, tick);
    const txt = ui.wrap(c, ctx, x + size + 10, y + size * 0.78, label, { size: o.size || 12, maxW: o.maxW || 180, fill: T.ink, lh: (o.size || 12) * 1.4 });
    return { g: c, tick, box, txt };
  };

  /** Coral "RECEIVED" stamp from the site's case-file card. */
  ui.stamp = function (g, x, y, label, o = {}) {
    const s = el("g", { class: "ui-stamp", transform: `translate(${x} ${y}) rotate(${o.rot ?? -8})` }, g);
    const w = o.w || 96, h = o.h || 34;
    el("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 4, fill: "#fff", "fill-opacity": 0.85, stroke: T.coral, "stroke-width": 2.4 }, s);
    const t = el("text", { x: 0, y: 5, "text-anchor": "middle", class: o.rtl ? "rs-head-ar" : "rs-head", "font-size": o.size || 14, "font-weight": 700, fill: "#c4553b", "letter-spacing": o.rtl ? 0 : 1.6 }, s);
    t.textContent = label;
    return s;
  };

  // lucide-style icons on a 24-unit grid
  const ICON = {
    file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
    image: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M21 15l-5-5L5 21",
    camera: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z M12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
    upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12",
    lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
    user: "M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10 M20 21a8 8 0 0 0-16 0",
    steth: "M11 2v2 M5 2v2 M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1 M8 15a6 6 0 0 0 12 0v-3 M20 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
    clipboard: "M9 2h6v4H9z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 12l2 2 4-4",
    signpost: "M12 3v18 M5 6h12l3 3-3 3H5z",
    heart: "M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z",
    plane: "M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
    bed: "M2 4v16 M2 8h18a2 2 0 0 1 2 2v10 M2 17h20 M6 8v9",
    passport: "M5 2h14v20H5z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M9 17h6",
    car: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2 M7 17a2 2 0 1 0 0 .01 M17 17a2 2 0 1 0 0 .01 M9 17h6",
    calendar: "M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M16 2v4 M8 2v4 M3 10h18 M8 15l2 2 4-4",
    message: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
    menu: "M4 6h16 M4 12h16 M4 18h16",
    bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0",
    video: "M16 13l5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11 M2 6h14v12H2z",
  };
  ui.icon = function (g, name, x, y, size, color, sw = 2) {
    const ic = el("g", { transform: `translate(${x} ${y}) scale(${size / 24})`, class: "ui-icon" }, g);
    el("path", { d: ICON[name], fill: "none", stroke: color || T.petrol600, "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" }, ic);
    return ic;
  };
  ui.iconWell = function (g, ctx, name, x, y, size, o = {}) {
    const w = el("g", { class: "ui-iconwell" }, g);
    ui.rect(w, ctx, x, y, size, size, { r: size * 0.25, fill: o.fill || T.paperDeep });
    ui.icon(w, name, ui.X(ctx, x, size) + size * 0.2, y + size * 0.2, size * 0.6, o.color || T.petrol600, o.sw || 2);
    return w;
  };

  /** Logo lockup exactly as the site renders it (icon + Alexandria wordmark + coral dot over the ı). */
  ui.logo = function (g, x, y, size, o = {}) {
    const lg = el("g", { class: "ui-logo", transform: `translate(${x} ${y})` }, g);
    const img = el("image", { href: "assets/brand/rehletshifaa-icon.png", x: 0, y: 0, width: size, height: size }, lg);
    const ws = size * 0.62, as = size * 0.44;
    const tx = size * 1.06;
    const ink = o.reversed ? "#ffffff" : T.logoInk, acc = o.reversed ? "#a9ddd6" : T.logoAccent, dot = o.reversed ? "#f3b3a3" : T.logoDot;
    const t1 = el("text", { x: tx, y: size * 0.56, class: "rs-logo", "font-size": ws, "font-weight": 500, fill: ink, "letter-spacing": -ws * 0.02, direction: "ltr" }, lg);
    t1.textContent = "Rehlet";
    const t1b = el("tspan", { "font-weight": 700, fill: acc }, t1);
    t1b.textContent = "Shıfaa";
    // signature dot over the dotless ı — position measured from the font at build time
    measureCanvas.font = `500 ${ws}px Alexandria`;
    const lead = measureCanvas.measureText("Rehlet").width;
    measureCanvas.font = `700 ${ws}px Alexandria`;
    const sh = measureCanvas.measureText("Sh").width, iw = measureCanvas.measureText("ı").width;
    el("circle", { cx: tx + lead + sh + iw / 2 - ws * 0.02 * 2, cy: size * 0.56 - ws * 0.74, r: ws * 0.112, fill: dot, class: "logo-dot" }, lg);
    if (o.arabic !== false) {
      const t2 = el("text", { x: tx + lead + sh + measureCanvas.measureText("ıfaa").width, y: size * 0.56 + as * 1.15, class: "rs-logo-ar", "font-size": as, "font-weight": 500, fill: ink, "text-anchor": "start", direction: "rtl" }, lg);
      t2.textContent = "رحلة ";
      const t2b = el("tspan", { "font-weight": 700, fill: acc }, t2);
      t2b.textContent = "شفاء";
    }
    lg.w = tx + lead + sh + measureCanvas.measureText("ıfaa").width; // lockup width, for end-aligned (RTL) placement
    return lg;
  };

  /** Site header bar (paper, logo, menu). */
  ui.siteHeader = function (g, ctx, h = 44) {
    const hd = el("g", { class: "ui-header" }, g);
    el("rect", { x: 0, y: 0, width: ctx.w, height: h, fill: T.paper }, hd);
    el("rect", { x: 0, y: h - 1, width: ctx.w, height: 1, fill: T.line }, hd);
    const s = h * 0.6;
    const lg = ui.logo(hd, 12, (h - s) / 2, s);
    if (ctx.rtl) lg.setAttribute("transform", `translate(${ctx.w - 14 - lg.w} ${(h - s) / 2})`);
    ui.icon(hd, "menu", ctx.rtl ? 12 : ctx.w - 12 - 20, h / 2 - 10, 20, T.heading, 2);
    return hd;
  };

  /** File row with icon well, name and a check that can be revealed. */
  ui.fileRow = function (g, ctx, x, y, w, h, icon, label) {
    const r = el("g", { class: "ui-file" }, g);
    ui.rect(r, ctx, x, y, w, h, { r: 8, fill: T.white, stroke: T.line, sw: 1.2 });
    ui.iconWell(r, ctx, icon, x + 8, y + (h - h * 0.62) / 2, h * 0.62, {});
    ui.text(r, ctx, x + 8 + h * 0.62 + 10, y + h / 2 + 4.5, label, { size: Math.min(13, h * 0.32), weight: 600, fill: T.heading });
    const ck = ui.check(r, ui.X(ctx, x + w - 22, 0) + (ctx.rtl ? 0 : 0), y + h / 2, h * 0.22, {});
    ck.setAttribute("opacity", 0);
    const bar = el("rect", { x: ui.X(ctx, x + 8 + h * 0.62 + 10, w - h * 0.62 - 60), y: y + h - 7, width: w - h * 0.62 - 60, height: 2.5, rx: 1.2, fill: T.petrol600, class: "bar" }, r);
    gsap.set(bar, { scaleX: 0, transformOrigin: ctx.rtl ? "100% 50%" : "0% 50%" });
    return { g: r, check: ck, bar };
  };

  /** Chat bubble (WhatsApp-like rhythm, site palette). side: "out" (sent) | "in" (received). */
  ui.bubble = function (g, ctx, x, y, w, str, o = {}) {
    const b = el("g", { class: "ui-bubble" }, g);
    const size = o.size || 13;
    const tmp = el("g", {}, b);
    const para = ui.wrap(tmp, ctx, x + 14, y + size + 10, str, { size, maxW: w - 28, fill: o.side === "out" ? T.white : T.heading, lh: size * 1.42 });
    const h = para.lineCount * size * 1.42 + 18;
    const bg = ui.rect(b, ctx, x, y, w, h, { r: 14, fill: o.side === "out" ? T.petrol600 : T.white, stroke: o.side === "out" ? null : T.line });
    b.insertBefore(bg, tmp);
    b.h = h;
    return b;
  };
})();
