/*
 * The Medical Consultant (fictional), around 50. Seated 3/4 rig facing screen-right (mirror to face Amal).
 * Wardrobe: white coat over a pale-blue shirt, pen in pocket — competence from activity, not props.
 * Salt-and-pepper hair and short beard, thin dark glasses.
 */
(function () {
  const RS = window.RS;
  const C = {
    skin: "#c38f6c", skinLit: "#d8aa88", skinShade: "#a3724f", skinDeep: "#82573d", skinGlow: "#ebc6a8",
    lipUp: "#8d5649", lipLo: "#a26658", lipLine: "#4e2a22", lipGlow: "#d9a894", brow: "#3b3431", lash: "#211a17", iris: "#3a2a20",
    hair: "#4a4441", hairLit: "#8f8a85", hairGrey: "#a7a29c", hairShade: "#2f2a28",
    coat: "#f6f5f1", coatShade: "#dedbd3", coatDeep: "#c3bfb5", shirt: "#c9d9e4", shirtShade: "#a9bfcd",
    frame: "#2b2523",
  };
  const HEAD_SCALE = 0.85;
  const contour = "M272 256 C298 244 346 242 370 250 C378 266 382 284 381 298 C379 306 376 314 377 322 C383 334 384 348 382 362 C380 378 374 392 364 404 C354 414 342 420 332 420 C310 418 290 408 280 392 C268 374 264 342 264 310 C264 286 266 268 272 256 Z";
  const farShade = "M366 254 C376 276 380 296 376 316 C383 334 384 352 379 370 C373 388 362 402 350 414 C360 396 366 376 368 356 C370 334 364 320 366 304 C368 286 368 270 366 254 Z";

  const def = {
    id: "consultant",
    palette: C,
    joints: {
      hip: { x: 318, y: 780 }, neck: { x: 330, y: 486 },
      shoulderNear: { x: 204, y: 520 }, elbowNear: { x: 196, y: 664 }, wristNear: { x: 372, y: 706 },
      shoulderFar: { x: 436, y: 512 }, elbowFar: { x: 452, y: 650 }, wristFar: { x: 534, y: 692 },
    },
    eyes: [
      { id: "L", cx: 300, cy: 324, w: 35, h: 13, tilt: 0.5, inner: 1 },
      { id: "R", cx: 358, cy: 322, w: 24, h: 11.5, tilt: 0.5, inner: -1 },
    ],
    brows: [
      { id: "L", x1: 319, y1: 303, x2: 276, y2: 306, thick: 8, inner: 1 },
      { id: "R", x1: 346, y1: 302, x2: 377, y2: 304, thick: 6.4, inner: -1 },
    ],
    mouth: { cx: 351, cy: 392, wNear: 23, wFar: 14, lipUp: 4.2, lipLo: 6.2 },
    defaults: {},
    applyExtra(P, p) {
      if (P.glasses) P.glasses.setAttribute("transform", `translate(${RS.f(p.headTurn * 0.6)} ${RS.f(p.headNod * 0.2)})`);
    },
    build(id) {
      const hand = (side, x, y, sc = 1) => `<g transform="translate(${x} ${y}) scale(${sc})">${RS.handMarkup(id, side, C, `${id}-gHand`)}</g>`;
      const lin = (gid, x1, y1, x2, y2, stops) =>
        `<linearGradient id="${id}-${gid}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
          .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
      const ear = `
        <path d="M262 314 C250 312 244 324 246 340 C248 354 256 364 266 366 C270 350 270 330 262 314 Z" fill="${C.skinShade}"/>
        <path d="M257 322 C252 330 252 344 257 352" fill="none" stroke="${C.skinDeep}" stroke-width="2.2" opacity=".6"/>`;
      const hair = `
        <path d="M262 262 C262 230 290 210 326 208 C360 206 384 222 388 248 C380 246 370 246 362 248 C344 240 318 240 300 246 C288 250 280 258 276 268 C272 288 270 304 270 318 L262 322 C258 300 258 280 262 262 Z" fill="url(#${id}-gHair)"/>
        <path d="M262 290 C264 278 270 270 276 266 C272 284 272 304 274 324 L266 330 C262 318 260 302 262 290 Z" fill="${C.hairGrey}" opacity=".9"/>
        <path d="M300 230 C320 224 344 222 366 228 M296 240 C304 236 314 234 324 233 M338 224 C350 230 362 236 372 244" fill="none" stroke="${C.hairGrey}" stroke-width="1.4" stroke-linecap="round" opacity=".55"/>
        <path d="M290 222 C310 214 336 212 358 218 M282 236 C300 228 326 226 350 230" fill="none" stroke="${C.hairLit}" stroke-width="2" stroke-linecap="round" opacity=".55"/>`;
      const beardUnder = `
        <path d="M266 340 C272 376 290 404 312 418 C324 424 340 426 352 422 C366 416 376 402 382 384 C384 372 384 360 382 348 C376 366 368 380 360 390 C354 398 344 404 334 404 C322 404 306 394 296 382 C284 368 274 356 266 340 Z" fill="url(#${id}-gBeard)"/>
        <path d="M300 404 C314 414 330 420 344 420 M286 388 C292 398 300 406 310 412 M360 410 C368 402 374 394 378 384" fill="none" stroke="${C.hairGrey}" stroke-width="1.4" stroke-linecap="round" opacity=".45"/>
        <path d="M326 385 C334 378 344 377 352 380 C358 377 366 378 373 385 C366 387 358 387 352 386 C344 388 334 388 326 385 Z" fill="${C.hairShade}" opacity=".88"/>
        <path d="M331 382 C338 380 346 380 352 382 M356 381 C361 380 366 381 370 383" fill="none" stroke="${C.hairGrey}" stroke-width="1" opacity=".5"/>`;
      const glasses = `
        <g data-part="glasses">
          <rect x="279" y="309" width="44" height="30" rx="9" fill="#dfe9ee" fill-opacity=".14" stroke="${C.frame}" stroke-width="2.6"/>
          <rect x="343" y="308" width="31" height="28" rx="8" fill="#dfe9ee" fill-opacity=".14" stroke="${C.frame}" stroke-width="2.3"/>
          <path d="M323 320 C330 316 338 316 343 319" fill="none" stroke="${C.frame}" stroke-width="2.2"/>
          <path d="M279 318 C270 318 262 320 254 324" fill="none" stroke="${C.frame}" stroke-width="2.4"/>
          <path d="M286 334 L304 312 M292 336 L298 328" stroke="#fff" stroke-width="2.2" opacity=".28" stroke-linecap="round"/>
          <path d="M350 332 L362 312" stroke="#fff" stroke-width="2" opacity=".22" stroke-linecap="round"/>
        </g>`;
      return `
      <defs>
        ${RS.faceDefs(id, C, { blush: "#b9705c", blushOp: 0.18 })}
        ${lin("gHair", 260, 205, 390, 300, [[0, C.hairLit], [0.45, C.hair], [1, C.hairShade]])}
        ${lin("gBeard", 0, 340, 0, 420, [[0, C.hairShade, 0.08], [0.45, C.hairShade, 0.55], [1, "#2b2522", 0.92]])}
        ${lin("gCoat", 190, 480, 460, 800, [[0, "#ffffff"], [0.55, C.coat], [1, C.coatShade]])}
        ${lin("gSleeve", 0, 500, 0, 720, [[0, "#ffffff"], [0.6, C.coat], [1, C.coatShade]])}
      </defs>
      <g data-part="body">
        <g data-part="armFar">
          <path d="M414 498 C440 490 462 506 464 538 C468 584 464 624 458 662 C454 678 432 680 428 664 C422 622 418 580 412 540 C410 520 406 504 414 498 Z" fill="${C.coatDeep}"/>
          <g data-part="foreFar">
            <path d="M440 638 C472 654 506 668 534 674 C548 678 548 702 534 706 C500 706 462 692 438 676 C424 666 426 642 440 638 Z" fill="${C.coatDeep}"/>
            <g data-part="handFar">${hand("Far", 530, 692, 0.95)}</g>
          </g>
        </g>
        <g data-part="chest">
          <g transform="translate(0 34) translate(330 452) scale(${HEAD_SCALE}) translate(-330 -452)">
            <path d="M290 392 C292 420 290 446 284 476 L380 474 C374 448 372 420 374 390 Z" fill="url(#${id}-gNeck)"/>
            <path d="M298 400 C322 424 352 424 372 406 L372 424 C352 436 320 436 298 420 Z" fill="${C.skinDeep}" opacity=".5"/>
          </g>
          <path d="M194 530 C208 500 248 482 288 466 C318 458 352 456 378 460 C402 472 422 490 436 510 C454 552 460 612 456 672 C454 716 448 756 444 800 L186 800 C180 750 178 700 180 650 C182 600 182 562 194 530 Z" fill="url(#${id}-gCoat)"/>
          <path d="M290 464 C318 474 352 474 380 460 C376 520 366 572 346 640 C326 576 304 520 290 464 Z" fill="${C.shirt}"/>
          <path d="M292 466 L318 510 L334 484 Z M380 462 L358 506 L344 484 Z" fill="#dce7ee"/>
          <path d="M336 500 C338 560 342 620 346 640" fill="none" stroke="${C.shirtShade}" stroke-width="2" opacity=".8"/>
          <path d="M286 464 C292 526 312 590 334 650 L318 680 C296 620 278 556 264 486 Z" fill="#ffffff"/>
          <path d="M382 460 C380 526 366 596 350 652 L364 680 C382 620 396 556 404 482 Z" fill="${C.coatShade}"/>
          <path d="M342 656 C344 700 346 750 348 800" fill="none" stroke="${C.coatDeep}" stroke-width="2.5"/>
          <path d="M236 600 C246 650 248 710 244 780 M414 560 C422 620 424 690 422 780" fill="none" stroke="${C.coatShade}" stroke-width="3" opacity=".7"/>
          <!-- breast pocket + pen -->
          <path d="M384 590 L420 588 L420 600 L384 602 Z" fill="${C.coatShade}" opacity=".7"/>
          <rect x="398" y="566" width="5" height="30" rx="2.4" fill="#0e4f55"/>
          <rect x="398" y="566" width="5" height="6" rx="2" fill="#c9a45c"/>
        </g>
        <g data-part="head">
          <g transform="translate(0 34) translate(330 452) scale(${HEAD_SCALE}) translate(-330 -452)">
            <path d="M262 270 C258 234 288 208 328 206 C370 204 396 230 398 268 C400 300 392 330 384 350 L268 360 C258 330 262 300 262 270 Z" fill="${C.hairShade}"/>
            ${RS.faceMarkup(id, C, { contour, farShade, age: 0.7, nose: { dx: 1, dy: 1, s: 1.12 }, ear, extrasOver: hair, beardUnder, glasses, lashScale: 0.95 })}
          </g>
        </g>
        <g data-part="armNear">
          <path d="M184 514 C210 498 240 508 242 540 C244 588 238 632 232 672 C228 692 196 694 190 674 C184 632 180 582 180 546 C180 528 178 520 184 514 Z" fill="url(#${id}-gSleeve)"/>
          <path d="M200 560 C204 600 206 640 204 670" fill="none" stroke="${C.coatShade}" stroke-width="3" opacity=".7"/>
          <g data-part="foreNear">
            <path d="M198 646 C236 668 292 684 354 690 C372 692 376 718 360 722 C302 722 248 708 206 692 C186 682 184 652 198 646 Z" fill="url(#${id}-gSleeve)"/>
            <g data-part="handNear">${hand("Near", 356, 706, 1.06)}</g>
            <path d="M336 688 C350 688 360 694 364 706 C364 716 358 722 346 722 C338 712 334 700 336 688 Z" fill="${C.shirt}"/>
            <path d="M326 688 C338 688 344 700 342 722 L330 722 C326 710 324 698 326 688 Z" fill="${C.coat}"/>
          </g>
        </g>
      </g>`;
    },
  };
  RS.CHARS = RS.CHARS || {};
  RS.CHARS.consultant = def;
})();
