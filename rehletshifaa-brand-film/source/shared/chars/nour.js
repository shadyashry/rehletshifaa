/*
 * Nour — the Patient Coordinator (fictional), early 30s. Seated 3/4 rig facing screen-right.
 * Wardrobe: petrol blazer (RehletShifaa staff colour), ivory blouse, a plain ID badge. Hair: espresso, side
 * part, low bun. Key light from front-left.
 */
(function () {
  const RS = window.RS;
  const C = {
    skin: "#d6a983", skinLit: "#e8c3a2", skinShade: "#b98a66", skinDeep: "#9a6d4f", skinGlow: "#f6dcc5",
    lipUp: "#a55a55", lipLo: "#bb6f66", brow: "#2e211c", lash: "#1e1512", iris: "#3e2a1f",
    hair: "#2a1d18", hairLit: "#4c372d", hairShade: "#1a120f",
    blazer: "#0e4f55", blazerLit: "#1d6b6b", blazerShade: "#0a3a3f", blazerDeep: "#082f33",
    blouse: "#f4f0e8", blouseShade: "#d8d1c4", gold: "#c9a45c",
  };
  const HEAD_SCALE = 0.82;
  const contour = "M274 262 C298 246 342 244 364 250 C372 264 376 282 376 296 C374 304 371 312 372 320 C377 330 378 342 375 354 C372 368 366 380 358 392 C350 403 342 410 334 412 C314 411 296 402 284 386 C272 368 266 338 266 308 C266 286 268 270 274 262 Z";
  const farShade = "M362 256 C372 278 375 296 371 314 C377 332 378 350 373 366 C367 382 359 394 347 406 C355 390 361 372 363 352 C365 332 359 318 361 302 C363 286 363 270 362 256 Z";

  const def = {
    id: "nour",
    palette: C,
    joints: {
      hip: { x: 318, y: 780 }, neck: { x: 330, y: 488 },
      shoulderNear: { x: 218, y: 520 }, elbowNear: { x: 210, y: 660 }, wristNear: { x: 372, y: 700 },
      shoulderFar: { x: 424, y: 514 }, elbowFar: { x: 440, y: 648 }, wristFar: { x: 524, y: 688 },
    },
    eyes: [
      { id: "L", cx: 300, cy: 322, w: 38, h: 16, tilt: 2.5, inner: 1 },
      { id: "R", cx: 358, cy: 320, w: 26, h: 14, tilt: 2, inner: -1 },
    ],
    brows: [
      { id: "L", x1: 318, y1: 300, x2: 276, y2: 302, thick: 5.6, inner: 1 },
      { id: "R", x1: 345, y1: 299, x2: 376, y2: 299, thick: 4.6, inner: -1 },
    ],
    mouth: { cx: 350, cy: 389, wNear: 23, wFar: 14, lipUp: 6.2, lipLo: 8.4 },
    defaults: {},
    applyExtra(P, p) {
      if (P.strand) P.strand.setAttribute("transform", `rotate(${RS.f(p.headTilt * -0.6 + p.headNod * 0.3)} 372 262)`);
      if (P.badge) P.badge.setAttribute("transform", `rotate(${RS.f(-p.lean * 0.8)} 288 548)`);
    },
    build(id) {
      const hand = (side, x, y, sc = 1) => `<g transform="translate(${x} ${y}) scale(${sc})">${RS.handMarkup(id, side, C, `${id}-gHand`)}</g>`;
      const lin = (gid, x1, y1, x2, y2, stops) =>
        `<linearGradient id="${id}-${gid}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
          .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
      const ear = `
        <path d="M262 316 C252 314 246 324 248 338 C250 352 256 362 266 364 C270 350 270 330 262 316 Z" fill="${C.skinShade}"/>
        <path d="M258 324 C254 330 254 342 258 350" fill="none" stroke="${C.skinDeep}" stroke-width="2" opacity=".6"/>
        <circle cx="262" cy="364" r="3.2" fill="${C.gold}"/><circle cx="261" cy="363" r="1.1" fill="#f3dfae"/>`;
      const hairFront = `
        <g data-part="hairFront">
          <path d="M252 300 C250 262 268 230 300 216 C330 204 368 210 386 236 C394 248 396 262 392 280 C386 272 376 262 362 254 C340 246 322 244 306 246 C292 248 280 256 272 268 C266 280 262 296 262 316 C256 312 254 306 252 300 Z" fill="url(#${id}-gHair)"/>
          <path d="M300 218 C318 230 336 238 358 244 C372 248 384 258 390 270" fill="none" stroke="${C.hairLit}" stroke-width="3" stroke-linecap="round" opacity=".8"/>
          <path d="M296 222 C286 236 276 252 270 272 M312 214 C330 220 352 226 372 238" fill="none" stroke="${C.hairLit}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>
          <path d="M264 300 C266 286 272 272 282 262" fill="none" stroke="${C.hairShade}" stroke-width="2" opacity=".6"/>
          <g data-part="strand"><path d="M380 262 C384 274 384 288 380 298" fill="none" stroke="${C.hair}" stroke-width="2.2" stroke-linecap="round"/></g>
        </g>`;
      return `
      <defs>
        ${RS.faceDefs(id, C, { blush: "#c86b5b", blushOp: 0.28 })}
        ${lin("gHair", 250, 200, 400, 320, [[0, C.hairLit], [0.5, C.hair], [1, C.hairShade]])}
        ${lin("gBlazer", 190, 480, 460, 800, [[0, C.blazerLit], [0.5, C.blazer], [1, C.blazerShade]])}
        ${lin("gSleeve", 0, 500, 0, 720, [[0, C.blazerLit], [0.6, C.blazer], [1, C.blazerShade]])}
      </defs>
      <g data-part="body">
        <g data-part="armFar">
          <path d="M408 500 C434 492 456 508 458 540 C462 586 458 626 452 662 C448 678 426 680 422 664 C416 622 412 580 406 540 C404 520 400 506 408 500 Z" fill="${C.blazerDeep}"/>
          <g data-part="foreFar">
            <path d="M430 636 C462 652 496 666 524 672 C538 676 538 700 524 704 C490 704 452 690 428 674 C414 664 416 640 430 636 Z" fill="${C.blazerDeep}"/>
            <g data-part="handFar">${hand("Far", 520, 688, 0.88)}</g>
          </g>
        </g>
        <g data-part="chest">
          <g transform="translate(0 36) translate(330 452) scale(${HEAD_SCALE}) translate(-330 -452)">
            <path d="M298 392 C300 420 298 446 292 476 L372 474 C366 448 364 420 366 390 Z" fill="url(#${id}-gNeck)"/>
            <path d="M300 398 C322 420 350 420 368 404 L368 420 C350 432 320 432 300 416 Z" fill="${C.skinDeep}" opacity=".45"/>
          </g>
          <path d="M202 530 C214 500 252 482 290 466 C318 460 350 458 374 462 C396 474 414 490 424 510 C440 552 446 612 442 672 C440 716 434 756 430 800 L196 800 C190 750 188 700 190 650 C192 600 192 562 202 530 Z" fill="url(#${id}-gBlazer)"/>
          <!-- blouse V and collar -->
          <path d="M292 466 C316 476 348 476 374 462 C368 510 356 556 338 600 C320 556 304 512 292 466 Z" fill="${C.blouse}"/>
          <path d="M300 488 C312 520 326 556 338 592" fill="none" stroke="${C.blouseShade}" stroke-width="3" opacity=".8"/>
          <!-- lapels -->
          <path d="M288 466 C294 516 312 560 330 610 L316 640 C298 600 280 552 268 494 Z" fill="${C.blazerLit}"/>
          <path d="M376 462 C374 516 360 566 344 612 L358 640 C374 600 390 552 400 486 Z" fill="${C.blazerShade}"/>
          <path d="M330 610 C334 660 336 720 338 800" fill="none" stroke="${C.blazerDeep}" stroke-width="2.5" opacity=".7"/>
          <circle cx="340" cy="690" r="5" fill="${C.blazerDeep}"/>
          <path d="M240 600 C250 650 252 710 248 780 M410 560 C418 620 420 690 418 780" fill="none" stroke="${C.blazerShade}" stroke-width="3" opacity=".6"/>
          <!-- ID badge (no text: generic staff card) -->
          <g data-part="badge">
            <path d="M296 492 C292 512 290 530 288 548" fill="none" stroke="${C.blazerDeep}" stroke-width="1.6"/>
            <rect x="274" y="546" width="30" height="40" rx="3" fill="#fbfaf6" stroke="${C.blouseShade}"/>
            <rect x="274" y="546" width="30" height="9" rx="3" fill="#5fb3ac"/>
            <circle cx="289" cy="566" r="6" fill="#d9e8e6"/>
            <rect x="281" y="575" width="16" height="2.4" rx="1.2" fill="#a3afb1"/>
          </g>
        </g>
        <g data-part="head">
          <g transform="translate(0 36) translate(330 452) scale(${HEAD_SCALE}) translate(-330 -452)">
            <!-- hair back + low bun -->
            <path d="M252 300 C246 244 284 206 330 204 C374 204 400 232 400 266 C400 282 394 292 382 296 C360 300 320 300 300 300 C296 360 290 400 270 410 C250 396 244 350 252 300 Z" fill="${C.hairShade}"/>
            <ellipse cx="242" cy="392" rx="34" ry="28" fill="url(#${id}-gHair)"/>
            <path d="M216 386 C230 372 252 370 268 382 M222 402 C238 394 256 396 268 404" fill="none" stroke="${C.hairLit}" stroke-width="2" opacity=".6"/>
            <!-- neck -->
            ${RS.faceMarkup(id, C, { contour, farShade, age: 0, nose: { dx: 0, dy: -1, s: 0.94 }, ear, extrasOver: hairFront, lashScale: 1.15 })}
          </g>
        </g>
        <g data-part="armNear">
          <path d="M196 514 C220 500 248 510 250 540 C252 586 246 630 240 668 C236 688 206 690 200 670 C194 628 190 580 190 544 C190 528 190 520 196 514 Z" fill="url(#${id}-gSleeve)"/>
          <g data-part="foreNear">
            <path d="M206 644 C242 664 296 680 354 686 C372 688 376 714 360 718 C304 718 252 704 212 690 C192 680 190 650 206 644 Z" fill="url(#${id}-gSleeve)"/>
            <g data-part="handNear">${hand("Near", 354, 702, 0.94)}</g>
            <path d="M338 684 C352 684 362 690 366 702 C366 712 360 718 348 718 C340 708 336 696 338 684 Z" fill="${C.blouse}"/>
            <path d="M330 684 C340 684 346 696 344 718 L334 718 C330 706 328 694 330 684 Z" fill="${C.blazer}"/>
          </g>
        </g>
      </g>`;
    },
  };
  RS.CHARS = RS.CHARS || {};
  RS.CHARS.nour = def;
})();
