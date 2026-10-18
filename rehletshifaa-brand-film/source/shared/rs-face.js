/*
 * Shared 3/4 face builder (facing screen-right). Every character uses the same feature layout so one
 * expression system drives all three; identity comes from the contour, palette, proportions and overlays.
 * All coordinates live in the portrait head frame (chin ≈ 338,413; eye line ≈ 322).
 */
(function () {
  const RS = window.RS;

  RS.faceDefs = function (id, C, g) {
    const lin = (gid, x1, y1, x2, y2, stops) =>
      `<linearGradient id="${id}-${gid}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
        .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
    const soft = (gid, color, op = 1) =>
      `<radialGradient id="${id}-${gid}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
    return `
      ${lin("gFace", 262, 0, 386, 0, [[0, C.skinLit], [0.5, C.skin], [1, C.skinShade]])}
      ${lin("gHand", 0, -30, 40, 40, [[0, C.skinLit], [0.6, C.skin], [1, C.skinShade]])}
      ${lin("gNeck", 290, 0, 380, 0, [[0, C.skin], [1, C.skinDeep]])}
      ${lin("gFarShade", 358, 0, 382, 0, [[0, C.skinShade, 0], [1, C.skinDeep, 0.75]])}
      ${soft("gBlush", g.blush || "#c4705d", g.blushOp ?? 0.3)} ${soft("gSocket", C.skinDeep, 0.36)} ${soft("gShade", C.skinDeep, 0.55)}
      ${soft("gLit", C.skinGlow || "#f2d3b8", 0.6)}
      <clipPath id="${id}-eyeclip-L"><path d=""/></clipPath>
      <clipPath id="${id}-eyeclip-R"><path d=""/></clipPath>`;
  };

  /**
   * g = { contour, farShade, age 0..1, nose {dx,dy,s}, lipColors, chinY, extrasUnder, extrasOver, ear }
   */
  RS.faceMarkup = function (id, C, g) {
    const n = g.nose || { dx: 0, dy: 0, s: 1 };
    const age = g.age || 0;
    const ageLines = age > 0 ? `
      <path d="M287 337 C297 342 309 342 319 337" fill="none" stroke="${C.skinDeep}" stroke-width="1" opacity="${0.25 * age}"/>
      <path d="M334 370 C330 380 331 390 336 399" fill="none" stroke="${C.skinDeep}" stroke-width="1.5" opacity="${0.32 * age}"/>
      <path d="M369 369 C371 379 370 388 366 396" fill="none" stroke="${C.skinDeep}" stroke-width="1.1" opacity="${0.26 * age}"/>
      <path d="M276 318 C272 314 270 310 270 306 M274 326 C270 324 268 322 266 320" fill="none" stroke="${C.skinDeep}" stroke-width=".9" opacity="${0.22 * age}"/>
      <path d="M296 282 C310 279 326 279 340 282" fill="none" stroke="${C.skinDeep}" stroke-width=".9" opacity="${0.18 * age}"/>` : "";
    return `
      ${g.ear || ""}
      <path d="${g.contour}" fill="url(#${id}-gFace)"/>
      <path d="${g.farShade}" fill="url(#${id}-gFarShade)"/>
      <ellipse cx="300" cy="354" rx="22" ry="15" fill="url(#${id}-gBlush)"/>
      <ellipse cx="366" cy="352" rx="10" ry="11" fill="url(#${id}-gBlush)" opacity=".55"/>
      <ellipse cx="302" cy="314" rx="26" ry="11" fill="url(#${id}-gSocket)"/>
      <ellipse cx="359" cy="313" rx="15" ry="9" fill="url(#${id}-gSocket)"/>
      <ellipse cx="302" cy="288" rx="34" ry="14" fill="url(#${id}-gLit)" opacity=".75"/>
      <ellipse cx="290" cy="348" rx="15" ry="9" fill="url(#${id}-gLit)" opacity=".5"/>
      <ellipse cx="338" cy="404" rx="14" ry="5" fill="url(#${id}-gLit)" opacity=".45"/>
      ${ageLines}
      ${g.extrasUnder || ""}
      <g data-part="features">
        <g data-part="cheeks"><ellipse cx="304" cy="360" rx="16" ry="9" fill="url(#${id}-gBlush)" opacity=".7"/></g>
        ${["L", "R"].map((s) => `
          <path data-part="eyeCrease${s}" d="" fill="none" stroke="${C.skinDeep}" stroke-width="1.2" opacity=".5"/>
          <path data-part="eyeOpen${s}" d="" fill="${C.sclera || "#efe6dd"}"/>
          <g clip-path="url(#${id}-eyeclip-${s})">
            <g data-part="iris${s}">
              <circle r="${s === "L" ? 7.2 : 6}" fill="${C.iris}"/>
              <circle r="${s === "L" ? 5 : 4.2}" fill="#2e1d15" opacity=".5"/>
              <circle r="${s === "L" ? 3 : 2.6}" fill="#140c09"/>
              <circle cx="-2.2" cy="-2.6" r="${s === "L" ? 1.6 : 1.3}" fill="#fff" opacity=".92"/>
              <circle cx="2.4" cy="2.2" r=".8" fill="#fff" opacity=".3"/>
            </g>
            <rect x="${s === "L" ? 278 : 342}" y="${s === "L" ? 310 : 308}" width="${s === "L" ? 44 : 32}" height="6" fill="#5a3a2c" opacity=".16"/>
          </g>
          <path data-part="eyeLid${s}" d="" fill="none" stroke="${C.lash}" stroke-width="${(s === "L" ? 2.5 : 2.1) * (g.lashScale || 1)}" stroke-linecap="round"/>
        `).join("")}
        <path data-part="browL" d="" fill="${C.brow}" opacity=".92"/>
        <path data-part="browR" d="" fill="${C.brow}" opacity=".9"/>
        <g data-part="nose"><g transform="translate(${n.dx} ${n.dy}) translate(350 370) scale(${n.s}) translate(-350 -370)">
          <path d="M343 324 C347 336 352 348 357 358 C360 364 361 369 358 373 C362 366 362 358 358 348 C354 338 349 330 343 324 Z" fill="${C.skinShade}" opacity=".7"/>
          <ellipse cx="352" cy="365" rx="7" ry="6" fill="url(#${id}-gShade)" opacity=".55"/>
          <ellipse cx="349" cy="363" rx="2.6" ry="1.8" fill="${C.skinGlow || "#f4d8c0"}" opacity=".35"/>
          <path d="M334 365 C333 370 336 374 341 375" fill="none" stroke="${C.skinDeep}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
          <path d="M344 375 C347 377 351 377 354 375" fill="none" stroke="${C.nostril || "#5a3428"}" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
          <path d="M340 334 C342 342 344 350 346 356" fill="none" stroke="${C.skinGlow || "#f2d4bb"}" stroke-width="2" stroke-linecap="round" opacity=".3"/>
        </g></g>
        <path d="M349 378 C348 381 348 384 349 386 M355 378 C356 381 356 384 355 386" fill="none" stroke="${C.skinShade}" stroke-width="1.1" opacity=".4"/>
        ${g.beardUnder || ""}
        <path data-part="mouthInner" d="" fill="#4a231f"/>
        <path data-part="lipUpper" d="" fill="${C.lipUp}"/>
        <path data-part="lipLower" d="" fill="${C.lipLo}"/>
        <path data-part="mouthLine" d="" fill="none" stroke="${C.lipLine || "#5a2c26"}" stroke-width="1.4" stroke-linecap="round"/>
        <ellipse cx="350" cy="404" rx="10" ry="3" fill="${C.skinShade}" opacity=".4"/>
        <ellipse cx="349" cy="398" rx="4" ry="1.1" fill="${C.lipGlow || "#e9bba7"}" opacity=".45"/>
        ${g.beardOver || ""}
        ${g.glasses || ""}
      </g>
      ${g.extrasOver || ""}`;
  };

  RS.FACE_EYES = [
    { id: "L", cx: 300, cy: 323, w: 37, h: 15, tilt: 1.5, inner: 1 },
    { id: "R", cx: 358, cy: 321, w: 25, h: 13, tilt: 1, inner: -1 },
  ];
})();
