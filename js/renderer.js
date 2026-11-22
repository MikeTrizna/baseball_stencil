/**
 * High-DPI HTML5 Canvas renderer for the Baseball Stitch Stencil Designer.
 * Supports:
 * - 2D Scaled Wall Builder (rulers, grid, trim, draggable/resizable furniture)
 * - Photo Overlay Mode (built-in sample kid's bedroom wall + uploaded photos + 2-point scale calibration + multiply blend)
 * - Interactive handles (Custom Bezier control points, furniture drag/resize)
 * - Thumbnail generation & Split-Screen Comparison rendering
 */

import { computeDesignGeometry, clamp } from './geometry.js';

let cachedSampleRoomCanvas = null;

/**
 * Generates a realistic-feeling, pre-calibrated 1600x1067 sample kid's bedroom wall
 * (representing a 12ft x 8ft wall with 48" blue painter's tape calibration marks)
 * so the user can test Photo Overlay + Scale Calibration tonight before taking photos tomorrow.
 */
export function getSampleRoomImage() {
  if (cachedSampleRoomCanvas) return cachedSampleRoomCanvas;

  const w = 1600;
  const h = 1067;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  // Subtle sunlit bedroom wall gradient (warm cream drywall)
  const wallGrad = ctx.createLinearGradient(0, 0, w, h);
  wallGrad.addColorStop(0, '#F3EFE6');
  wallGrad.addColorStop(0.55, '#ECE6D9');
  wallGrad.addColorStop(1, '#DFD8C8');
  ctx.fillStyle = wallGrad;
  ctx.fillRect(0, 0, w, h);

  // Soft window light wash coming from upper right
  const sunGrad = ctx.createRadialGradient(w * 0.82, h * 0.25, 40, w * 0.72, h * 0.42, 760);
  sunGrad.addColorStop(0, 'rgba(255, 252, 240, 0.48)');
  sunGrad.addColorStop(0.6, 'rgba(255, 250, 235, 0.14)');
  sunGrad.addColorStop(1, 'rgba(255, 250, 235, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, w, h);

  // Subtle ceiling shadow along top
  const ceilShadow = ctx.createLinearGradient(0, 0, 0, 56);
  ceilShadow.addColorStop(0, 'rgba(70, 62, 50, 0.14)');
  ceilShadow.addColorStop(1, 'rgba(70, 62, 50, 0)');
  ctx.fillStyle = ceilShadow;
  ctx.fillRect(0, 0, w, 56);

  // Subtle wall texture grain
  ctx.fillStyle = 'rgba(110, 98, 82, 0.025)';
  for (let i = 0; i < 1800; i++) {
    const gx = (i * 97.3) % w;
    const gy = (i * 173.7) % h;
    ctx.fillRect(gx, gy, 2, 2);
  }

  // Baseboard along bottom (4.5" at ~11.11 px/in = 50px)
  const baseH = 50;
  ctx.fillStyle = '#FAF8F3';
  ctx.fillRect(0, h - baseH, w, baseH);
  ctx.fillStyle = '#D5CFC3';
  ctx.fillRect(0, h - baseH, w, 4);
  ctx.fillStyle = '#E8E3D8';
  ctx.fillRect(0, h - baseH + 10, w, 3);

  // Window on right (x: 1125, y: 175, w: 350, h: 485)
  const wx = 1125, wy = 175, ww = 350, wh = 485;
  ctx.save();
  ctx.shadowColor = 'rgba(40, 35, 28, 0.16)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = -6;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = '#FAF8F4';
  ctx.fillRect(wx - 18, wy - 18, ww + 36, wh + 36);
  ctx.restore();
  // Window sky glass
  const skyGrad = ctx.createLinearGradient(wx, wy, wx, wy + wh);
  skyGrad.addColorStop(0, '#B8DCF2');
  skyGrad.addColorStop(0.7, '#DCEEF9');
  skyGrad.addColorStop(1, '#EEF5E8');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(wx, wy, ww, wh);
  // Window mullions
  ctx.strokeStyle = '#F7F5F0';
  ctx.lineWidth = 14;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh / 2);
  ctx.lineTo(wx + ww, wy + wh / 2);
  ctx.stroke();
  // Window sill
  ctx.fillStyle = '#EFECE5';
  ctx.fillRect(wx - 28, wy + wh + 14, ww + 56, 16);

  // Twin Bed & Wooden Headboard centered left-middle (x: 540, y: 585, w: 470, h: 482)
  const bx = 540, by = 585, bw = 470, bh = 482;
  // Soft shadow behind headboard
  ctx.save();
  ctx.shadowColor = 'rgba(40, 30, 20, 0.22)';
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#8B5E3C';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, 250, [14, 14, 0, 0]);
  ctx.fill();
  ctx.restore();
  // Wood slats on headboard
  ctx.strokeStyle = 'rgba(55, 34, 18, 0.35)';
  ctx.lineWidth = 3;
  for (let sx = bx + 42; sx < bx + bw - 20; sx += 42) {
    ctx.beginPath();
    ctx.moveTo(sx, by + 26);
    ctx.lineTo(sx, by + 210);
    ctx.stroke();
  }
  // Headboard top cap
  ctx.fillStyle = '#734B2D';
  ctx.fillRect(bx - 10, by - 6, bw + 20, 22);
  // Pillow
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(bx + 70, by + 135, bw - 140, 92, 26);
  ctx.fill();
  ctx.strokeStyle = '#DDD7CC';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Navy & cream bedding
  ctx.fillStyle = '#2B4570';
  ctx.beginPath();
  ctx.roundRect(bx - 8, by + 212, bw + 16, bh - 212, [16, 16, 0, 0]);
  ctx.fill();
  ctx.fillStyle = '#E63946';
  ctx.fillRect(bx - 8, by + 265, bw + 16, 20);
  ctx.fillStyle = '#F7F4EC';
  ctx.fillRect(bx - 8, by + 285, bw + 16, 12);

  // Small blue painter's tape calibration marks on the wall, exactly 48" apart (533.33px at 11.111 px/in)
  // Mark A at x=360, Mark B at x=893.33, y=520
  const drawTape = (tx, ty, label) => {
    ctx.save();
    ctx.fillStyle = 'rgba(37, 99, 235, 0.85)';
    ctx.fillRect(tx - 6, ty - 22, 12, 44);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(tx - 1, ty - 22, 2, 44);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(30, 58, 138, 0.72)';
    ctx.textAlign = 'center';
    ctx.fillText(label, tx, ty + 38);
    ctx.restore();
  };
  drawTape(360, 520, 'Tape A');
  drawTape(893.3, 520, 'Tape B (48")');

  // Subtle watermark in bottom-left
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(90, 82, 72, 0.48)';
  ctx.fillText('Sample Bedroom Wall (12ft × 8ft) — Upload your son\'s real wall photo tomorrow!', 28, h - 18);

  cachedSampleRoomCanvas = c;
  return c;
}

/**
 * Compute viewport transform mapping wall inches <-> canvas CSS pixels.
 */
export function computeStageViewport(canvasWidth, canvasHeight, state, photoImg = null) {
  const rulerPad = state.viewMode === 'wall2d' && state.showRulers ? 34 : 16;
  const padRight = 18;
  const padBottom = 18;
  const availW = Math.max(100, canvasWidth - rulerPad - padRight);
  const availH = Math.max(100, canvasHeight - rulerPad - padBottom);

  if (state.viewMode === 'photo') {
    const img = photoImg || getSampleRoomImage();
    const imgW = img.naturalWidth || img.width || 1600;
    const imgH = img.naturalHeight || img.height || 1067;
    const imgScale = Math.min(availW / imgW, availH / imgH);
    const drawW = imgW * imgScale;
    const drawH = imgH * imgScale;
    const imgLeft = rulerPad + (availW - drawW) / 2;
    const imgTop = rulerPad + (availH - drawH) / 2;

    const ppi = Math.max(0.5, state.photo.pixelsPerInch || 11.111);
    const oxPx = state.photo.originPxX || 0;
    const oyPx = state.photo.originPxY || 0;
    const pxPerInOnCanvas = ppi * imgScale;

    return {
      mode: 'photo',
      img,
      imgW,
      imgH,
      imgScale,
      imgLeft,
      imgTop,
      drawW,
      drawH,
      wallLeft: imgLeft + oxPx * imgScale,
      wallTop: imgTop + oyPx * imgScale,
      pxPerIn: pxPerInOnCanvas,
      wallToCanvas: (wx, wy) => [
        imgLeft + (oxPx + wx * ppi) * imgScale,
        imgTop + (oyPx + wy * ppi) * imgScale,
      ],
      canvasToWall: (cx, cy) => [
        ((cx - imgLeft) / imgScale - oxPx) / ppi,
        ((cy - imgTop) / imgScale - oyPx) / ppi,
      ],
      photoPxToCanvas: (px, py) => [imgLeft + px * imgScale, imgTop + py * imgScale],
      canvasToPhotoPx: (cx, cy) => [(cx - imgLeft) / imgScale, (cy - imgTop) / imgScale],
    };
  }

  // 2D Scaled Wall Builder
  const wallW = state.wall.widthIn;
  const wallH = state.wall.heightIn;
  const pxPerIn = Math.min(availW / wallW, availH / wallH);
  const drawW = wallW * pxPerIn;
  const drawH = wallH * pxPerIn;
  const wallLeft = rulerPad + (availW - drawW) / 2;
  const wallTop = rulerPad + (availH - drawH) / 2;

  return {
    mode: 'wall2d',
    wallLeft,
    wallTop,
    drawW,
    drawH,
    pxPerIn,
    wallToCanvas: (wx, wy) => [wallLeft + wx * pxPerIn, wallTop + wy * pxPerIn],
    canvasToWall: (cx, cy) => [(cx - wallLeft) / pxPerIn, (cy - wallTop) / pxPerIn],
  };
}

/**
 * Draw a single closed polygon path in wall inches.
 */
function tracePoly(ctx, poly, wallToCanvas) {
  if (!poly || poly.length < 3) return;
  const [x0, y0] = wallToCanvas(poly[0][0], poly[0][1]);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  for (let i = 1; i < poly.length; i++) {
    const [x, y] = wallToCanvas(poly[i][0], poly[i][1]);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Render an architectural or furniture obstacle in 2D Wall Builder mode.
 */
function drawObstacle(ctx, obs, vp, isSelected) {
  const [x, y] = vp.wallToCanvas(obs.x, obs.y);
  const w = obs.w * vp.pxPerIn;
  const h = obs.h * vp.pxPerIn;

  ctx.save();
  if (obs.type === 'bed') {
    // Headboard & bedding silhouette
    ctx.fillStyle = '#8C6242';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h * 0.52, [6, 6, 0, 0]);
    ctx.fill();
    // Pillow
    ctx.fillStyle = '#FAF8F5';
    ctx.beginPath();
    ctx.roundRect(x + w * 0.14, y + h * 0.28, w * 0.72, h * 0.22, 6);
    ctx.fill();
    // Quilt
    ctx.fillStyle = '#2B4570';
    ctx.fillRect(x, y + h * 0.48, w, h * 0.52);
    ctx.fillStyle = '#D9434F';
    ctx.fillRect(x, y + h * 0.56, w, Math.max(3, h * 0.05));
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x, y, w, h);
  } else if (obs.type === 'window') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    const sky = ctx.createLinearGradient(x, y, x, y + h);
    sky.addColorStop(0, '#BDE0F5');
    sky.addColorStop(1, '#E6F3FB');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(2, vp.pxPerIn * 0.45);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y);
    ctx.lineTo(x + w / 2, y + h);
    ctx.moveTo(x, y + h / 2);
    ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
  } else if (obs.type === 'door') {
    ctx.fillStyle = '#F8F6F2';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#9CA3AF';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + w * 0.16, y + h * 0.08, w * 0.68, h * 0.36);
    ctx.strokeRect(x + w * 0.16, y + h * 0.52, w * 0.68, h * 0.38);
    // Knob
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(x + w * 0.85, y + h * 0.52, Math.max(2.5, vp.pxPerIn * 0.4), 0, Math.PI * 2);
    ctx.fill();
  } else if (obs.type === 'dresser') {
    ctx.fillStyle = '#A88260';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6B4F35';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x, y, w, h);
    const drawers = 4;
    for (let i = 1; i < drawers; i++) {
      const dy = y + (h * i) / drawers;
      ctx.beginPath();
      ctx.moveTo(x + 3, dy);
      ctx.lineTo(x + w - 3, dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#4B3624';
    for (let i = 0; i < drawers; i++) {
      const cy = y + (h * (i + 0.5)) / drawers;
      ctx.beginPath();
      ctx.arc(x + w * 0.35, cy, 2, 0, Math.PI * 2);
      ctx.arc(x + w * 0.65, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (obs.type === 'shelf') {
    ctx.fillStyle = '#7C583B';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#4E3522';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  } else {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(x, y, w, h);
  }

  // Label pill
  if (w > 46 && h > 16) {
    ctx.font = '600 11px system-ui, sans-serif';
    const text = `${obs.label} (${Math.round(obs.w)}"×${Math.round(obs.h)}")`;
    const tw = ctx.measureText(text).width;
    const pillW = Math.min(w - 8, tw + 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.66)';
    ctx.beginPath();
    ctx.roundRect(x + (w - pillW) / 2, y + h / 2 - 9, pillW, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2, pillW - 6);
  }

  // Selection outline & bottom-right resize handle
  if (isSelected) {
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    ctx.setLineDash([]);
    // Resize knob
    ctx.fillStyle = '#2563EB';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(x + w - 6, y + h - 6, 12, 12);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draw stitch artwork layer onto ctx using viewport vp.
 */
function drawStitchLayer(ctx, state, geom, vp, alphaOverride = null) {
  const { stitch, wall } = state;
  const W = wall.widthIn;
  const H = wall.heightIn;
  const clipTop = wall.clipStitchesToTrim ? (wall.crownIn || 0) : 0;
  const clipBottom = wall.clipStitchesToTrim ? H - (wall.baseboardIn || 0) : H;

  ctx.save();
  // Clip to wall bounds in 2D mode (or photo bounds in photo mode)
  if (vp.mode === 'wall2d') {
    const [wx0, wy0] = vp.wallToCanvas(0, clipTop);
    const [wx1, wy1] = vp.wallToCanvas(W, clipBottom);
    ctx.beginPath();
    ctx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
    ctx.clip();
  } else {
    ctx.beginPath();
    ctx.rect(vp.imgLeft, vp.imgTop, vp.drawW, vp.drawH);
    ctx.clip();
  }

  if (vp.mode === 'photo' && stitch.multiplyBlend) {
    ctx.globalCompositeOperation = 'multiply';
  }
  const baseAlpha = alphaOverride !== null ? alphaOverride : (vp.mode === 'photo' ? (stitch.opacity ?? 0.92) : 1.0);
  ctx.globalAlpha = clamp(baseAlpha, 0.05, 1);

  // Optional subtle seam centerline groove
  if (stitch.showSeamLine || state.showCenterlineGuide) {
    ctx.save();
    ctx.strokeStyle = stitch.showSeamLine ? (stitch.seamLineColor || '#BEB7A8') : 'rgba(37, 99, 235, 0.45)';
    ctx.lineWidth = Math.max(1, (stitch.showSeamLine ? (stitch.seamLineWidthIn || 0.08) : 0.06) * vp.pxPerIn);
    if (!stitch.showSeamLine && state.showCenterlineGuide) {
      ctx.setLineDash([6, 4]);
    }
    for (const seam of geom.seams) {
      if (seam.points.length < 2) continue;
      ctx.beginPath();
      const [sx, sy] = vp.wallToCanvas(seam.points[0][0], seam.points[0][1]);
      ctx.moveTo(sx, sy);
      for (let i = 3; i < seam.points.length; i += 3) {
        const [px, py] = vp.wallToCanvas(seam.points[i][0], seam.points[i][1]);
        ctx.lineTo(px, py);
      }
      const last = seam.points[seam.points.length - 1];
      const [lx, ly] = vp.wallToCanvas(last[0], last[1]);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Render stitch cutouts
  ctx.fillStyle = stitch.color || '#C8102E';
  for (const pair of geom.pairs) {
    tracePoly(ctx, pair.leftPoly, vp.wallToCanvas);
    ctx.fill();
    tracePoly(ctx, pair.rightPoly, vp.wallToCanvas);
    ctx.fill();
  }

  // Optional lace holes
  if (stitch.showLaceHoles) {
    const r = Math.max(1.2, Math.max(0.06, stitch.widthIn * 0.28) * vp.pxPerIn);
    ctx.fillStyle = '#3B2F2F';
    for (const pair of geom.pairs) {
      for (const [hx, hy] of pair.holes) {
        const [cx, cy] = vp.wallToCanvas(hx, hy);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * Draw architectural rulers (feet / inches or cm) in 2D wall mode.
 */
function drawRulers(ctx, state, vp) {
  const W = state.wall.widthIn;
  const H = state.wall.heightIn;
  const isCm = state.units === 'cm';
  const stepMajor = isCm ? (30 / 2.54) : 12; // 30cm or 1ft
  const stepMinor = isCm ? (10 / 2.54) : 3;

  ctx.save();
  ctx.font = '500 10px system-ui, sans-serif';
  ctx.fillStyle = '#64748B';
  ctx.strokeStyle = '#94A3B8';
  ctx.lineWidth = 1;

  // Top horizontal ruler
  const topY = vp.wallTop - 6;
  ctx.beginPath();
  ctx.moveTo(vp.wallLeft, topY);
  ctx.lineTo(vp.wallLeft + vp.drawW, topY);
  ctx.stroke();

  for (let x = 0; x <= W + 0.01; x += stepMinor) {
    const cx = vp.wallLeft + x * vp.pxPerIn;
    const isMajor = Math.abs(x % stepMajor) < 0.1 || Math.abs((x % stepMajor) - stepMajor) < 0.1;
    const tickH = isMajor ? 9 : 4;
    ctx.beginPath();
    ctx.moveTo(cx, topY);
    ctx.lineTo(cx, topY - tickH);
    ctx.stroke();
    if (isMajor) {
      const label = isCm ? `${Math.round(x * 2.54)}cm` : `${Math.round(x / 12)}'`;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, topY - 12);
    }
  }

  // Left vertical ruler (measured from floor upward is intuitive, plus top-down ticks)
  const leftX = vp.wallLeft - 6;
  ctx.beginPath();
  ctx.moveTo(leftX, vp.wallTop);
  ctx.lineTo(leftX, vp.wallTop + vp.drawH);
  ctx.stroke();

  for (let yFromFloor = 0; yFromFloor <= H + 0.01; yFromFloor += stepMinor) {
    const wy = H - yFromFloor;
    const cy = vp.wallTop + wy * vp.pxPerIn;
    const isMajor = Math.abs(yFromFloor % stepMajor) < 0.1 || Math.abs((yFromFloor % stepMajor) - stepMajor) < 0.1;
    const tickW = isMajor ? 9 : 4;
    ctx.beginPath();
    ctx.moveTo(leftX, cy);
    ctx.lineTo(leftX - tickW, cy);
    ctx.stroke();
    if (isMajor) {
      const label = isCm ? `${Math.round(yFromFloor * 2.54)}` : `${Math.round(yFromFloor / 12)}'`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, leftX - 11, cy);
    }
  }

  ctx.restore();
}

/**
 * Render the complete stage onto a canvas element.
 * Returns { viewport, geom } for hit-testing & stats.
 */
export function renderStage(canvas, state, options = {}) {
  const {
    photoImg = null,
    selectedObstacleId = null,
    calibrationMode = false,
    calibStep = 0, // 0=idle, 1=pick A, 2=pick B
    showHandles = true,
    geomOverride = null,
  } = options;

  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width || 900;
  const cssH = canvas.clientHeight || canvas.height || 580;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  // Studio background
  ctx.fillStyle = '#EAECEF';
  ctx.fillRect(0, 0, cssW, cssH);

  const geom = geomOverride || computeDesignGeometry(state);
  const vp = computeStageViewport(cssW, cssH, state, photoImg);

  if (vp.mode === 'wall2d') {
    // Wall drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = state.wall.paintColor || '#F5F2EB';
    ctx.fillRect(vp.wallLeft, vp.wallTop, vp.drawW, vp.drawH);
    ctx.restore();

    // Subtle wall ambient light gradient
    const lightGrad = ctx.createLinearGradient(vp.wallLeft, vp.wallTop, vp.wallLeft, vp.wallTop + vp.drawH);
    lightGrad.addColorStop(0, 'rgba(0,0,0,0.03)');
    lightGrad.addColorStop(0.25, 'rgba(255,255,255,0.04)');
    lightGrad.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = lightGrad;
    ctx.fillRect(vp.wallLeft, vp.wallTop, vp.drawW, vp.drawH);

    // Optional drafting grid (1 ft major, 3 in minor)
    if (state.showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(vp.wallLeft, vp.wallTop, vp.drawW, vp.drawH);
      ctx.clip();
      for (let x = 3; x < state.wall.widthIn; x += 3) {
        const cx = vp.wallLeft + x * vp.pxPerIn;
        const isFt = x % 12 === 0;
        ctx.strokeStyle = isFt ? 'rgba(100, 116, 139, 0.22)' : 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = isFt ? 1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(cx, vp.wallTop);
        ctx.lineTo(cx, vp.wallTop + vp.drawH);
        ctx.stroke();
      }
      for (let y = 3; y < state.wall.heightIn; y += 3) {
        const cy = vp.wallTop + (state.wall.heightIn - y) * vp.pxPerIn;
        const isFt = y % 12 === 0;
        ctx.strokeStyle = isFt ? 'rgba(100, 116, 139, 0.22)' : 'rgba(148, 163, 184, 0.1)';
        ctx.lineWidth = isFt ? 1 : 0.6;
        ctx.beginPath();
        ctx.moveTo(vp.wallLeft, cy);
        ctx.lineTo(vp.wallLeft + vp.drawW, cy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Crown molding
    if (state.wall.crownIn > 0) {
      const crownH = state.wall.crownIn * vp.pxPerIn;
      ctx.fillStyle = state.wall.trimColor || '#FFFFFF';
      ctx.fillRect(vp.wallLeft, vp.wallTop, vp.drawW, crownH);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(vp.wallLeft, vp.wallTop + crownH - 1.5, vp.drawW, 1.5);
    }

    // Baseboard trim
    if (state.wall.baseboardIn > 0) {
      const baseH = state.wall.baseboardIn * vp.pxPerIn;
      ctx.fillStyle = state.wall.trimColor || '#FFFFFF';
      ctx.fillRect(vp.wallLeft, vp.wallTop + vp.drawH - baseH, vp.drawW, baseH);
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      ctx.fillRect(vp.wallLeft, vp.wallTop + vp.drawH - baseH, vp.drawW, 1.5);
    }

    // Draw stitches BEFORE furniture if masking behind furniture, or AFTER if ghosting
    if (state.maskBehindFurniture) {
      drawStitchLayer(ctx, state, geom, vp);
    }

    // Draw visible obstacles
    for (const obs of state.obstacles) {
      if (!obs.visible) continue;
      drawObstacle(ctx, obs, vp, showHandles && obs.id === selectedObstacleId);
    }

    if (!state.maskBehindFurniture) {
      drawStitchLayer(ctx, state, geom, vp, 0.85);
    }

    // Crisp wall border
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(vp.wallLeft, vp.wallTop, vp.drawW, vp.drawH);

    // Rulers
    if (state.showRulers) {
      drawRulers(ctx, state, vp);
    }
  } else {
    // Photo Overlay Mode
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.18)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 6;
    ctx.drawImage(vp.img, vp.imgLeft, vp.imgTop, vp.drawW, vp.drawH);
    ctx.restore();

    // Optional subtle scale grid over photo
    if (state.showGrid) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(vp.imgLeft, vp.imgTop, vp.drawW, vp.drawH);
      ctx.clip();
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.16)';
      ctx.lineWidth = 0.8;
      for (let x = 0; x <= state.wall.widthIn; x += 12) {
        const [cx] = vp.wallToCanvas(x, 0);
        ctx.beginPath();
        ctx.moveTo(cx, vp.imgTop);
        ctx.lineTo(cx, vp.imgTop + vp.drawH);
        ctx.stroke();
      }
      for (let y = 0; y <= state.wall.heightIn; y += 12) {
        const [, cy] = vp.wallToCanvas(0, y);
        ctx.beginPath();
        ctx.moveTo(vp.imgLeft, cy);
        ctx.lineTo(vp.imgLeft + vp.drawW, cy);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawStitchLayer(ctx, state, geom, vp);

    // Draw 2-Point Scale Calibration overlay when calibrating
    if (calibrationMode && state.photo.calibPtA && state.photo.calibPtB) {
      const [ax, ay] = vp.photoPxToCanvas(state.photo.calibPtA[0], state.photo.calibPtA[1]);
      const [bx, by] = vp.photoPxToCanvas(state.photo.calibPtB[0], state.photo.calibPtB[1]);

      ctx.save();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.setLineDash([]);

      const drawPin = (px, py, label, active) => {
        ctx.fillStyle = active ? '#DC2626' : '#2563EB';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px, py);
      };
      drawPin(ax, ay, 'A', calibStep === 1);
      drawPin(bx, by, 'B', calibStep === 2);

      // Midpoint distance badge
      const mx = (ax + bx) / 2;
      const my = (ay + by) / 2 - 18;
      const badge = `${Number(state.photo.calibDistanceIn).toFixed(1)}" reference`;
      ctx.font = '600 12px system-ui, sans-serif';
      const bw = ctx.measureText(badge).width + 16;
      ctx.fillStyle = '#1E40AF';
      ctx.beginPath();
      ctx.roundRect(mx - bw / 2, my - 11, bw, 22, 6);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badge, mx, my);
      ctx.restore();
    }
  }

  ctx.restore();
  return { viewport: vp, geom };
}

/**
 * Render a crisp, zoomed-in macro close-up of the center stripe's stitches
 * with a fine drafting grid, scale bar, and blueprint-style Band & Pitch callouts.
 * Returns { pxPerIn, viewWidthIn, viewHeightIn }.
 */
export function renderStitchZoom(canvas, state, geomOverride = null) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || canvas.width || 252;
  const cssH = canvas.clientHeight || canvas.height || 360;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);

  // Wall-matched studio background
  ctx.fillStyle = state.wall?.paintColor || '#FAFAFA';
  ctx.fillRect(0, 0, cssW, cssH);

  const geom = geomOverride || computeDesignGeometry(state);
  const repSeam = geom.seams.find((s) => s.stripeIndex === 0) || geom.seams[0];
  if (!repSeam || !repSeam.pairs.length) {
    ctx.fillStyle = '#64748B';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No visible stitches on wall', cssW / 2, cssH / 2);
    ctx.restore();
    return { pxPerIn: 0, viewWidthIn: 0, viewHeightIn: 0 };
  }

  const midIdx = Math.floor(repSeam.pairs.length / 2);
  const centerPair = repSeam.pairs[midIdx];
  const [centerWX, centerWY] = centerPair.stationPos;

  const bandW = geom.stats.bandWidthIn || 1.25;
  const zoomMode = state.stitchZoomLevel || 'detail';
  let viewWidthIn;
  if (zoomMode === 'macro') {
    viewWidthIn = Math.max(1.6, bandW * 1.45);
  } else if (zoomMode === 'strip') {
    viewWidthIn = Math.max(5.5, bandW * 3.2);
  } else {
    viewWidthIn = Math.max(2.9, bandW * 2.15);
  }

  const pxPerIn = cssW / viewWidthIn;
  const viewHeightIn = cssH / pxPerIn;
  const wallToCanvas = (wx, wy) => [
    cssW / 2 + (wx - centerWX) * pxPerIn,
    cssH / 2 + (wy - centerWY) * pxPerIn,
  ];

  // Fine drafting grid (0.25" minor / 1.00" major, or 0.5 cm / 2 cm in cm mode)
  const isCm = state.units === 'cm';
  const minorStepIn = isCm ? (0.5 / 2.54) : 0.25;
  const majorEvery = 4;
  const halfWIn = viewWidthIn / 2 + minorStepIn;
  const halfHIn = viewHeightIn / 2 + minorStepIn;

  ctx.save();
  const xStartIdx = Math.floor((centerWX - halfWIn) / minorStepIn);
  const xEndIdx = Math.ceil((centerWX + halfWIn) / minorStepIn);
  for (let i = xStartIdx; i <= xEndIdx; i++) {
    const wx = i * minorStepIn;
    const [cx] = wallToCanvas(wx, centerWY);
    const isMajor = ((i % majorEvery) + majorEvery) % majorEvery === 0;
    ctx.strokeStyle = isMajor ? 'rgba(100, 116, 139, 0.2)' : 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = isMajor ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cssH);
    ctx.stroke();
  }
  const yStartIdx = Math.floor((centerWY - halfHIn) / minorStepIn);
  const yEndIdx = Math.ceil((centerWY + halfHIn) / minorStepIn);
  for (let i = yStartIdx; i <= yEndIdx; i++) {
    const wy = i * minorStepIn;
    const [, cy] = wallToCanvas(centerWX, wy);
    const isMajor = ((i % majorEvery) + majorEvery) % majorEvery === 0;
    ctx.strokeStyle = isMajor ? 'rgba(100, 116, 139, 0.2)' : 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = isMajor ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(cssW, cy);
    ctx.stroke();
  }
  ctx.restore();

  const { stitch } = state;

  // Seam centerline (always show subtle dashed guide in zoom if showSeamLine is off so V-angle & center gap read clearly)
  ctx.save();
  if (stitch.showSeamLine) {
    ctx.strokeStyle = stitch.seamLineColor || '#BEB7A8';
    ctx.lineWidth = Math.max(1.2, (stitch.seamLineWidthIn || 0.08) * pxPerIn);
  } else {
    ctx.strokeStyle = state.showCenterlineGuide ? 'rgba(37, 99, 235, 0.55)' : 'rgba(100, 116, 139, 0.28)';
    ctx.lineWidth = 1.1;
    ctx.setLineDash([5, 4]);
  }
  if (repSeam.points.length >= 2) {
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < repSeam.points.length; i++) {
      const [px, py] = repSeam.points[i];
      if (py < centerWY - halfHIn - 2 || py > centerWY + halfHIn + 2) continue;
      const [cx, cy] = wallToCanvas(px, py);
      if (!started) {
        ctx.moveTo(cx, cy);
        started = true;
      } else {
        ctx.lineTo(cx, cy);
      }
    }
    if (started) ctx.stroke();
  }
  ctx.restore();

  // Render visible stitch pairs from the representative stripe (and nearby stripes if Strip zoom sees them)
  ctx.save();
  ctx.fillStyle = stitch.color || '#C8102E';
  const visMinY = centerWY - halfHIn - 2;
  const visMaxY = centerWY + halfHIn + 2;
  const visMinX = centerWX - halfWIn - 2;
  const visMaxX = centerWX + halfWIn + 2;

  for (const seam of geom.seams) {
    if (seam.baseX + (state.layout.curveAmplitudeIn || 0) + bandW < visMinX ||
        seam.baseX - (state.layout.curveAmplitudeIn || 0) - bandW > visMaxX) {
      continue;
    }
    for (const pair of seam.pairs) {
      const py = pair.stationPos[1];
      if (py < visMinY || py > visMaxY) continue;
      tracePoly(ctx, pair.leftPoly, wallToCanvas);
      ctx.fill();
      tracePoly(ctx, pair.rightPoly, wallToCanvas);
      ctx.fill();
    }
  }

  // Optional lace-hole dots
  if (stitch.showLaceHoles) {
    const r = Math.max(1.8, Math.max(0.05, stitch.widthIn * 0.28) * pxPerIn);
    ctx.fillStyle = '#3B2F2F';
    for (const pair of repSeam.pairs) {
      const py = pair.stationPos[1];
      if (py < visMinY || py > visMaxY) continue;
      for (const [hx, hy] of pair.holes) {
        const [cx, cy] = wallToCanvas(hx, hy);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  const fmtMeasure = (inches) => (isCm ? `${(inches * 2.54).toFixed(1)}cm` : `${inches.toFixed(2)}"`);

  // Blueprint Callout 1: Band Width bracket pinned cleanly near the top
  {
    const minBX = Math.min(centerPair.leftBounds.minX, centerPair.rightBounds.minX);
    const maxBX = Math.max(centerPair.leftBounds.maxX, centerPair.rightBounds.maxX);
    const [lx] = wallToCanvas(minBX, centerWY);
    const [rx] = wallToCanvas(maxBX, centerWY);
    const by = 26;

    ctx.save();
    // Subtle vertical extension guides
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, by);
    ctx.lineTo(lx, cssH * 0.5);
    ctx.moveTo(rx, by);
    ctx.lineTo(rx, cssH * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    // Bracket line & end ticks
    ctx.strokeStyle = '#2563EB';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(lx, by - 4);
    ctx.lineTo(lx, by + 4);
    ctx.moveTo(rx, by - 4);
    ctx.lineTo(rx, by + 4);
    ctx.moveTo(lx, by);
    ctx.lineTo(rx, by);
    ctx.stroke();

    // Label pill
    const label = `Band ${fmtMeasure(bandW)}`;
    ctx.font = '600 10.5px system-ui, sans-serif';
    const tw = ctx.measureText(label).width + 10;
    const mx = clamp((lx + rx) / 2, tw / 2 + 6, cssW - tw / 2 - 6);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(mx - tw / 2, by - 20, tw, 15, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1E40AF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, mx, by - 12.5);
    ctx.restore();
  }

  // Blueprint Callout 2: Vertical Pitch bracket along right side of center stitch pair
  if (midIdx + 1 < repSeam.pairs.length) {
    const nextPair = repSeam.pairs[midIdx + 1];
    const maxRightX = Math.max(
      centerPair.leftBounds.maxX,
      centerPair.rightBounds.maxX,
      nextPair.leftBounds.maxX,
      nextPair.rightBounds.maxX
    );
    const [, yA] = wallToCanvas(centerPair.stationPos[0], centerPair.stationPos[1]);
    const [, yB] = wallToCanvas(nextPair.stationPos[0], nextPair.stationPos[1]);
    const [rightEdgePx] = wallToCanvas(maxRightX, centerWY);
    const bx = Math.min(cssW - 14, rightEdgePx + 12);

    if (Math.abs(yB - yA) >= 14 && bx < cssW - 6) {
      ctx.save();
      ctx.strokeStyle = '#0F766E';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(bx - 4, yA);
      ctx.lineTo(bx + 4, yA);
      ctx.moveTo(bx - 4, yB);
      ctx.lineTo(bx + 4, yB);
      ctx.moveTo(bx, yA);
      ctx.lineTo(bx, yB);
      ctx.stroke();

      const label = fmtMeasure(stitch.spacingIn);
      ctx.font = '600 10px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 8;
      const my = (yA + yB) / 2;
      const lx = Math.min(cssW - tw - 4, bx + 5);
      // If not enough room on right of bracket, place slightly left/over bracket cleanly
      const pillX = bx + 5 + tw <= cssW - 3 ? lx : Math.max(4, cssW - tw - 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.strokeStyle = 'rgba(15, 118, 110, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(pillX, my - 8, tw, 16, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0F766E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + tw / 2, my);
      ctx.restore();
    }
  }

  // Bottom-left crisp physical scale bar
  {
    const barIn = isCm ? (zoomMode === 'macro' ? 1 / 2.54 : 2 / 2.54) : (zoomMode === 'macro' ? 0.5 : 1.0);
    const barPx = barIn * pxPerIn;
    const barLabel = isCm ? (zoomMode === 'macro' ? '1 cm' : '2 cm') : (zoomMode === 'macro' ? '0.50"' : '1.00"');
    const padX = 10;
    const padY = 10;
    const boxW = Math.max(barPx + 16, 62);
    const boxH = 26;
    const bx = padX;
    const by = cssH - padY - boxH;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 5);
    ctx.fill();
    ctx.stroke();

    const lineX0 = bx + (boxW - barPx) / 2;
    const lineY = by + 18;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(lineX0, lineY - 4);
    ctx.lineTo(lineX0, lineY + 1);
    ctx.lineTo(lineX0 + barPx, lineY + 1);
    ctx.lineTo(lineX0 + barPx, lineY - 4);
    ctx.stroke();

    ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillStyle = '#0F172A';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(barLabel, bx + boxW / 2, by + 8);
    ctx.restore();
  }

  ctx.restore();
  return { pxPerIn, viewWidthIn, viewHeightIn };
}

/**
 * Render a compact thumbnail data URL for the Saved Snapshots tray.
 */
export function renderThumbnailDataUrl(state, photoImg = null, width = 260, height = 165) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const thumbState = { ...state, showGrid: false, showRulers: false, showCenterlineGuide: false };
  renderStage(c, thumbState, { photoImg, showHandles: false });
  return c.toDataURL('image/png');
}

/**
 * Render a split-screen before/after comparison of stateA (left) vs stateB (right) on one canvas.
 */
export function renderSplitCompare(canvas, stateA, stateB, splitRatio = 0.5, photoImg = null) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 860;
  const cssH = canvas.clientHeight || 480;
  if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  // Render A onto offscreen canvas
  const offA = document.createElement('canvas');
  offA.width = cssW;
  offA.height = cssH;
  renderStage(offA, { ...stateA, showRulers: false }, { photoImg, showHandles: false });

  // Render B onto offscreen canvas
  const offB = document.createElement('canvas');
  offB.width = cssW;
  offB.height = cssH;
  renderStage(offB, { ...stateB, showRulers: false }, { photoImg, showHandles: false });

  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(dpr, dpr);
  const splitX = clamp(splitRatio, 0.05, 0.95) * cssW;

  // Left half = A
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, cssH);
  ctx.clip();
  ctx.drawImage(offA, 0, 0, cssW, cssH);
  ctx.restore();

  // Right half = B
  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, cssW - splitX, cssH);
  ctx.clip();
  ctx.drawImage(offB, 0, 0, cssW, cssH);
  ctx.restore();

  // Divider handle
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(splitX, 0);
  ctx.lineTo(splitX, cssH);
  ctx.stroke();

  ctx.fillStyle = '#0F172A';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(splitX, cssH / 2, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('◀ ▶', splitX, cssH / 2);

  ctx.restore();
}
