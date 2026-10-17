/*
 * Amal — the patient (fictional), mid-50s. Seated 3/4 rig facing screen-right; mirror with scaleX(-1).
 * Wardrobe: dusty-rose hijab, oat long cardigan, slate-teal top. Key light from front-left (window).
 * Frame: hip ≈ (318,780), neck pivot (330,452). Head is drawn at portrait scale and reduced to adult
 * proportion (≈ 1 : 2.3 head-to-shoulder width) by a static wrapper.
 */
(function () {
  const RS = window.RS;
  const C = {
    skin: "#cf9f7c", skinLit: "#e2b996", skinShade: "#b2815f", skinDeep: "#93654a",
    lipUp: "#99574f", lipLo: "#ad6b60", brow: "#45322a", lash: "#2a1c17", iris: "#4b3022",
    scarf: "#b38f87", scarfLit: "#caa89f", scarfShade: "#97766f", scarfDeep: "#7a5d57",
    knit: "#d8c9b2", knitLit: "#e7dbc8", knitShade: "#bba98f", knitDeep: "#9d8c74",
    top: "#344b50", topShade: "#25383c",
  };
  const HEAD_SCALE = 0.84;

  const def = {
    id: "amal",
    palette: C,
    handScale: 1,
    joints: {
      hip: { x: 318, y: 780 }, neck: { x: 330, y: 474 },
      shoulderNear: { x: 212, y: 520 }, elbowNear: { x: 204, y: 664 }, wristNear: { x: 372, y: 704 },
      shoulderFar: { x: 430, y: 514 }, elbowFar: { x: 446, y: 650 }, wristFar: { x: 528, y: 690 },
    },
    eyes: [
      { id: "L", cx: 300, cy: 323, w: 37, h: 15, tilt: 1.5, inner: 1 },
      { id: "R", cx: 358, cy: 321, w: 25, h: 13, tilt: 1, inner: -1 },
    ],
    brows: [
      { id: "L", x1: 318, y1: 302, x2: 277, y2: 305, thick: 5.2, inner: 1 },
      { id: "R", x1: 345, y1: 301, x2: 375, y2: 302, thick: 4.2, inner: -1 },
    ],
    mouth: { cx: 351, cy: 391, wNear: 24, wFar: 14, lipUp: 5.6, lipLo: 7.8 },
    defaults: {},
    applyExtra(P, p) {
      if (P.scarfTail) P.scarfTail.setAttribute("transform", `rotate(${RS.f(-p.lean * 0.4 + p.breath * 0.3)} 236 470)`);
      if (P.drape) P.drape.setAttribute("transform", `translate(${RS.f(p.headTurn * 0.4)} ${RS.f(p.headNod * 0.15)})`);
    },
    build(id) {
      const lin = (gid, x1, y1, x2, y2, stops) =>
        `<linearGradient id="${id}-${gid}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
          .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join("")}</linearGradient>`;
      const soft = (gid, color, op = 1) =>
        `<radialGradient id="${id}-${gid}"><stop offset="0" stop-color="${color}" stop-opacity="${op}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;
      const hand = (side, x, y, sc = 1) =>
        `<g transform="translate(${x} ${y}) scale(${sc})">${RS.handMarkup(id, side, C, `${id}-gHand`)}</g>`;
      return `
      <defs>
        ${lin("gFace", 262, 0, 386, 0, [[0, C.skinLit], [0.5, C.skin], [1, C.skinShade]])}
        ${lin("gHand", 0, -30, 40, 40, [[0, C.skinLit], [0.6, C.skin], [1, C.skinShade]])}
        ${lin("gFarShade", 360, 0, 382, 0, [[0, C.skinShade, 0], [1, C.skinDeep, 0.75]])}
        ${soft("gBlush", "#c4705d", 0.3)} ${soft("gSocket", C.skinDeep, 0.36)} ${soft("gShade", C.skinDeep, 0.55)}
        ${soft("gLit", "#f2d3b8", 0.6)}
        ${lin("gScarf", 220, 190, 420, 520, [[0, C.scarfLit], [0.5, C.scarf], [1, C.scarfShade]])}
        ${lin("gDrape", 210, 450, 440, 580, [[0, C.scarfLit], [0.55, C.scarf], [1, C.scarfShade]])}
        ${lin("gKnit", 190, 480, 460, 800, [[0, C.knitLit], [0.55, C.knit], [1, C.knitShade]])}
        ${lin("gSleeve", 0, 500, 0, 720, [[0, C.knitLit], [0.6, C.knit], [1, C.knitShade]])}
        <clipPath id="${id}-eyeclip-L"><path d=""/></clipPath>
        <clipPath id="${id}-eyeclip-R"><path d=""/></clipPath>
      </defs>

      <g data-part="body">
        <!-- far arm (behind torso) -->
        <g data-part="armFar">
          <path d="M414 500 C440 492 462 508 464 540 C468 586 464 626 458 662 C454 678 432 680 428 664 C422 622 418 580 412 540 C410 520 406 506 414 500 Z" fill="${C.knitShade}"/>
          <g data-part="foreFar">
            <path d="M436 638 C468 654 500 668 528 674 C542 678 542 702 528 706 C494 706 456 692 434 676 C420 666 422 642 436 638 Z" fill="${C.knitShade}"/>
            <g data-part="handFar">${hand("Far", 526, 690, 0.9)}</g>
          </g>
        </g>

        <!-- torso -->
        <g data-part="chest">
          <path d="M196 528 C214 500 256 486 300 482 C346 478 404 486 432 508 C450 550 456 610 452 672 C450 716 444 756 440 800 L190 800 C184 750 182 700 184 650 C186 600 186 560 196 528 Z" fill="url(#${id}-gKnit)"/>
          <path d="M342 500 C360 506 378 520 386 540 C394 590 398 650 396 720 L402 800 L350 800 C352 730 350 650 346 580 C344 548 340 516 342 500 Z" fill="${C.top}"/>
          <path d="M374 540 C382 600 386 670 386 740" fill="none" stroke="${C.topShade}" stroke-width="5" opacity=".7"/>
          <path d="M340 500 C338 570 340 680 346 800" fill="none" stroke="${C.knitDeep}" stroke-width="3" opacity=".5"/>
          <path d="M390 528 C400 590 406 680 406 800" fill="none" stroke="${C.knitShade}" stroke-width="10" opacity=".75"/>
          <path d="M246 590 C256 630 260 680 256 750 M296 620 C300 660 302 710 298 780 M214 650 C222 690 226 730 222 790" fill="none" stroke="${C.knitShade}" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>
          <!-- hijab drape resting on the shoulders -->
          <g data-part="drape">
            <path d="M258 448 C226 464 196 490 184 528 C200 562 262 580 316 578 C366 578 412 562 436 532 C426 500 404 474 386 452 C360 470 300 472 258 448 Z" fill="url(#${id}-gDrape)"/>
            <path d="M226 520 C258 548 312 556 364 546" fill="none" stroke="${C.scarfShade}" stroke-width="3" stroke-linecap="round" opacity=".7"/>
            <path d="M250 490 C282 512 330 516 372 504" fill="none" stroke="${C.scarfShade}" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
            <path d="M212 520 C228 540 256 552 290 558" fill="none" stroke="${C.scarfLit}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
          </g>
        </g>

        <!-- head -->
        <g data-part="head">
          <g transform="translate(0 22) translate(330 452) scale(${HEAD_SCALE}) translate(-330 -452)">
            <g data-part="scarfTail">
              
            </g>
            <!-- scarf back volume -->
            <path d="M246 272 C248 226 288 198 334 198 C380 198 408 228 406 270 C404 310 398 344 396 382 C406 418 404 452 388 476 C360 494 300 494 270 482 C244 470 230 440 230 400 C230 360 240 320 246 272 Z" fill="url(#${id}-gScarf)"/>
            <ellipse cx="312" cy="236" rx="64" ry="24" fill="url(#${id}-gLit)" opacity=".55"/>

            <!-- face -->
            <path d="M276 258 C300 248 344 246 366 252 C373 266 377 282 377 296 C375 304 372 312 373 320 C378 330 379 342 377 354 C375 368 370 381 362 393 C354 404 345 411 336 413 C316 413 296 404 284 388 C272 370 266 340 266 310 C266 288 270 268 276 258 Z" fill="url(#${id}-gFace)"/>
            <path d="M362 258 C372 280 376 298 372 316 C378 334 379 352 374 368 C368 384 360 396 348 408 C356 392 362 374 364 354 C366 334 360 320 362 304 C364 288 364 272 362 258 Z" fill="url(#${id}-gFarShade)"/>
            <ellipse cx="300" cy="354" rx="22" ry="15" fill="url(#${id}-gBlush)"/>
            <ellipse cx="366" cy="352" rx="10" ry="11" fill="url(#${id}-gBlush)" opacity=".55"/>
            <ellipse cx="302" cy="314" rx="26" ry="11" fill="url(#${id}-gSocket)"/>
            <ellipse cx="359" cy="313" rx="15" ry="9" fill="url(#${id}-gSocket)"/>
            <ellipse cx="302" cy="288" rx="34" ry="14" fill="url(#${id}-gLit)" opacity=".75"/>
            <ellipse cx="290" cy="348" rx="15" ry="9" fill="url(#${id}-gLit)" opacity=".5"/>
            <ellipse cx="338" cy="404" rx="14" ry="5" fill="url(#${id}-gLit)" opacity=".45"/>
            <ellipse cx="342" cy="412" rx="26" ry="7" fill="url(#${id}-gShade)" opacity=".45"/>
            <!-- age: soft under-eye, nasolabial and marionette hints -->
            <path d="M287 337 C297 342 309 342 319 337" fill="none" stroke="${C.skinDeep}" stroke-width="1" opacity=".25"/>
            <path d="M334 370 C330 380 331 390 336 399" fill="none" stroke="${C.skinDeep}" stroke-width="1.5" opacity=".3"/>
            <path d="M369 369 C371 379 370 388 366 396" fill="none" stroke="${C.skinDeep}" stroke-width="1.1" opacity=".26"/>
            <path d="M333 401 C333 405 334 408 336 410" fill="none" stroke="${C.skinDeep}" stroke-width="1" opacity=".2"/>

            <g data-part="features">
              <g data-part="cheeks"><ellipse cx="304" cy="360" rx="16" ry="9" fill="url(#${id}-gBlush)" opacity=".7"/></g>
              ${["L", "R"].map((s) => `
                <path data-part="eyeCrease${s}" d="" fill="none" stroke="${C.skinDeep}" stroke-width="1.2" opacity=".5"/>
                <path data-part="eyeOpen${s}" d="" fill="#efe6dd"/>
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
                <path data-part="eyeLid${s}" d="" fill="none" stroke="${C.lash}" stroke-width="${s === "L" ? 2.5 : 2.1}" stroke-linecap="round"/>
              `).join("")}
              <path data-part="browL" d="" fill="${C.brow}" opacity=".92"/>
              <path data-part="browR" d="" fill="${C.brow}" opacity=".9"/>
              <!-- nose: shadow-led, no outline -->
              <g data-part="nose">
                <path d="M343 324 C347 336 352 348 357 358 C360 364 361 369 358 373 C362 366 362 358 358 348 C354 338 349 330 343 324 Z" fill="${C.skinShade}" opacity=".7"/>
                <ellipse cx="352" cy="365" rx="7" ry="6" fill="url(#${id}-gShade)" opacity=".55"/>
                <ellipse cx="349" cy="363" rx="2.6" ry="1.8" fill="#f4d8c0" opacity=".35"/>
                <path d="M334 365 C333 370 336 374 341 375" fill="none" stroke="${C.skinDeep}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>
                <path d="M344 375 C347 377 351 377 354 375" fill="none" stroke="#5a3428" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
                <path d="M340 334 C342 342 344 350 346 356" fill="none" stroke="#f2d4bb" stroke-width="2" stroke-linecap="round" opacity=".3"/>
              </g>
              <path d="M349 378 C348 381 348 384 349 386 M355 378 C356 381 356 384 355 386" fill="none" stroke="${C.skinShade}" stroke-width="1.1" opacity=".4"/>
              <path data-part="mouthInner" d="" fill="#4a231f"/>
              <path data-part="lipUpper" d="" fill="${C.lipUp}"/>
              <path data-part="lipLower" d="" fill="${C.lipLo}"/>
              <path data-part="mouthLine" d="" fill="none" stroke="#5a2c26" stroke-width="1.4" stroke-linecap="round"/>
              <ellipse cx="350" cy="404" rx="10" ry="3" fill="${C.skinShade}" opacity=".4"/>
              <ellipse cx="349" cy="398" rx="4" ry="1.1" fill="#e9bba7" opacity=".45"/>
            </g>

            <!-- scarf front: frames the face and wraps under the chin -->
            <path d="M248 272 C258 238 300 224 334 226 C360 228 378 240 386 256 C372 251 352 247 330 247 C306 247 286 252 276 258 C268 270 264 290 264 312 C264 344 270 372 284 390 C298 408 318 418 338 418 C356 418 372 408 382 394 C386 376 386 356 384 336 C390 360 396 392 392 420 C384 454 358 476 330 482 C300 486 270 474 254 448 C238 418 236 372 238 330 C240 306 242 288 248 272 Z" fill="url(#${id}-gScarf)"/>
            <path d="M277 260 C268 282 265 312 267 340 C269 368 279 390 297 406" fill="none" stroke="${C.scarfLit}" stroke-width="2.4" opacity=".55"/>
            <path d="M281 262 C273 284 270 312 272 338" fill="none" stroke="${C.scarfDeep}" stroke-width="2" opacity=".25"/>
            <path d="M298 420 C318 434 352 434 376 416" fill="none" stroke="${C.scarfShade}" stroke-width="4" stroke-linecap="round" opacity=".75"/>
            <path d="M262 442 C282 468 318 478 352 470" fill="none" stroke="${C.scarfShade}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
            <path d="M262 250 C284 234 320 228 352 234" fill="none" stroke="${C.scarfLit}" stroke-width="5" stroke-linecap="round" opacity=".85"/>
            <path d="M388 300 C396 340 398 380 390 420" fill="none" stroke="${C.scarfDeep}" stroke-width="3" opacity=".45"/>
          </g>
        </g>

        <!-- near arm (in front) -->
        <g data-part="armNear">
          <path d="M190 514 C214 500 242 510 244 540 C246 586 240 630 234 670 C230 690 200 692 194 672 C188 630 184 580 184 544 C184 528 184 520 190 514 Z" fill="url(#${id}-gSleeve)"/>
          <path d="M206 560 C210 600 212 630 210 660" fill="none" stroke="${C.knitShade}" stroke-width="2.5" opacity=".55"/>
          <g data-part="foreNear">
            <path d="M200 646 C236 668 290 684 350 690 C368 692 372 718 356 722 C300 722 246 708 206 692 C186 682 184 652 200 646 Z" fill="url(#${id}-gSleeve)"/>
            <path d="M336 690 C342 698 344 710 342 720" fill="none" stroke="${C.knitShade}" stroke-width="3" opacity=".7"/>
            <g data-part="handNear">${hand("Near", 352, 705, 1)}</g>
            <!-- cuff over the wrist -->
            <path d="M338 688 C352 688 362 692 366 704 C366 714 360 722 348 722 C340 712 336 700 338 688 Z" fill="${C.knit}"/>
          </g>
        </g>
      </g>`;
    },
  };
  RS.CHARS = RS.CHARS || {};
  RS.CHARS.amal = def;
})();
