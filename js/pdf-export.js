/**
 * Pure JavaScript PDF 1.4 vector generator for exact 1:1 printable vertical baseball-stitch stencils.
 * Uses PDF points (1 inch = 72 pt) with exact byte-offset xref table.
 *
 * Export modes:
 * 1. Reusable 1-Page Vertical Stencil Strip (Portrait US Letter 8.5" x 11") — ideal for straight stripes
 * 2. Single Full-Height Vertical Stripe Tiled PDF (Portrait US Letter) — ~9 stacked sheets from ceiling to floor
 *    (flip horizontally left-to-right for opposing curved baseball stripes!)
 * 3. Full-Wall Tiled PDF (US Letter) — skips empty tiles automatically
 */

import {
  computeDesignGeometry,
  buildReusableStencilTile,
  buildSingleFullHeightStripe,
} from './geometry.js';

const PT_PER_IN = 72;

function fmtPt(n) {
  return Number(n).toFixed(3).replace(/\.?0+$/, '');
}

function escapePdfText(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7E]/g, ' ');
}

function hexToRgb01(hex) {
  const clean = (hex || '#C8102E').replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0');
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return [r, g, b];
}

class SimplePdfWriter {
  constructor(pageWIn, pageHIn) {
    this.pageWPt = pageWIn * PT_PER_IN;
    this.pageHPt = pageHIn * PT_PER_IN;
    this.pages = [];
  }

  addPage(commands) {
    this.pages.push(commands.join('\n'));
  }

  buildBytes() {
    const encoder = new TextEncoder();
    const chunks = [];
    let byteOffset = 0;

    const pushStr = (s) => {
      const b = encoder.encode(s);
      chunks.push(b);
      byteOffset += b.length;
    };

    const pageObjIds = this.pages.map((_, i) => 5 + i * 2);
    const totalObjs = 4 + this.pages.length * 2;
    const offsets = new Array(totalObjs + 1).fill(0);

    pushStr('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    const writeObj = (id, body) => {
      offsets[id] = byteOffset;
      pushStr(`${id} 0 obj\n${body}\nendobj\n`);
    };

    writeObj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
    writeObj(2, `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`);
    writeObj(3, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
    writeObj(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`);

    for (let i = 0; i < this.pages.length; i++) {
      const pageId = 5 + i * 2;
      const contentId = 6 + i * 2;
      const streamBytes = encoder.encode(this.pages[i]);

      writeObj(
        pageId,
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmtPt(this.pageWPt)} ${fmtPt(this.pageHPt)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
      );

      offsets[contentId] = byteOffset;
      pushStr(`${contentId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`);
      chunks.push(streamBytes);
      byteOffset += streamBytes.length;
      pushStr(`\nendstream\nendobj\n`);
    }

    const xrefOffset = byteOffset;
    pushStr(`xref\n0 ${totalObjs + 1}\n`);
    pushStr(`0000000000 65535 f \n`);
    for (let id = 1; id <= totalObjs; id++) {
      pushStr(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }

    pushStr(
      `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
    );

    const out = new Uint8Array(byteOffset);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }
}

function pdfText(xPt, yPt, text, sizePt = 10, bold = false, rgb = [0.15, 0.15, 0.18]) {
  return [
    `q`,
    `${fmtPt(rgb[0])} ${fmtPt(rgb[1])} ${fmtPt(rgb[2])} rg`,
    `BT /${bold ? 'F2' : 'F1'} ${fmtPt(sizePt)} Tf ${fmtPt(xPt)} ${fmtPt(yPt)} Td (${escapePdfText(text)}) Tj ET`,
    `Q`,
  ].join('\n');
}

function pdfPolyPath(poly, toX, toY) {
  if (!poly || poly.length < 3) return '';
  const cmds = [`${fmtPt(toX(poly[0][0]))} ${fmtPt(toY(poly[0][1]))} m`];
  for (let i = 1; i < poly.length; i++) {
    cmds.push(`${fmtPt(toX(poly[i][0]))} ${fmtPt(toY(poly[i][1]))} l`);
  }
  cmds.push('h');
  return cmds.join(' ');
}

function pdfCrosshair(xPt, yPt, sizePt = 9) {
  return [
    `${fmtPt(xPt - sizePt)} ${fmtPt(yPt)} m ${fmtPt(xPt + sizePt)} ${fmtPt(yPt)} l S`,
    `${fmtPt(xPt)} ${fmtPt(yPt - sizePt)} m ${fmtPt(xPt)} ${fmtPt(yPt + sizePt)} l S`,
  ].join('\n');
}

/**
 * Plan a Single Full-Height Vertical Stripe tiled across US Letter sheets.
 */
export function computeSingleStripePdfPlan(config, options = {}) {
  const { marginIn = 0.5, overlapIn = 0.5 } = options;
  const stripe = buildSingleFullHeightStripe(config, 1.0);
  // Pick landscape if wide curve exceeds 7.5", otherwise portrait 8.5x11
  const landscape = stripe.widthIn > 7.5;
  const pageWIn = landscape ? 11.0 : 8.5;
  const pageHIn = landscape ? 8.5 : 11.0;
  const contentW = pageWIn - 2 * marginIn;
  const contentH = pageHIn - 2 * marginIn;
  const stepX = Math.max(1, contentW - overlapIn);
  const stepY = Math.max(1, contentH - overlapIn);

  const cols = Math.max(1, Math.ceil((stripe.widthIn - overlapIn) / stepX));
  const rows = Math.max(1, Math.ceil((stripe.heightIn - overlapIn) / stepY));

  const tiles = [];
  const xCenterOffset = cols === 1 ? (contentW - stripe.widthIn) / 2 : 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileX = c * stepX - xCenterOffset;
      const tileY = r * stepY;
      const tileMaxX = tileX + contentW;
      const tileMaxY = tileY + contentH;
      const pairs = stripe.pairs.filter((p) => {
        const hit = (b) => b.maxX >= tileX && b.minX <= tileMaxX && b.maxY >= tileY && b.minY <= tileMaxY;
        return hit(p.leftBounds) || hit(p.rightBounds);
      });
      if (pairs.length > 0) {
        tiles.push({ row: r + 1, col: c + 1, tileX, tileY, contentW, contentH, pairs });
      }
    }
  }

  return {
    stripe,
    pageWIn,
    pageHIn,
    marginIn,
    overlapIn,
    contentW,
    contentH,
    rows,
    cols,
    activeTiles: tiles,
    totalPages: 1 + tiles.length,
  };
}

/**
 * Generate a Single Full-Height Vertical Stripe Tiled PDF (Cover + stacked sheets).
 */
export function generateSingleStripePDF(config, options = {}) {
  const { marginIn = 0.5, overlapIn = 0.5, inkSaver = true, includeCenterline = true } = options;
  const plan = computeSingleStripePdfPlan(config, { marginIn, overlapIn });
  const writer = new SimplePdfWriter(plan.pageWIn, plan.pageHIn);
  const pageWPt = plan.pageWIn * PT_PER_IN;
  const pageHPt = plan.pageHIn * PT_PER_IN;
  const stitchRgb = hexToRgb01(config.stitch.color || '#C8102E');

  // Page 1: Cover Sheet + 2.00" Calibration Verification Box
  {
    const cmds = [];
    const mPt = 0.6 * PT_PER_IN;
    cmds.push(pdfText(mPt, pageHPt - mPt - 14, 'SINGLE FULL-HEIGHT BASEBALL STITCH STRIPE (1:1 TEMPLATE)', 14, true, [0.1, 0.1, 0.12]));
    cmds.push(pdfText(
      mPt,
      pageHPt - mPt - 32,
      `Stripe Height: ${plan.stripe.heightIn.toFixed(1)}"  |  ${plan.stripe.pairs.length} Stitches/Stripe  |  ${plan.activeTiles.length} Sheets (+ Cover)`,
      9.5,
      false,
      [0.35, 0.35, 0.4]
    ));

    const bannerY = pageHPt - mPt - 74;
    cmds.push('q 0.98 0.94 0.94 rg 0.78 0.06 0.18 RG 1 w');
    cmds.push(`${fmtPt(mPt)} ${fmtPt(bannerY)} ${fmtPt(pageWPt - 2 * mPt)} 32 re B Q`);
    cmds.push(pdfText(mPt + 10, bannerY + 18, 'IMPORTANT: Print at "100% / Actual Size" (NEVER "Fit to Page"). Check the 2.00" square below!', 9, true, [0.72, 0.06, 0.16]));
    cmds.push(pdfText(
      mPt + 10,
      bannerY + 6,
      plan.stripe.isCurved
        ? `Tape pages R1..R${plan.rows} vertically (${overlapIn.toFixed(2)}" overlap). Flip stencil left-to-right for opposing curved stripes!`
        : `Tape pages R1..R${plan.rows} vertically (${overlapIn.toFixed(2)}" overlap). Space stripes every ${config.layout.stripeSpacingIn.toFixed(1)}" across wall.`,
      8.2,
      false,
      [0.3, 0.25, 0.25]
    ));

    // Exact 2.00" x 2.00" Calibration Box
    const calBoxSize = 2.0 * PT_PER_IN;
    const calX = pageWPt - mPt - calBoxSize;
    const calY = mPt + 24;
    cmds.push('q 0.1 0.1 0.12 RG 1.2 w');
    cmds.push(`${fmtPt(calX)} ${fmtPt(calY)} ${fmtPt(calBoxSize)} ${fmtPt(calBoxSize)} re S`);
    cmds.push('0.5 0.5 0.55 RG 0.6 w [3 3] 0 d');
    cmds.push(`${fmtPt(calX + 72)} ${fmtPt(calY)} m ${fmtPt(calX + 72)} ${fmtPt(calY + calBoxSize)} l S`);
    cmds.push(`${fmtPt(calX)} ${fmtPt(calY + 72)} m ${fmtPt(calX + calBoxSize)} ${fmtPt(calY + 72)} l S Q`);
    cmds.push(pdfText(calX + 18, calY + calBoxSize - 24, 'SCALE CHECK BOX', 9, true, [0.1, 0.1, 0.12]));
    cmds.push(pdfText(calX + 12, calY + calBoxSize - 38, 'Exact 2.00" x 2.00"', 9.5, true, [0.75, 0.06, 0.16]));
    cmds.push(pdfText(calX + 20, calY + 16, '(50.8 mm x 50.8 mm)', 8, false, [0.35, 0.35, 0.4]));

    // Specs
    const specs = [
      'Pattern Specifications',
      `Style: ${plan.stripe.isCurved ? 'Curved Baseball Stripes' : 'Straight Vertical Stripes'}`,
      `Horizontal Stripe Spacing: ${config.layout.stripeSpacingIn.toFixed(1)}" center-to-center`,
      plan.stripe.isCurved ? `Curve Amount: ${config.layout.curveAmplitudeIn.toFixed(2)}"   |   Cycles: ${config.layout.curveCycles}` : 'Curve Amount: 0" (Straight)',
      `Stitch Length: ${config.stitch.lengthIn.toFixed(2)}"   |   Width: ${config.stitch.widthIn.toFixed(2)}"`,
      `Vertical Pitch: ${config.stitch.spacingIn.toFixed(2)}"   |   V-Angle: ${Math.round(config.stitch.vAngleDeg)} deg`,
      `Center Gap: ${config.stitch.centerGapIn.toFixed(2)}"   |   Tip Style: ${config.stitch.tipStyle}`,
    ];
    specs.forEach((line, idx) => {
      cmds.push(pdfText(mPt, calY + calBoxSize - 10 - idx * 17, line, idx === 0 ? 11 : 9, idx === 0, idx === 0 ? [0.1, 0.1, 0.12] : [0.25, 0.25, 0.3]));
    });

    writer.addPage(cmds);
  }

  // Tile pages
  const mPt = plan.marginIn * PT_PER_IN;
  const contentWPt = plan.contentW * PT_PER_IN;
  const contentHPt = plan.contentH * PT_PER_IN;

  plan.activeTiles.forEach((tile, idx) => {
    const pageNum = idx + 2;
    const cmds = [];
    const toX = (wx) => (plan.marginIn + (wx - tile.tileX)) * PT_PER_IN;
    const toY = (wy) => (plan.pageHIn - plan.marginIn - (wy - tile.tileY)) * PT_PER_IN;

    cmds.push('q 0.72 0.72 0.76 RG 0.5 w [4 3] 0 d');
    cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt)} ${fmtPt(contentWPt)} ${fmtPt(contentHPt)} re S Q`);

    cmds.push('q 0.2 0.2 0.25 RG 0.75 w');
    cmds.push(pdfCrosshair(mPt, mPt, 9));
    cmds.push(pdfCrosshair(mPt + contentWPt, mPt, 9));
    cmds.push(pdfCrosshair(mPt, mPt + contentHPt, 9));
    cmds.push(pdfCrosshair(mPt + contentWPt, mPt + contentHPt, 9));
    if (tile.row > 1 && overlapIn > 0.05) {
      const ovPt = overlapIn * PT_PER_IN;
      cmds.push('0.2 0.45 0.85 RG 0.5 w [2 2] 0 d');
      cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt + contentHPt - ovPt)} m ${fmtPt(mPt + contentWPt)} ${fmtPt(mPt + contentHPt - ovPt)} l S`);
    }
    cmds.push('Q');

    cmds.push('q');
    cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt)} ${fmtPt(contentWPt)} ${fmtPt(contentHPt)} re W n`);

    if (includeCenterline || config.stitch.showSeamLine) {
      const pts = plan.stripe.centerlinePts;
      if (pts.length >= 2) {
        cmds.push('q 0.65 0.65 0.68 RG 0.6 w [5 4] 0 d');
        const seg = [`${fmtPt(toX(pts[0][0]))} ${fmtPt(toY(pts[0][1]))} m`];
        for (let i = 1; i < pts.length; i++) {
          seg.push(`${fmtPt(toX(pts[i][0]))} ${fmtPt(toY(pts[i][1]))} l`);
        }
        seg.push('S');
        cmds.push(seg.join(' '));
        cmds.push('Q');
      }
    }

    if (inkSaver) {
      cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} RG 0.9 w 1 j`);
      for (const pair of tile.pairs) {
        cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} S`);
        cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} S`);
      }
      cmds.push('Q');
    } else {
      cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} rg`);
      for (const pair of tile.pairs) {
        cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} f`);
        cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} f`);
      }
      cmds.push('Q');
    }

    cmds.push('Q');

    cmds.push(pdfText(mPt, pageHPt - mPt + 8, `Page ${pageNum} of ${plan.totalPages}   |   Stripe Section Row ${tile.row} (Col ${tile.col})   |   Y=${tile.tileY.toFixed(1)}"`, 8.5, true, [0.2, 0.2, 0.24]));
    cmds.push(pdfText(mPt, mPt - 14, `1:1 Actual Size  |  ${tile.pairs.length} stitches on sheet  |  Overlap ${overlapIn.toFixed(2)}"`, 7.5, false, [0.42, 0.42, 0.48]));

    writer.addPage(cmds);
  });

  return {
    bytes: writer.buildBytes(),
    pageCount: plan.totalPages,
    tileCount: plan.activeTiles.length,
    plan,
  };
}

/**
 * Plan a full-wall tiled PDF across US Letter sheets.
 */
export function computeTiledPdfPlan(config, options = {}) {
  const {
    orientation = 'portrait',
    marginIn = 0.5,
    overlapIn = 0.5,
    skipEmptyPages = true,
  } = options;

  const pageWIn = orientation === 'landscape' ? 11.0 : 8.5;
  const pageHIn = orientation === 'landscape' ? 8.5 : 11.0;
  const contentW = pageWIn - 2 * marginIn;
  const contentH = pageHIn - 2 * marginIn;
  const stepX = Math.max(1, contentW - overlapIn);
  const stepY = Math.max(1, contentH - overlapIn);

  const geom = computeDesignGeometry(config);
  const W = config.wall.widthIn;
  const H = config.wall.heightIn;

  const cols = Math.max(1, Math.ceil((W - overlapIn) / stepX));
  const rows = Math.max(1, Math.ceil((H - overlapIn) / stepY));

  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tileX = c * stepX;
      const tileY = r * stepY;
      const tileMaxX = tileX + contentW;
      const tileMaxY = tileY + contentH;

      const pairs = geom.pairs.filter((p) => {
        const hit = (b) => b.maxX >= tileX && b.minX <= tileMaxX && b.maxY >= tileY && b.minY <= tileMaxY;
        return hit(p.leftBounds) || hit(p.rightBounds);
      });

      if (!skipEmptyPages || pairs.length > 0) {
        tiles.push({ row: r + 1, col: c + 1, tileX, tileY, contentW, contentH, pairs });
      }
    }
  }

  return {
    pageWIn,
    pageHIn,
    marginIn,
    overlapIn,
    contentW,
    contentH,
    stepX,
    stepY,
    rows,
    cols,
    totalGridCells: rows * cols,
    activeTiles: tiles,
    totalPages: 1 + tiles.length,
    geom,
  };
}

/**
 * Generate a multi-page 1:1 tiled PDF (US Letter) for full-wall stencil assembly.
 */
export function generateTiledStencilPDF(config, options = {}) {
  const {
    orientation = 'portrait',
    marginIn = 0.5,
    overlapIn = 0.5,
    inkSaver = true,
    includeCenterline = true,
    skipEmptyPages = true,
  } = options;

  const plan = computeTiledPdfPlan(config, { orientation, marginIn, overlapIn, skipEmptyPages });
  const writer = new SimplePdfWriter(plan.pageWIn, plan.pageHIn);
  const pageWPt = plan.pageWIn * PT_PER_IN;
  const pageHPt = plan.pageHIn * PT_PER_IN;
  const stitchRgb = hexToRgb01(config.stitch.color || '#C8102E');

  // Cover Page
  {
    const cmds = [];
    const mPt = 0.6 * PT_PER_IN;
    cmds.push(pdfText(mPt, pageHPt - mPt - 14, 'BASEBALL STITCH STENCIL - FULL WALL 1:1 ASSEMBLY GUIDE', 14, true, [0.1, 0.1, 0.12]));
    cmds.push(pdfText(
      mPt,
      pageHPt - mPt - 32,
      `Wall: ${config.wall.widthIn.toFixed(1)}" W x ${config.wall.heightIn.toFixed(1)}" H  |  ${plan.geom.stats.stripeCount} Stripes  |  ${plan.activeTiles.length} Stencil Sheets (+ Cover)`,
      9.5,
      false,
      [0.35, 0.35, 0.4]
    ));

    const calBoxSize = 2.0 * PT_PER_IN;
    const calX = pageWPt - mPt - calBoxSize;
    const calY = mPt + 16;
    cmds.push('q 0.1 0.1 0.12 RG 1.2 w');
    cmds.push(`${fmtPt(calX)} ${fmtPt(calY)} ${fmtPt(calBoxSize)} ${fmtPt(calBoxSize)} re S Q`);
    cmds.push(pdfText(calX + 18, calY + calBoxSize - 24, 'SCALE CHECK BOX', 9, true, [0.1, 0.1, 0.12]));
    cmds.push(pdfText(calX + 12, calY + calBoxSize - 38, 'Exact 2.00" x 2.00"', 9.5, true, [0.75, 0.06, 0.16]));

    writer.addPage(cmds);
  }

  const mPt = plan.marginIn * PT_PER_IN;
  const contentWPt = plan.contentW * PT_PER_IN;
  const contentHPt = plan.contentH * PT_PER_IN;

  plan.activeTiles.forEach((tile, idx) => {
    const pageNum = idx + 2;
    const cmds = [];
    const toX = (wx) => (plan.marginIn + (wx - tile.tileX)) * PT_PER_IN;
    const toY = (wy) => (plan.pageHIn - plan.marginIn - (wy - tile.tileY)) * PT_PER_IN;

    cmds.push('q 0.72 0.72 0.76 RG 0.5 w [4 3] 0 d');
    cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt)} ${fmtPt(contentWPt)} ${fmtPt(contentHPt)} re S Q`);

    cmds.push('q 0.2 0.2 0.25 RG 0.75 w');
    cmds.push(pdfCrosshair(mPt, mPt, 9));
    cmds.push(pdfCrosshair(mPt + contentWPt, mPt, 9));
    cmds.push(pdfCrosshair(mPt, mPt + contentHPt, 9));
    cmds.push(pdfCrosshair(mPt + contentWPt, mPt + contentHPt, 9));
    cmds.push('Q');

    cmds.push('q');
    cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt)} ${fmtPt(contentWPt)} ${fmtPt(contentHPt)} re W n`);

    if (includeCenterline || config.stitch.showSeamLine) {
      cmds.push('q 0.65 0.65 0.68 RG 0.55 w [5 4] 0 d');
      for (const seam of plan.geom.seams) {
        const pts = seam.points;
        if (pts.length >= 2) {
          const seg = [`${fmtPt(toX(pts[0][0]))} ${fmtPt(toY(pts[0][1]))} m`];
          for (let i = 1; i < pts.length; i++) {
            seg.push(`${fmtPt(toX(pts[i][0]))} ${fmtPt(toY(pts[i][1]))} l`);
          }
          seg.push('S');
          cmds.push(seg.join(' '));
        }
      }
      cmds.push('Q');
    }

    if (inkSaver) {
      cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} RG 0.9 w 1 j`);
      for (const pair of tile.pairs) {
        cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} S`);
        cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} S`);
      }
      cmds.push('Q');
    } else {
      cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} rg`);
      for (const pair of tile.pairs) {
        cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} f`);
        cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} f`);
      }
      cmds.push('Q');
    }

    cmds.push('Q');
    cmds.push(pdfText(mPt, pageHPt - mPt + 8, `Page ${pageNum} of ${plan.totalPages}  |  Row ${tile.row}, Col ${tile.col}`, 8.5, true, [0.2, 0.2, 0.24]));
    writer.addPage(cmds);
  });

  return {
    bytes: writer.buildBytes(),
    pageCount: plan.totalPages,
    tileCount: plan.activeTiles.length,
    plan,
  };
}

/**
 * Generate a 1-page 1:1 Reusable VERTICAL Stencil Strip PDF (Portrait US Letter 8.5" x 11")
 * with active cut outlines, dashed blue top/bottom alignment ghost stitches, and a 2.00" scale check bar.
 */
export function generateReusableStripPDF(config, options = {}) {
  const { inkSaver = true } = options;
  const pageWIn = 8.5;
  const pageHIn = 11.0;
  const tile = buildReusableStencilTile(config, pageWIn, pageHIn, 0.85);
  const writer = new SimplePdfWriter(pageWIn, pageHIn);
  const stitchRgb = hexToRgb01(config.stitch.color || '#C8102E');

  const toX = (x) => x * PT_PER_IN;
  const toY = (y) => (pageHIn - y) * PT_PER_IN;

  const cmds = [];
  const mPt = 0.5 * PT_PER_IN;

  cmds.push(pdfText(mPt, pageHIn * PT_PER_IN - 26, 'REUSABLE VERTICAL BASEBALL STITCH STENCIL (1:1 - US LETTER)', 11, true, [0.1, 0.1, 0.12]));
  cmds.push(pdfText(mPt, pageHIn * PT_PER_IN - 40, tile.note, 8, false, [0.3, 0.3, 0.35]));

  // Outer stencil frame
  cmds.push('q 0.65 0.65 0.7 RG 0.6 w [4 3] 0 d');
  cmds.push(`${fmtPt(mPt)} ${fmtPt(mPt + 24)} ${fmtPt((pageWIn - 1.0) * PT_PER_IN)} ${fmtPt((pageHIn - 1.55) * PT_PER_IN)} re S Q`);

  // Vertical plumb centerline guide
  cmds.push('q 0.6 0.6 0.65 RG 0.55 w [5 4] 0 d');
  if (tile.centerlinePts.length >= 2) {
    const seg = [`${fmtPt(toX(tile.centerlinePts[0][0]))} ${fmtPt(toY(tile.centerlinePts[0][1]))} m`];
    for (let i = 1; i < tile.centerlinePts.length; i++) {
      seg.push(`${fmtPt(toX(tile.centerlinePts[i][0]))} ${fmtPt(toY(tile.centerlinePts[i][1]))} l`);
    }
    seg.push('S');
    cmds.push(seg.join(' '));
  }
  cmds.push('Q');

  // Top & Bottom dashed blue alignment ghost stitches
  cmds.push('q 0.14 0.39 0.92 RG 0.95 w [3 2] 0 d');
  for (const pair of tile.ghostPairs) {
    cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} S`);
    cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} S`);
  }
  cmds.push('Q');

  // Active cutout stitches
  if (inkSaver) {
    cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} RG 1.0 w 1 j`);
    for (const pair of tile.activePairs) {
      cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} S`);
      cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} S`);
    }
    cmds.push('Q');
  } else {
    cmds.push(`q ${fmtPt(stitchRgb[0])} ${fmtPt(stitchRgb[1])} ${fmtPt(stitchRgb[2])} rg`);
    for (const pair of tile.activePairs) {
      cmds.push(`${pdfPolyPath(pair.leftPoly, toX, toY)} f`);
      cmds.push(`${pdfPolyPath(pair.rightPoly, toX, toY)} f`);
    }
    cmds.push('Q');
  }

  // Exact 2.00" bottom calibration bar
  const barY = 20;
  cmds.push('q 0.1 0.1 0.12 RG 1.5 w');
  cmds.push(`${fmtPt(mPt)} ${fmtPt(barY)} m ${fmtPt(mPt + 2 * PT_PER_IN)} ${fmtPt(barY)} l S`);
  cmds.push(`${fmtPt(mPt)} ${fmtPt(barY - 5)} m ${fmtPt(mPt)} ${fmtPt(barY + 5)} l S`);
  cmds.push(`${fmtPt(mPt + PT_PER_IN)} ${fmtPt(barY - 3)} m ${fmtPt(mPt + PT_PER_IN)} ${fmtPt(barY + 3)} l S`);
  cmds.push(`${fmtPt(mPt + 2 * PT_PER_IN)} ${fmtPt(barY - 5)} m ${fmtPt(mPt + 2 * PT_PER_IN)} ${fmtPt(barY + 5)} l S Q`);
  cmds.push(pdfText(mPt + 2 * PT_PER_IN + 10, barY - 3, '<- Exact 2.00" Scale Check  |  RED = Cut Out  |  BLUE DASHED = Align to previous stitch', 7.8, true, [0.2, 0.2, 0.25]));

  writer.addPage(cmds);
  return {
    bytes: writer.buildBytes(),
    pageCount: 1,
    activeCount: tile.activeCount,
    shiftDistIn: tile.shiftDistIn,
    note: tile.note,
  };
}
