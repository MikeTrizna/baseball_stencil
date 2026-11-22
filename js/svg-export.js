/**
 * 1:1 physical-scale SVG exporter for cutting machines (Cricut, Silhouette, laser cutters)
 * and vector editors (Inkscape, Illustrator).
 *
 * Supports:
 * - Reusable vertical stencil strip tile (12x12", 12x24", 8.5x11") with top/bottom alignment ghost stitches
 * - Single Full-Height Vertical Stripe SVG (for full ceiling-to-baseboard curved or straight stencil)
 * - Full-Wall 1:1 SVG
 */

import {
  computeDesignGeometry,
  buildReusableStencilTile,
  buildSingleFullHeightStripe,
} from './geometry.js';

function fmt(n) {
  return Number(n).toFixed(4).replace(/\.?0+$/, '');
}

function polyToPathD(poly) {
  if (!poly || poly.length < 3) return '';
  let d = `M ${fmt(poly[0][0])} ${fmt(poly[0][1])}`;
  for (let i = 1; i < poly.length; i++) {
    d += ` L ${fmt(poly[i][0])} ${fmt(poly[i][1])}`;
  }
  return `${d} Z`;
}

function polylineToPathD(pts) {
  if (!pts || pts.length < 2) return '';
  let d = `M ${fmt(pts[0][0])} ${fmt(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${fmt(pts[i][0])} ${fmt(pts[i][1])}`;
  }
  return d;
}

/**
 * Generate a 1:1 Single Full-Height Vertical Stripe SVG (ideal for plotter/large cutting or Inkscape).
 */
export function generateSingleStripeSVG(config, options = {}) {
  const { outlineOnly = false } = options;
  const stripe = buildSingleFullHeightStripe(config, 1.25);
  const stitchColor = config.stitch.color || '#C8102E';
  const fillAttr = outlineOnly ? 'none' : stitchColor;
  const strokeAttr = outlineOnly ? stitchColor : 'none';
  const strokeWidthAttr = outlineOnly ? '0.02' : '0';

  const stitchPaths = [];
  for (const pair of stripe.pairs) {
    stitchPaths.push(`    <path d="${polyToPathD(pair.leftPoly)}" />`);
    stitchPaths.push(`    <path d="${polyToPathD(pair.rightPoly)}" />`);
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(stripe.widthIn)}in" height="${fmt(stripe.heightIn)}in" viewBox="0 0 ${fmt(stripe.widthIn)} ${fmt(stripe.heightIn)}">`,
    `  <title>Baseball Stitch Single Full-Height Stripe (${fmt(stripe.widthIn)}in x ${fmt(stripe.heightIn)}in)</title>`,
    `  <g id="stencil-border" fill="none" stroke="#666666" stroke-width="0.025">`,
    `    <rect x="0.1" y="0.1" width="${fmt(stripe.widthIn - 0.2)}" height="${fmt(stripe.heightIn - 0.2)}" />`,
    `  </g>`,
    `  <g id="seam-centerline-guide" fill="none" stroke="#999999" stroke-width="0.02" stroke-dasharray="0.3 0.2">`,
    `    <path d="${polylineToPathD(stripe.centerlinePts)}" />`,
    `  </g>`,
    `  <g id="stitch-cutouts" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${strokeWidthAttr}">`,
    ...stitchPaths,
    `  </g>`,
    `</svg>`,
  ];

  return {
    svg: parts.join('\n'),
    widthIn: stripe.widthIn,
    heightIn: stripe.heightIn,
    stitchPairs: stripe.pairs.length,
  };
}

/**
 * Generate a 1:1 full-wall SVG document string.
 */
export function generateFullWallSVG(config, options = {}) {
  const {
    includeWallFrame = true,
    includeCenterline = false,
    outlineOnly = false,
  } = options;

  const geom = computeDesignGeometry(config);
  const W = config.wall.widthIn;
  const H = config.wall.heightIn;
  const stitchColor = config.stitch.color || '#C8102E';

  const fillAttr = outlineOnly ? 'none' : stitchColor;
  const strokeAttr = outlineOnly ? stitchColor : 'none';
  const strokeWidthAttr = outlineOnly ? '0.02' : '0';

  const stitchPaths = [];
  for (const pair of geom.pairs) {
    stitchPaths.push(`    <path d="${polyToPathD(pair.leftPoly)}" />`);
    stitchPaths.push(`    <path d="${polyToPathD(pair.rightPoly)}" />`);
  }

  const laceHoleEls = [];
  if (config.stitch.showLaceHoles) {
    const r = Math.max(0.03, config.stitch.widthIn * 0.28);
    for (const pair of geom.pairs) {
      for (const [hx, hy] of pair.holes) {
        laceHoleEls.push(`    <circle cx="${fmt(hx)}" cy="${fmt(hy)}" r="${fmt(r)}" />`);
      }
    }
  }

  const seamLineEls = [];
  if (includeCenterline || config.stitch.showSeamLine) {
    for (const seam of geom.seams) {
      seamLineEls.push(`    <path d="${polylineToPathD(seam.points)}" />`);
    }
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(W)}in" height="${fmt(H)}in" viewBox="0 0 ${fmt(W)} ${fmt(H)}">`,
    `  <title>Baseball Stitch Stencil - Full Wall (${fmt(W)}in x ${fmt(H)}in)</title>`,
    `  <desc>Exact 1:1 scale in inches. ${geom.stats.stripeCount} vertical stripes, ${geom.stats.pairCount} stitch pairs.</desc>`,
  ];

  if (includeWallFrame) {
    parts.push(`  <g id="wall-boundary" fill="none" stroke="#999999" stroke-width="0.04" stroke-dasharray="0.5 0.5">`);
    parts.push(`    <rect x="0" y="0" width="${fmt(W)}" height="${fmt(H)}" />`);
    parts.push(`  </g>`);
  }

  if (seamLineEls.length) {
    parts.push(`  <g id="seam-centerline-guide" fill="none" stroke="#888888" stroke-width="0.025" stroke-dasharray="0.3 0.2">`);
    parts.push(...seamLineEls);
    parts.push(`  </g>`);
  }

  parts.push(`  <g id="stitch-cutouts" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${strokeWidthAttr}">`);
  parts.push(...stitchPaths);
  parts.push(`  </g>`);

  if (laceHoleEls.length) {
    parts.push(`  <g id="lace-holes" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${strokeWidthAttr}">`);
    parts.push(...laceHoleEls);
    parts.push(`  </g>`);
  }

  parts.push(`</svg>`);
  return {
    svg: parts.join('\n'),
    widthIn: W,
    heightIn: H,
    stitchPairs: geom.stats.pairCount,
  };
}

/**
 * Generate a 1:1 vertical reusable stencil tile SVG sized for a cutting mat (e.g., 12x12", 12x24", or 8.5x11").
 */
export function generateReusableTileSVG(config, options = {}) {
  const {
    sheetWidthIn = 11.5,
    sheetHeightIn = 11.5,
    marginIn = 0.65,
    outlineOnly = false,
  } = options;

  const tile = buildReusableStencilTile(config, sheetWidthIn, sheetHeightIn, marginIn);
  const stitchColor = config.stitch.color || '#C8102E';
  const fillAttr = outlineOnly ? 'none' : stitchColor;
  const strokeAttr = outlineOnly ? stitchColor : 'none';
  const strokeWidthAttr = outlineOnly ? '0.02' : '0';

  const activePaths = [];
  for (const pair of tile.activePairs) {
    activePaths.push(`    <path d="${polyToPathD(pair.leftPoly)}" />`);
    activePaths.push(`    <path d="${polyToPathD(pair.rightPoly)}" />`);
  }

  const ghostPaths = [];
  for (const pair of tile.ghostPairs) {
    ghostPaths.push(`    <path d="${polyToPathD(pair.leftPoly)}" />`);
    ghostPaths.push(`    <path d="${polyToPathD(pair.rightPoly)}" />`);
  }

  const parts = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(sheetWidthIn)}in" height="${fmt(sheetHeightIn)}in" viewBox="0 0 ${fmt(sheetWidthIn)} ${fmt(sheetHeightIn)}">`,
    `  <title>Baseball Stitch Vertical Reusable Stencil (${fmt(sheetWidthIn)}in x ${fmt(sheetHeightIn)}in)</title>`,
    `  <desc>${tile.note}</desc>`,
    `  <g id="stencil-outer-sheet" fill="none" stroke="#333333" stroke-width="0.025">`,
    `    <rect x="0.15" y="0.15" width="${fmt(sheetWidthIn - 0.3)}" height="${fmt(sheetHeightIn - 0.3)}" rx="0.2" />`,
    `  </g>`,
    `  <g id="seam-centerline-guide" fill="none" stroke="#999999" stroke-width="0.02" stroke-dasharray="0.25 0.2">`,
    `    <path d="${polylineToPathD(tile.centerlinePts)}" />`,
    `  </g>`,
    `  <g id="alignment-ghost-stitches" fill="none" stroke="#2563EB" stroke-width="0.025" stroke-dasharray="0.14 0.1">`,
    ...ghostPaths,
    `  </g>`,
    `  <g id="stitch-cutouts" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${strokeWidthAttr}">`,
    ...activePaths,
    `  </g>`,
    `</svg>`,
  ];

  return {
    svg: parts.join('\n'),
    widthIn: sheetWidthIn,
    heightIn: sheetHeightIn,
    activeCount: tile.activeCount,
    shiftDistIn: tile.shiftDistIn,
    note: tile.note,
  };
}
