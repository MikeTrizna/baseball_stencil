/**
 * Pure mathematical geometry engine for the Baseball Stitch Stencil Designer.
 * Focused on repeating vertical baseball-stitch stripes (straight or curved like a baseball).
 * All coordinates and dimensions are in real-world INCHES.
 * Wall coordinate system: (0, 0) at top-left, (wallWidth, wallHeight) at bottom-right.
 */

const DEG_TO_RAD = Math.PI / 180;

export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function dist(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Compute X positions of repeating vertical stripes across the wall.
 */
export function computeStripePositions(wallWidthIn, stripeSpacingIn, offsetXIn = 0) {
  const spacing = clamp(stripeSpacingIn ?? 12, 3, 72);
  const center = wallWidthIn / 2 + (offsetXIn || 0);
  const halfSpan = wallWidthIn / 2 + spacing;
  const maxIndex = Math.ceil(halfSpan / spacing) + 1;

  const positions = [];
  for (let k = -maxIndex; k <= maxIndex; k++) {
    const x = center + k * spacing;
    // Keep stripes that could have stitches visible on the wall (with margin for curve amplitude)
    if (x >= -spacing && x <= wallWidthIn + spacing) {
      positions.push({ index: k, baseX: x });
    }
  }
  return positions;
}

/**
 * Evaluate horizontal curve displacement dx(y) for a curved vertical stripe.
 * u = (y - topY) / spanH in [0, 1]
 */
function evalStripeCurveX(baseX, u, amplitudeIn, cycles, directionSign, phaseRad = 0) {
  return baseX + directionSign * amplitudeIn * Math.sin(u * Math.PI * 2 * cycles + phaseRad);
}

/**
 * Build seam polylines for repeating vertical stripes (straight or curved baseball stripes).
 * Returns array of { id, stripeIndex, baseX, curveSign, points: [[x, y], ...], flipDir: boolean }
 */
export function generateSeamPolylines(config) {
  const { wall, layout } = config;
  const W = wall.widthIn;
  const H = wall.heightIn;
  const topY = wall.clipStitchesToTrim ? (wall.crownIn || 0) : 0;
  const bottomY = wall.clipStitchesToTrim ? H - (wall.baseboardIn || 0) : H;
  const spanH = Math.max(12, bottomY - topY);

  const isCurved = layout.type === 'curved-stripes';
  const spacing = clamp(layout.stripeSpacingIn ?? 12, 3, 72);
  const offsetX = layout.offsetX || 0;
  const amp = isCurved ? clamp(layout.curveAmplitudeIn ?? 2.0, 0, 12) : 0;
  const cycles = isCurved ? clamp(layout.curveCycles ?? 0.5, 0.25, 4.0) : 0.5;
  const opposing = isCurved && (layout.curveStyle || 'opposing') === 'opposing';
  const phaseRad = ((layout.curvePhaseDeg || 0) * DEG_TO_RAD);

  const baseFlip = Boolean(layout.flipDirection);
  const altDir = Boolean(layout.alternateStitchDirection);

  const stripes = computeStripePositions(W, spacing, offsetX);
  const seams = [];
  const samples = isCurved ? Math.max(90, Math.round(cycles * 120)) : 24;

  for (const st of stripes) {
    // Reject stripes completely off-wall even accounting for curve amplitude + stitch width
    if (st.baseX + amp + 4 < 0 || st.baseX - amp - 4 > W) continue;

    const isOdd = Math.abs(st.index) % 2 === 1;
    const curveSign = opposing && isOdd ? -1 : 1;
    const flipDir = altDir && isOdd ? !baseFlip : baseFlip;

    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const u = i / samples;
      const y = topY + u * spanH;
      const x = isCurved
        ? evalStripeCurveX(st.baseX, u, amp, cycles, curveSign, phaseRad)
        : st.baseX;
      pts.push([x, y]);
    }

    seams.push({
      id: `stripe-${st.index}`,
      stripeIndex: st.index,
      baseX: st.baseX,
      curveSign,
      points: pts,
      flipDir,
    });
  }

  return seams;
}

/**
 * Compute cumulative arc-length table for a polyline.
 */
export function buildArcLengthTable(points) {
  const cumLen = new Float64Array(points.length);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += dist(points[i - 1], points[i]);
    cumLen[i] = total;
  }
  return { cumLen, totalLength: total };
}

/**
 * Sample position, unit tangent T, and unit left normal N at arc-length s.
 */
export function samplePolylineAt(points, cumLen, s) {
  const n = points.length;
  if (n < 2) {
    return { pos: points[0] || [0, 0], tangent: [0, 1], normal: [-1, 0] };
  }
  const total = cumLen[n - 1];
  const target = clamp(s, 0, total);

  let lo = 0;
  let hi = n - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cumLen[mid] <= target) lo = mid;
    else hi = mid;
  }

  const segStart = cumLen[lo];
  const segEnd = cumLen[hi];
  const segLen = Math.max(1e-9, segEnd - segStart);
  const t = clamp((target - segStart) / segLen, 0, 1);

  const pA = points[lo];
  const pB = points[hi];
  const pos = [pA[0] + (pB[0] - pA[0]) * t, pA[1] + (pB[1] - pA[1]) * t];

  const idx0 = Math.max(0, lo - 1);
  const idx1 = Math.min(n - 1, hi + 1);
  let tx = points[idx1][0] - points[idx0][0];
  let ty = points[idx1][1] - points[idx0][1];
  const tLen = Math.hypot(tx, ty) || 1;
  tx /= tLen;
  ty /= tLen;

  return {
    pos,
    tangent: [tx, ty],
    normal: [-ty, tx],
  };
}

/**
 * Generate a closed polygon contour for a single stitch leg.
 * Compact vertex count keeps 1,500+ repeating wallpaper stitches smooth at 60 FPS
 * while staying crisp at 1:1 SVG/PDF print resolution.
 */
export function buildStitchLegPolygon(innerTip, axisU, axisV, length, width, tipStyle, bowRatio) {
  const L = Math.max(0.12, length);
  const W = Math.max(0.04, Math.min(width, L * 0.92));
  const halfW = W / 2;
  const bowAmp = clamp(bowRatio || 0, -0.35, 0.35) * L;

  const toWorld = (uDist, vDist) => [
    innerTip[0] + axisU[0] * uDist + axisV[0] * vDist,
    innerTip[1] + axisU[1] * uDist + axisV[1] * vDist,
  ];

  const bowOffset = (u) => 4 * bowAmp * u * (1 - u);
  const bowSlope = (u) => (4 * bowAmp * (1 - 2 * u)) / L;

  if (tipStyle === 'square' && Math.abs(bowAmp) < 1e-4) {
    return [
      toWorld(0, -halfW),
      toWorld(L, -halfW),
      toWorld(L, halfW),
      toWorld(0, halfW),
    ];
  }

  const steps = 8;
  const capSegs = 4;
  const topEdge = [];
  const bottomEdge = [];

  if (tipStyle === 'square') {
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const uDist = u * L;
      const cV = bowOffset(u);
      const slope = bowSlope(u);
      const normLen = Math.hypot(-slope, 1);
      const nvU = -slope / normLen;
      const nvV = 1 / normLen;
      topEdge.push(toWorld(uDist + nvU * halfW, cV + nvV * halfW));
      bottomEdge.push(toWorld(uDist - nvU * halfW, cV - nvV * halfW));
    }
    return [...topEdge, ...bottomEdge.reverse()];
  }

  if (tipStyle === 'rounded') {
    const r = Math.min(halfW, L * 0.45);
    const uMin = r / L;
    const uMax = 1 - r / L;

    for (let i = 0; i <= steps; i++) {
      const u = uMin + (uMax - uMin) * (i / steps);
      const uDist = u * L;
      const cV = bowOffset(u);
      const slope = bowSlope(u);
      const normLen = Math.hypot(-slope, 1);
      const nvU = -slope / normLen;
      const nvV = 1 / normLen;
      topEdge.push(toWorld(uDist + nvU * r, cV + nvV * r));
      bottomEdge.push(toWorld(uDist - nvU * r, cV - nvV * r));
    }

    const outerCap = [];
    {
      const cU = uMax * L;
      const cV = bowOffset(uMax);
      const baseAngle = Math.atan2(bowSlope(uMax), 1);
      for (let i = 1; i < capSegs; i++) {
        const a = baseAngle + Math.PI / 2 - (Math.PI * i) / capSegs;
        outerCap.push(toWorld(cU + Math.cos(a) * r, cV + Math.sin(a) * r));
      }
    }

    const innerCap = [];
    {
      const cU = uMin * L;
      const cV = bowOffset(uMin);
      const baseAngle = Math.atan2(bowSlope(uMin), 1);
      for (let i = 1; i < capSegs; i++) {
        const a = baseAngle - Math.PI / 2 - (Math.PI * i) / capSegs;
        innerCap.push(toWorld(cU + Math.cos(a) * r, cV + Math.sin(a) * r));
      }
    }

    return [...topEdge, ...outerCap, ...bottomEdge.reverse(), ...innerCap];
  }

  // 'tapered': classic hand-stitched baseball thread look
  const tipRadius = Math.max(0.015, halfW * 0.28);
  const uStart = clamp(tipRadius / L, 0.02, 0.2);
  const uEnd = 1 - uStart;

  const halfWidthAt = (u) => {
    const s = Math.sin(clamp(u, 0, 1) * Math.PI);
    return halfW * (0.28 + 0.72 * Math.pow(Math.max(0, s), 0.62));
  };

  for (let i = 0; i <= steps; i++) {
    const u = uStart + (uEnd - uStart) * (i / steps);
    const uDist = u * L;
    const cV = bowOffset(u);
    const hw = halfWidthAt(u);
    const slope = bowSlope(u);
    const normLen = Math.hypot(-slope, 1);
    const nvU = -slope / normLen;
    const nvV = 1 / normLen;
    topEdge.push(toWorld(uDist + nvU * hw, cV + nvV * hw));
    bottomEdge.push(toWorld(uDist - nvU * hw, cV - nvV * hw));
  }

  const outerTip = [];
  {
    const cU = uEnd * L;
    const cV = bowOffset(uEnd);
    const r = halfWidthAt(uEnd);
    const baseAngle = Math.atan2(bowSlope(uEnd), 1);
    for (let i = 1; i < 3; i++) {
      const a = baseAngle + Math.PI / 2 - (Math.PI * i) / 3;
      outerTip.push(toWorld(cU + Math.cos(a) * r * 1.15, cV + Math.sin(a) * r));
    }
  }

  const innerTipCap = [];
  {
    const cU = uStart * L;
    const cV = bowOffset(uStart);
    const r = halfWidthAt(uStart);
    const baseAngle = Math.atan2(bowSlope(uStart), 1);
    for (let i = 1; i < 3; i++) {
      const a = baseAngle - Math.PI / 2 - (Math.PI * i) / 3;
      innerTipCap.push(toWorld(cU + Math.cos(a) * r * 1.15, cV + Math.sin(a) * r));
    }
  }

  return [...topEdge, ...outerTip, ...bottomEdge.reverse(), ...innerTipCap];
}

export function polygonBounds(poly) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function pointToSegmentDist(p, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const wx = p[0] - a[0];
  const wy = p[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return Math.hypot(wx, wy);
  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = (yi > pt[1]) !== (yj > pt[1]) &&
      pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonMinDistance(polyA, polyB) {
  for (let i = 0; i < polyA.length; i++) {
    if (pointInPolygon(polyA[i], polyB)) return 0;
  }
  for (let i = 0; i < polyB.length; i++) {
    if (pointInPolygon(polyB[i], polyA)) return 0;
  }
  let minD = Infinity;
  for (let i = 0; i < polyA.length; i++) {
    const p = polyA[i];
    for (let j = 0; j < polyB.length; j++) {
      const d = pointToSegmentDist(p, polyB[j], polyB[(j + 1) % polyB.length]);
      if (d < minD) minD = d;
    }
  }
  for (let i = 0; i < polyB.length; i++) {
    const p = polyB[i];
    for (let j = 0; j < polyA.length; j++) {
      const d = pointToSegmentDist(p, polyA[j], polyA[(j + 1) % polyA.length]);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

function buildStitchPairAt(station, stitchCfg, flipDir, seamId, index) {
  const { pos, tangent, normal } = station;
  const dir = flipDir ? -1 : 1;
  const angleRad = clamp(stitchCfg.vAngleDeg ?? 42, 12, 75) * DEG_TO_RAD;
  const L = clamp(stitchCfg.lengthIn ?? 0.65, 0.2, 6);
  const W = clamp(stitchCfg.widthIn ?? 0.16, 0.05, 1.5);
  const gap = clamp(stitchCfg.centerGapIn ?? 0.12, 0, 2.0);
  const tipStyle = stitchCfg.tipStyle || 'tapered';
  const bow = stitchCfg.bow ?? 0.06;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const longHalf = (L * cosA) * 0.5;

  const innerLeft = [
    pos[0] + dir * longHalf * tangent[0] + (gap / 2) * normal[0],
    pos[1] + dir * longHalf * tangent[1] + (gap / 2) * normal[1],
  ];
  const innerRight = [
    pos[0] + dir * longHalf * tangent[0] - (gap / 2) * normal[0],
    pos[1] + dir * longHalf * tangent[1] - (gap / 2) * normal[1],
  ];

  const uLeft = [
    -dir * cosA * tangent[0] + sinA * normal[0],
    -dir * cosA * tangent[1] + sinA * normal[1],
  ];
  const uRight = [
    -dir * cosA * tangent[0] - sinA * normal[0],
    -dir * cosA * tangent[1] - sinA * normal[1],
  ];

  let vLeft = [-uLeft[1], uLeft[0]];
  if (vLeft[0] * dir * tangent[0] + vLeft[1] * dir * tangent[1] < 0) {
    vLeft = [-vLeft[0], -vLeft[1]];
  }
  let vRight = [-uRight[1], uRight[0]];
  if (vRight[0] * dir * tangent[0] + vRight[1] * dir * tangent[1] < 0) {
    vRight = [-vRight[0], -vRight[1]];
  }

  const leftPoly = buildStitchLegPolygon(innerLeft, uLeft, vLeft, L, W, tipStyle, bow);
  const rightPoly = buildStitchLegPolygon(innerRight, uRight, vRight, L, W, tipStyle, bow);

  const outerLeft = [innerLeft[0] + uLeft[0] * L, innerLeft[1] + uLeft[1] * L];
  const outerRight = [innerRight[0] + uRight[0] * L, innerRight[1] + uRight[1] * L];

  return {
    seamId,
    index,
    stationPos: pos,
    tangent,
    normal,
    leftPoly,
    rightPoly,
    leftBounds: polygonBounds(leftPoly),
    rightBounds: polygonBounds(rightPoly),
    holes: [outerLeft, outerRight],
  };
}

/**
 * Main entry point: compute full design geometry from app config.
 */
export function computeDesignGeometry(config) {
  const { wall, stitch } = config;
  const W = wall.widthIn;
  const H = wall.heightIn;
  const baseboardH = wall.baseboardIn || 0;
  const crownH = wall.crownIn || 0;
  const clipToTrim = Boolean(wall.clipStitchesToTrim);

  const minWallY = clipToTrim ? crownH : 0;
  const maxWallY = clipToTrim ? H - baseboardH : H;

  const spacing = clamp(stitch.spacingIn ?? 0.65, 0.25, 8);
  const phaseOffset = stitch.phaseOffsetIn || 0;
  const rawSeams = generateSeamPolylines(config);

  const seams = [];
  const allPairs = [];
  let visibleSeamLengthIn = 0;

  for (const seam of rawSeams) {
    const { cumLen, totalLength } = buildArcLengthTable(seam.points);

    let seamVisLen = 0;
    for (let i = 1; i < seam.points.length; i++) {
      const a = seam.points[i - 1];
      const b = seam.points[i];
      const midX = (a[0] + b[0]) * 0.5;
      const midY = (a[1] + b[1]) * 0.5;
      if (midX >= 0 && midX <= W && midY >= minWallY && midY <= maxWallY) {
        seamVisLen += dist(a, b);
      }
    }

    const seamPairs = [];
    const startS = ((phaseOffset % spacing) + spacing) % spacing + spacing * 0.5;
    let idx = 0;
    for (let s = startS; s <= totalLength - spacing * 0.15; s += spacing) {
      const station = samplePolylineAt(seam.points, cumLen, s);
      const pair = buildStitchPairAt(station, stitch, seam.flipDir, seam.id, idx++);

      const inBounds = (b) => b.maxX >= 0 && b.minX <= W && b.maxY >= minWallY && b.minY <= maxWallY;
      if (inBounds(pair.leftBounds) || inBounds(pair.rightBounds)) {
        seamPairs.push(pair);
        allPairs.push(pair);
      }
    }

    if (seamPairs.length > 0) {
      visibleSeamLengthIn += seamVisLen;
      seams.push({
        id: seam.id,
        stripeIndex: seam.stripeIndex,
        baseX: seam.baseX,
        curveSign: seam.curveSign,
        points: seam.points,
        totalLength,
        visibleLength: seamVisLen,
        pairs: seamPairs,
        flipDir: seam.flipDir,
      });
    }
  }

  // Fast, accurate minimum stencil bridge width calculation on a representative stripe
  // (all repeating stripes share identical geometry/curvature magnitude)
  let minBridgeIn = Infinity;
  const repSeam = seams.find((s) => s.stripeIndex === 0) || seams[0];
  if (repSeam && repSeam.pairs.length > 0) {
    const pairs = repSeam.pairs;
    // Sample up to 60 pairs evenly across the stripe (catches peak curve bends too)
    const step = Math.max(1, Math.floor(pairs.length / 60));
    for (let i = 0; i < pairs.length; i += step) {
      const crossGap = polygonMinDistance(pairs[i].leftPoly, pairs[i].rightPoly);
      if (crossGap < minBridgeIn) minBridgeIn = crossGap;

      if (i + 1 < pairs.length) {
        const dLL = polygonMinDistance(pairs[i].leftPoly, pairs[i + 1].leftPoly);
        const dRR = polygonMinDistance(pairs[i].rightPoly, pairs[i + 1].rightPoly);
        const dLR = polygonMinDistance(pairs[i].leftPoly, pairs[i + 1].rightPoly);
        const dRL = polygonMinDistance(pairs[i].rightPoly, pairs[i + 1].leftPoly);
        const localMin = Math.min(dLL, dRR, dLR, dRL);
        if (localMin < minBridgeIn) minBridgeIn = localMin;
      }
    }
  }
  if (!Number.isFinite(minBridgeIn)) minBridgeIn = 0;

  const angleRad = (stitch.vAngleDeg ?? 42) * DEG_TO_RAD;
  const bandWidthIn = (stitch.centerGapIn ?? 0.12) + 2 * (stitch.lengthIn ?? 0.65) * Math.sin(angleRad) + (stitch.widthIn ?? 0.16);

  return {
    seams,
    pairs: allPairs,
    stats: {
      pairCount: allPairs.length,
      legCount: allPairs.length * 2,
      stripeCount: seams.length,
      perStripePairs: repSeam ? repSeam.pairs.length : 0,
      visibleSeamLengthIn,
      minBridgeIn,
      bandWidthIn,
    },
  };
}

/**
 * Extract a single centered full-height vertical stripe translated so its bounding box
 * sits cleanly at x >= padIn, y >= 0. Ideal for printing ONE reusable full-height stripe
 * template (~9 Letter pages stacked vertically) and flipping it left-to-right for opposing stripes!
 */
export function buildSingleFullHeightStripe(config, padXIn = 1.25) {
  const geom = computeDesignGeometry(config);
  const repSeam = geom.seams.find((s) => s.stripeIndex === 0) || geom.seams[0];
  if (!repSeam) {
    return { widthIn: 4, heightIn: config.wall.heightIn, pairs: [], centerlinePts: [], isCurved: false };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of repSeam.points) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  for (const pair of repSeam.pairs) {
    for (const b of [pair.leftBounds, pair.rightBounds]) {
      if (b.minX < minX) minX = b.minX;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxY > maxY) maxY = b.maxY;
    }
  }

  const shiftX = padXIn - minX;
  const shiftY = -minY;
  const shiftPt = ([x, y]) => [x + shiftX, y + shiftY];
  const shiftPoly = (poly) => poly.map(shiftPt);

  const pairs = repSeam.pairs.map((p) => {
    const leftPoly = shiftPoly(p.leftPoly);
    const rightPoly = shiftPoly(p.rightPoly);
    return {
      ...p,
      stationPos: shiftPt(p.stationPos),
      leftPoly,
      rightPoly,
      leftBounds: polygonBounds(leftPoly),
      rightBounds: polygonBounds(rightPoly),
      holes: p.holes.map(shiftPt),
    };
  });

  const centerlinePts = repSeam.points.map(shiftPt);
  const widthIn = (maxX - minX) + 2 * padXIn;
  const heightIn = Math.max(12, maxY - minY);

  return {
    widthIn,
    heightIn,
    pairs,
    centerlinePts,
    isCurved: config.layout.type === 'curved-stripes',
  };
}

/**
 * Generate a reusable VERTICAL stencil strip sized to fit inside (sheetW x sheetH) inches.
 * Includes active cutout stitches + 1 dashed blue alignment ghost stitch at TOP and BOTTOM
 * so the painter paints from ceiling down, aligns the top ghost over the last painted stitch, and repeats!
 */
export function buildReusableStencilTile(config, sheetWidthIn, sheetHeightIn, marginIn = 0.65) {
  const { stitch, layout, wall } = config;
  const spacing = clamp(stitch.spacingIn ?? 0.65, 0.25, 8);
  const availH = Math.max(4, sheetHeightIn - 2 * marginIn);

  const isCurved = layout.type === 'curved-stripes' && (layout.curveAmplitudeIn || 0) > 0.05;
  const topY = wall.clipStitchesToTrim ? (wall.crownIn || 0) : 0;
  const bottomY = wall.clipStitchesToTrim ? wall.heightIn - (wall.baseboardIn || 0) : wall.heightIn;
  const wallSpanH = Math.max(12, bottomY - topY);

  const amp = isCurved ? clamp(layout.curveAmplitudeIn ?? 2.0, 0, Math.max(0.5, (sheetWidthIn - 2 * marginIn) * 0.42)) : 0;
  const cycles = isCurved ? clamp(layout.curveCycles ?? 0.5, 0.25, 4.0) : 0.5;
  const phaseRad = (layout.curvePhaseDeg || 0) * DEG_TO_RAD;

  // Build centerline vertically down the center of the sheet
  const centerX = sheetWidthIn / 2;
  const yStart = marginIn;
  const yEnd = sheetHeightIn - marginIn;

  const rawPts = [];
  const samples = 120;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const y = yStart + t * (yEnd - yStart);
    const uWall = (y - yStart) / wallSpanH;
    const x = isCurved
      ? evalStripeCurveX(centerX, uWall, amp, cycles, 1, phaseRad)
      : centerX;
    rawPts.push([x, y]);
  }

  const { cumLen, totalLength } = buildArcLengthTable(rawPts);
  const angleRad = (stitch.vAngleDeg ?? 42) * DEG_TO_RAD;
  const stitchLongExtent = (stitch.lengthIn ?? 0.65) * Math.cos(angleRad) + (stitch.widthIn ?? 0.16);
  const usableLen = Math.max(spacing * 2, totalLength - stitchLongExtent);
  const totalSlots = Math.max(3, Math.floor(usableLen / spacing) + 1);

  const usedLen = (totalSlots - 1) * spacing;
  const startS = (totalLength - usedLen) / 2;

  const activePairs = [];
  const ghostPairs = [];
  for (let i = 0; i < totalSlots; i++) {
    const s = startS + i * spacing;
    const station = samplePolylineAt(rawPts, cumLen, s);
    const pair = buildStitchPairAt(station, stitch, Boolean(layout.flipDirection), 'tile', i);
    if (i === 0 || i === totalSlots - 1) {
      ghostPairs.push(pair);
    } else {
      activePairs.push(pair);
    }
  }

  const shiftDistIn = activePairs.length * spacing;

  return {
    sheetWidthIn,
    sheetHeightIn,
    marginIn,
    isCurved,
    activePairs,
    ghostPairs,
    centerlinePts: rawPts,
    shiftDistIn,
    activeCount: activePairs.length,
    note: isCurved
      ? `Top ${availH.toFixed(1)}" segment of curved stripe. For an exact full ceiling-to-floor curve, choose "Single Full-Height Vertical Stripe" export.`
      : `Vertical reusable stencil strip (${activePairs.length} stitches). Align top dashed blue stitch over your last painted stitch and advance ${shiftDistIn.toFixed(2)}" down the wall.`,
  };
}
