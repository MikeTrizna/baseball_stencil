/**
 * Main application controller for the Baseball Stitch Stencil Designer.
 */

import {
  computeDesignGeometry,
  buildReusableStencilTile,
  buildSingleFullHeightStripe,
  getPaintedWallSpanIn,
  computeMlbCurveForSpacing,
  computeMlbAmplitudeForCycles,
  computeMlbCyclesForAmplitude,
  computeCurveMetrics,
  clamp,
} from './geometry.js';
import {
  createDefaultState,
  STARTER_PRESETS,
  applyPresetToState,
  diffConfigs,
} from './presets.js';
import {
  loadSavedState,
  saveState,
  loadSnapshots,
  saveSnapshots,
  saveCustomPhotoDataUrl,
  loadCustomPhotoDataUrl,
  encodeStateToHash,
  decodeStateFromHash,
} from './storage.js';
import {
  renderStage,
  renderStitchZoom,
  renderThumbnailDataUrl,
  renderSplitCompare,
  getSampleRoomImage,
} from './renderer.js';
import {
  generateFullWallSVG,
  generateReusableTileSVG,
  generateSingleStripeSVG,
} from './svg-export.js';
import {
  computeSingleStripePdfPlan,
  generateSingleStripePDF,
  computeTiledPdfPlan,
  generateTiledStencilPDF,
  generateReusableStripPDF,
} from './pdf-export.js';

const $ = (id) => document.getElementById(id);

let state = loadSavedState(createDefaultState());
let snapshots = loadSnapshots();
let undoStack = [];
let redoStack = [];
let customPhotoImg = null;
let lastRenderResult = null;
let selectedObstacleId = null;

// Calibration state
let calibrationMode = false;
let calibStep = 0; // 1 = waiting for Point A, 2 = waiting for Point B

// Pointer drag state
let dragState = null;

// Compare modal state
let compareMode = 'side'; // 'side' | 'split'

function showToast(msg, durationMs = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add('hidden'), durationMs);
}

function fmtDim(inches, decimals = 2) {
  if (state.units === 'cm') {
    return `${(inches * 2.54).toFixed(decimals === 0 ? 0 : 1)} cm`;
  }
  return `${Number(inches).toFixed(decimals)}"`;
}

function pushUndoSnapshot() {
  undoStack.push(JSON.stringify(state));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function updateUndoButtons() {
  $('btn-undo').disabled = undoStack.length === 0;
  $('btn-redo').disabled = redoStack.length === 0;
}

function activePhotoImage() {
  if (state.photo.useSample || !customPhotoImg) {
    return getSampleRoomImage();
  }
  return customPhotoImg;
}

function commitAndRender() {
  saveState(state);
  syncControlsFromState();
  drawMainStage();
}

function mutateState(mutator, recordUndo = true) {
  if (recordUndo) pushUndoSnapshot();
  mutator(state);
  saveState(state);
  syncControlsFromState();
  drawMainStage();
}

function drawMainStage() {
  const canvas = $('stage-canvas');
  lastRenderResult = renderStage(canvas, state, {
    photoImg: activePhotoImage(),
    selectedObstacleId,
    calibrationMode,
    calibStep,
    showHandles: true,
  });
  updateStatsStrip(lastRenderResult.geom);

  if (state.showStitchZoom !== false) {
    const zoomRes = renderStitchZoom($('zoom-canvas'), state, lastRenderResult.geom);
    if (zoomRes && zoomRes.pxPerIn > 0 && lastRenderResult.viewport?.pxPerIn > 0) {
      const mag = zoomRes.pxPerIn / lastRenderResult.viewport.pxPerIn;
      $('zoom-scale-badge').textContent = `${mag >= 10 ? Math.round(mag) : mag.toFixed(1)}× wall`;
      $('zoom-panel-footer').innerHTML =
        `<span>View: ${fmtDim(zoomRes.viewWidthIn, 1)} × ${fmtDim(zoomRes.viewHeightIn, 1)}</span>` +
        `<span>Tip: ${state.stitch.tipStyle}</span>`;
    }
  }
}

function updateStatsStrip(geom) {
  const s = geom.stats;
  $('stat-stripes').textContent = `${s.stripeCount}`;
  $('stat-pairs').textContent = `${s.perStripePairs}/stripe (${s.pairCount})`;
  $('stat-band').textContent = fmtDim(s.bandWidthIn, 2);

  const bridgeEl = $('stat-bridge');
  const pillEl = $('stat-bridge-pill');
  bridgeEl.textContent = fmtDim(s.minBridgeIn, 2);
  pillEl.classList.remove('bridge-ok', 'bridge-warn', 'bridge-danger');
  if (s.pairCount === 0) {
    // neutral
  } else if (s.minBridgeIn < 0.08) {
    pillEl.classList.add('bridge-danger');
    bridgeEl.textContent += ' (touching!)';
  } else if (s.minBridgeIn < 0.18) {
    pillEl.classList.add('bridge-warn');
    bridgeEl.textContent += ' (delicate)';
  } else {
    pillEl.classList.add('bridge-ok');
  }
}

/**
 * Synchronize all sidebar inputs and visibility states from `state`.
 */
function syncControlsFromState() {
  const isPhoto = state.viewMode === 'photo';
  $('btn-mode-wall2d').classList.toggle('active', !isPhoto);
  $('btn-mode-photo').classList.toggle('active', isPhoto);
  $('btn-mode-wall2d').setAttribute('aria-selected', String(!isPhoto));
  $('btn-mode-photo').setAttribute('aria-selected', String(isPhoto));

  $('section-room-2d').classList.toggle('hidden', isPhoto);
  $('section-photo-mode').classList.toggle('hidden', !isPhoto);
  $('wall-color-wrap').classList.toggle('hidden', isPhoto);
  $('photo-blend-wrap').classList.toggle('hidden', !isPhoto);

  $('canvas-hint').textContent = calibrationMode
    ? calibStep === 1
      ? 'Calibration Step 1/2: Click the FIRST reference point on the photo'
      : 'Calibration Step 2/2: Click the SECOND reference point on the photo'
    : isPhoto
      ? 'Drag horizontally to shift stripes on photo • Click "Calibrate Scale" to lock real inches'
      : 'Drag horizontally to shift stripes • Drag furniture to move or resize';

  // Units
  $('btn-unit-in').classList.toggle('active', state.units === 'in');
  $('btn-unit-cm').classList.toggle('active', state.units === 'cm');

  // Active preset highlight
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.presetId === state.activePresetId);
  });

  // Stripe pattern controls
  const lt = state.layout.type;
  const isCurved = lt === 'curved-stripes';
  document.querySelectorAll('#layout-type-group .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.layout === lt);
  });
  $('layout-controls-curved').classList.toggle('hidden', !isCurved);

  $('ctrl-stripe-spacing').value = state.layout.stripeSpacingIn;
  $('val-stripe-spacing').textContent = fmtDim(state.layout.stripeSpacingIn, 1);

  $('ctrl-offset-x').value = state.layout.offsetX || 0;
  $('val-offset-x').textContent = fmtDim(state.layout.offsetX || 0, 1);

  $('ctrl-curve-amp').value = state.layout.curveAmplitudeIn ?? 1.95;
  $('val-curve-amp').textContent = fmtDim(state.layout.curveAmplitudeIn ?? 1.95, 2);

  const cycles = state.layout.curveCycles ?? 2.55;
  $('ctrl-curve-cycles').value = cycles;
  const cycleText = Number(cycles).toFixed(2).replace(/\.?0+$/, '');
  $('val-curve-cycles').textContent = `${cycleText} waves`;

  $('ctrl-lock-mlb').checked = Boolean(state.layout.lockBaseballCurve);
  if (isCurved) {
    const metrics = computeCurveMetrics(state.layout, state.wall);
    const gapText = metrics.opposing
      ? `Gap ${fmtDim(metrics.minGapIn, 1)}–${fmtDim(metrics.maxGapIn, 1)} (${Math.round(metrics.pinchRatioPct)}%) • ${Math.round(metrics.maxTiltDeg)}°`
      : `Wave ${fmtDim(metrics.waveHeightIn, 1)} • ${Math.round(metrics.maxTiltDeg)}°`;
    const badgeClass = metrics.isMlbMatch
      ? 'mlb-badge mlb-badge-match'
      : metrics.isMlbTilt
        ? 'mlb-badge mlb-badge-sweep'
        : 'mlb-badge mlb-badge-custom';
    const badgeLabel = metrics.isMlbMatch
      ? 'MLB Match'
      : metrics.isMlbTilt
        ? 'MLB Curve'
        : 'Custom';
    $('mlb-curve-readout').innerHTML = `<span>${gapText}</span><span class="${badgeClass}">${badgeLabel}</span>`;
  }

  document.querySelectorAll('#curve-style-group .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.curveStyle === (state.layout.curveStyle || 'opposing'));
  });
  $('ctrl-alt-dir').checked = Boolean(state.layout.alternateStitchDirection);
  $('ctrl-flip-dir').checked = Boolean(state.layout.flipDirection);

  // Stitch geometry
  $('ctrl-length').value = state.stitch.lengthIn;
  $('val-length').textContent = fmtDim(state.stitch.lengthIn, 2);
  $('ctrl-width').value = state.stitch.widthIn;
  $('val-width').textContent = fmtDim(state.stitch.widthIn, 2);
  $('ctrl-spacing').value = state.stitch.spacingIn;
  $('val-spacing').textContent = fmtDim(state.stitch.spacingIn, 2);
  $('ctrl-vangle').value = state.stitch.vAngleDeg;
  $('val-vangle').textContent = `${Math.round(state.stitch.vAngleDeg)}°`;
  $('ctrl-gap').value = state.stitch.centerGapIn;
  $('val-gap').textContent = fmtDim(state.stitch.centerGapIn, 2);
  $('ctrl-bow').value = state.stitch.bow;
  $('val-bow').textContent = `${Math.round(state.stitch.bow * 100)}%`;

  document.querySelectorAll('#tip-style-group .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tip === state.stitch.tipStyle);
  });
  $('ctrl-seam-line').checked = Boolean(state.stitch.showSeamLine);
  $('ctrl-lace-holes').checked = Boolean(state.stitch.showLaceHoles);

  // Colors & blend
  $('ctrl-stitch-color').value = state.stitch.color;
  document.querySelectorAll('[data-stitch-color]').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.stitchColor.toLowerCase() === state.stitch.color.toLowerCase());
  });
  $('ctrl-wall-color').value = state.wall.paintColor;
  document.querySelectorAll('[data-wall-color]').forEach((sw) => {
    sw.classList.toggle('active', sw.dataset.wallColor.toLowerCase() === state.wall.paintColor.toLowerCase());
  });
  $('ctrl-opacity').value = state.stitch.opacity ?? 0.94;
  $('val-opacity').textContent = `${Math.round((state.stitch.opacity ?? 0.94) * 100)}%`;
  $('ctrl-multiply').checked = Boolean(state.stitch.multiplyBlend);

  // Room dimensions
  $('ctrl-wall-w').value = state.wall.widthIn;
  $('ctrl-wall-h').value = state.wall.heightIn;
  $('ctrl-baseboard').value = state.wall.baseboardIn;
  $('ctrl-crown').value = state.wall.crownIn;
  $('ctrl-mask-furniture').checked = Boolean(state.maskBehindFurniture);

  // Stage checkboxes & Stitch Close-Up panel
  $('ctrl-show-grid').checked = Boolean(state.showGrid);
  $('ctrl-show-rulers').checked = Boolean(state.showRulers);
  $('ctrl-show-guide').checked = Boolean(state.showCenterlineGuide);

  const showZoom = state.showStitchZoom !== false;
  $('ctrl-show-zoom').checked = showZoom;
  $('zoom-panel').classList.toggle('hidden', !showZoom);
  const zoomLevel = state.stitchZoomLevel || 'detail';
  document.querySelectorAll('#zoom-level-group .seg-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.zoom === zoomLevel);
  });

  // Photo controls
  $('photo-name-label').textContent = state.photo.useSample
    ? 'Sample Kid Bedroom Wall'
    : (state.photo.photoName || 'Uploaded Wall Photo');
  $('calib-ppi-readout').textContent = `${Number(state.photo.pixelsPerInch).toFixed(1)} px/in`;
  $('ctrl-calib-dist').value = state.photo.calibDistanceIn;
  $('stage-canvas').classList.toggle('calibrating', calibrationMode);

  renderObstacleList();
}

function renderPresetButtons() {
  const container = $('preset-grid');
  container.innerHTML = '';
  for (const preset of STARTER_PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.presetId = preset.id;
    btn.innerHTML = `<span class="preset-name">${preset.name}</span><span class="preset-tag">${preset.tagline}</span>`;
    btn.addEventListener('click', () => {
      pushUndoSnapshot();
      state = applyPresetToState(state, preset.id);
      saveState(state);
      syncControlsFromState();
      drawMainStage();
      showToast(`Loaded preset: ${preset.name}`);
    });
    container.appendChild(btn);
  }
}

function renderObstacleList() {
  const list = $('obstacle-list');
  list.innerHTML = '';
  for (const obs of state.obstacles) {
    const row = document.createElement('div');
    row.className = `obstacle-item${obs.id === selectedObstacleId ? ' selected' : ''}`;

    const info = document.createElement('div');
    info.className = 'obstacle-item-info';
    info.innerHTML = `<strong>${obs.label}</strong> <span class="obstacle-item-dims">${Math.round(obs.w)}"×${Math.round(obs.h)}"</span>`;
    info.addEventListener('click', () => {
      selectedObstacleId = obs.id === selectedObstacleId ? null : obs.id;
      renderObstacleList();
      drawMainStage();
    });

    const visBtn = document.createElement('button');
    visBtn.className = 'icon-btn';
    visBtn.title = obs.visible ? 'Hide' : 'Show';
    visBtn.textContent = obs.visible ? '👁' : '🚫';
    visBtn.addEventListener('click', () => {
      mutateState((s) => {
        const target = s.obstacles.find((o) => o.id === obs.id);
        if (target) target.visible = !target.visible;
      });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Remove';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      mutateState((s) => {
        s.obstacles = s.obstacles.filter((o) => o.id !== obs.id);
        if (selectedObstacleId === obs.id) selectedObstacleId = null;
      });
    });

    row.append(info, visBtn, delBtn);
    list.appendChild(row);
  }
}

function renderSnapshotsTray() {
  const tray = $('snapshots-tray');
  tray.innerHTML = '';

  if (!snapshots.length) {
    const empty = document.createElement('div');
    empty.className = 'snapshot-empty';
    empty.textContent = 'No snapshots yet — click "Save Snapshot" above to pin your favorite ideas and compare them side-by-side!';
    tray.appendChild(empty);
    return;
  }

  for (const snap of snapshots) {
    const card = document.createElement('div');
    card.className = 'snapshot-card';

    const img = document.createElement('img');
    img.className = 'snapshot-thumb';
    img.src = snap.thumbDataUrl;
    img.alt = snap.name;
    img.addEventListener('click', () => loadSnapshot(snap.id));

    const info = document.createElement('div');
    info.className = 'snapshot-info';

    const title = document.createElement('div');
    title.className = 'snapshot-title';
    title.textContent = snap.name;
    title.title = 'Click to load snapshot';
    title.addEventListener('click', () => loadSnapshot(snap.id));

    const meta = document.createElement('div');
    meta.className = 'snapshot-meta';
    meta.textContent = snap.summary;

    const actions = document.createElement('div');
    actions.className = 'snapshot-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'btn btn-ghost btn-sm';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadSnapshot(snap.id));

    const cmpBtn = document.createElement('button');
    cmpBtn.className = 'btn btn-ghost btn-sm';
    cmpBtn.textContent = 'Compare';
    cmpBtn.addEventListener('click', () => openCompareModal('current', snap.id));

    const delBtn = document.createElement('button');
    delBtn.className = 'icon-btn';
    delBtn.title = 'Delete snapshot';
    delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => {
      snapshots = snapshots.filter((s) => s.id !== snap.id);
      saveSnapshots(snapshots);
      renderSnapshotsTray();
      showToast(`Deleted "${snap.name}"`);
    });

    actions.append(loadBtn, cmpBtn, delBtn);
    info.append(title, meta, actions);
    card.append(img, info);
    tray.appendChild(card);
  }
}

function loadSnapshot(snapId) {
  const snap = snapshots.find((s) => s.id === snapId);
  if (!snap) return;
  pushUndoSnapshot();
  const keepPhoto = structuredClone(state.photo);
  const keepView = state.viewMode;
  state = structuredClone(snap.config);
  state.photo = keepPhoto;
  state.viewMode = keepView;
  saveState(state);
  syncControlsFromState();
  drawMainStage();
  showToast(`Loaded "${snap.name}"`);
}

function saveCurrentAsSnapshot() {
  const kindLabel = state.layout.type === 'curved-stripes' ? 'Curved' : 'Straight';
  const defaultName = `Option ${snapshots.length + 1} (${kindLabel})`;
  const name = window.prompt('Name this design snapshot:', defaultName);
  if (!name || !name.trim()) return;

  const geom = computeDesignGeometry(state);
  const thumbDataUrl = renderThumbnailDataUrl(state, activePhotoImage());
  const snap = {
    id: `snap-${Date.now()}`,
    name: name.trim(),
    createdAt: new Date().toISOString(),
    summary: `${geom.stats.stripeCount} stripes @ ${state.layout.stripeSpacingIn}" • ${state.stitch.lengthIn.toFixed(2)}" stitches`,
    thumbDataUrl,
    config: structuredClone(state),
  };
  snapshots.unshift(snap);
  saveSnapshots(snapshots);
  renderSnapshotsTray();
  showToast(`Saved snapshot "${snap.name}"`);
}

/* ==================== COMPARE MODAL ==================== */

function getCompareOptionConfigs() {
  const opts = [
    { id: 'current', label: 'Current Design (Live)', config: state },
    ...snapshots.map((s) => ({ id: s.id, label: `Snapshot: ${s.name}`, config: s.config })),
  ];
  for (const p of STARTER_PRESETS) {
    opts.push({
      id: `preset:${p.id}`,
      label: `Preset: ${p.name}`,
      config: applyPresetToState(state, p.id),
    });
  }
  return opts;
}

function openCompareModal(defaultA = 'current', defaultB = null) {
  const opts = getCompareOptionConfigs();
  const selA = $('cmp-select-a');
  const selB = $('cmp-select-b');
  selA.innerHTML = '';
  selB.innerHTML = '';

  for (const o of opts) {
    selA.add(new Option(o.label, o.id));
    selB.add(new Option(o.label, o.id));
  }

  selA.value = defaultA;
  if (defaultB && opts.some((o) => o.id === defaultB)) {
    selB.value = defaultB;
  } else if (snapshots.length > 0) {
    selB.value = snapshots[0].id;
  } else {
    // Default to comparing Current against the opposite starter preset!
    const otherPreset = state.layout.type === 'straight-stripes' ? 'preset:curved-baseball' : 'preset:straight-vertical';
    selB.value = opts.some((o) => o.id === otherPreset) ? otherPreset : (opts[1]?.id || 'current');
  }

  $('modal-compare').classList.remove('hidden');
  requestAnimationFrame(renderCompareModal);
}

function renderCompareModal() {
  const opts = getCompareOptionConfigs();
  const itemA = opts.find((o) => o.id === $('cmp-select-a').value) || opts[0];
  const itemB = opts.find((o) => o.id === $('cmp-select-b').value) || opts[0];

  const cfgA = { ...itemA.config, viewMode: state.viewMode, photo: state.photo };
  const cfgB = { ...itemB.config, viewMode: state.viewMode, photo: state.photo };

  $('cmp-label-a').textContent = itemA.label;
  $('cmp-label-b').textContent = itemB.label;
  $('cmp-split-label-a').textContent = itemA.label;
  $('cmp-split-label-b').textContent = itemB.label;

  const isSplit = compareMode === 'split';
  $('btn-cmp-side').classList.toggle('active', !isSplit);
  $('btn-cmp-split').classList.toggle('active', isSplit);
  $('compare-view-side').classList.toggle('hidden', isSplit);
  $('compare-view-split').classList.toggle('hidden', !isSplit);

  const img = activePhotoImage();
  const geomA = computeDesignGeometry(cfgA);
  const geomB = computeDesignGeometry(cfgB);

  if (isSplit) {
    const ratio = parseFloat($('cmp-split-range').value);
    renderSplitCompare($('cmp-canvas-split'), cfgA, cfgB, ratio, img);
  } else {
    renderStage($('cmp-canvas-a'), { ...cfgA, showRulers: false }, { photoImg: img, showHandles: false, geomOverride: geomA });
    renderStage($('cmp-canvas-b'), { ...cfgB, showRulers: false }, { photoImg: img, showHandles: false, geomOverride: geomB });
  }

  const diffs = diffConfigs(cfgA, cfgB, geomA.stats, geomB.stats);
  const diffBox = $('cmp-diff-table');
  diffBox.innerHTML = '';
  if (!diffs.length) {
    diffBox.innerHTML = '<span class="helper-tip">These two designs have identical stripe and stitch parameters.</span>';
  } else {
    for (const d of diffs) {
      const pill = document.createElement('div');
      pill.className = 'diff-pill';
      pill.innerHTML = `<strong>${d.label}:</strong> ${d.a} → ${d.b}`;
      diffBox.appendChild(pill);
    }
  }
}

/* ==================== EXPORT MODAL ==================== */

function updateExportSummaries() {
  const pdfMode = $('exp-pdf-mode').value;
  $('exp-pdf-tiled-opts').classList.toggle('hidden', pdfMode === 'reusable');
  $('exp-pdf-orient-wrap').classList.toggle('hidden', pdfMode !== 'tiled');

  const overlapIn = parseFloat($('exp-pdf-overlap').value) || 0.5;

  if (pdfMode === 'reusable') {
    const tile = buildReusableStencilTile(state, 8.5, 11.0, 0.85);
    $('exp-pdf-summary').innerHTML =
      `<strong>1 page (Portrait 8.5"×11")</strong> with <strong>${tile.activeCount} cutout stitches</strong> + top &amp; bottom blue alignment ghost stitches. ${tile.note}`;
  } else if (pdfMode === 'single-stripe') {
    const plan = computeSingleStripePdfPlan(state, { overlapIn });
    $('exp-pdf-summary').innerHTML =
      `<strong>${plan.totalPages} pages total</strong> (1 cover sheet + ${plan.activeTiles.length} stacked vertical sheets). ` +
      `One full ceiling-to-baseboard stencil (${plan.stripe.heightIn.toFixed(1)}" tall).` +
      (plan.stripe.isCurved ? ' Flip left-to-right for opposing curved stripes!' : '');
  } else {
    const plan = computeTiledPdfPlan(state, {
      orientation: $('exp-pdf-orient').value,
      overlapIn,
      skipEmptyPages: true,
    });
    const skipped = plan.totalGridCells - plan.activeTiles.length;
    $('exp-pdf-summary').innerHTML =
      `<strong>${plan.totalPages} pages total</strong> (1 cover + ${plan.activeTiles.length} stencil tiles, ${skipped} blank tiles skipped).`;
  }

  const svgMode = $('exp-svg-mode').value;
  if (svgMode === 'full-wall') {
    const geom = computeDesignGeometry(state);
    $('exp-svg-summary').innerHTML =
      `Full wall <strong>${state.wall.widthIn.toFixed(1)}" × ${state.wall.heightIn.toFixed(1)}"</strong> SVG with <strong>${geom.stats.stripeCount} stripes</strong> (${geom.stats.pairCount} stitch pairs).`;
  } else if (svgMode === 'single-stripe') {
    const stripe = buildSingleFullHeightStripe(state, 1.25);
    $('exp-svg-summary').innerHTML =
      `Single full-height vertical stripe <strong>${stripe.widthIn.toFixed(2)}" × ${stripe.heightIn.toFixed(1)}"</strong> (${stripe.pairs.length} stitch pairs).`;
  } else {
    const dims = svgMode === 'tile-12x24' ? [11.5, 23.5] : svgMode === 'tile-letter' ? [8.5, 11.0] : [11.5, 11.5];
    const tile = buildReusableStencilTile(state, dims[0], dims[1], 0.65);
    $('exp-svg-summary').innerHTML =
      `<strong>${dims[0]}" × ${dims[1]}"</strong> vertical strip with <strong>${tile.activeCount} cutout stitches</strong> + top/bottom alignment ghosts. Advance <strong>${tile.shiftDistIn.toFixed(2)}"</strong> per pass.`;
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ==================== CANVAS INTERACTION ==================== */

function getCanvasPoint(e) {
  const canvas = $('stage-canvas');
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

function hitTestCanvas(cx, cy) {
  if (!lastRenderResult) return null;
  const vp = lastRenderResult.viewport;

  if (state.viewMode === 'wall2d') {
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obs = state.obstacles[i];
      if (!obs.visible) continue;
      const [x, y] = vp.wallToCanvas(obs.x, obs.y);
      const w = obs.w * vp.pxPerIn;
      const h = obs.h * vp.pxPerIn;

      if (obs.id === selectedObstacleId && Math.abs(cx - (x + w)) <= 11 && Math.abs(cy - (y + h)) <= 11) {
        return { kind: 'obstacle-resize', id: obs.id };
      }
      if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
        return { kind: 'obstacle-move', id: obs.id };
      }
    }
  }

  return { kind: 'stripe-shift' };
}

function setupCanvasInteractions() {
  const canvas = $('stage-canvas');

  canvas.addEventListener('pointerdown', (e) => {
    const [cx, cy] = getCanvasPoint(e);

    if (calibrationMode && state.viewMode === 'photo' && lastRenderResult) {
      const vp = lastRenderResult.viewport;
      const [px, py] = vp.canvasToPhotoPx(cx, cy);
      if (calibStep === 1) {
        state.photo.calibPtA = [px, py];
        calibStep = 2;
        $('calib-status').textContent = 'Point A set! Now click Point B (the other end of your measured reference).';
        syncControlsFromState();
        drawMainStage();
      } else if (calibStep === 2) {
        state.photo.calibPtB = [px, py];
        const distPx = Math.hypot(
          state.photo.calibPtB[0] - state.photo.calibPtA[0],
          state.photo.calibPtB[1] - state.photo.calibPtA[1]
        );
        const distIn = Math.max(1, parseFloat($('ctrl-calib-dist').value) || 48);
        if (distPx > 5) {
          pushUndoSnapshot();
          state.photo.calibDistanceIn = distIn;
          state.photo.pixelsPerInch = distPx / distIn;
          const img = activePhotoImage();
          const imgW = img.naturalWidth || img.width;
          const imgH = img.naturalHeight || img.height;
          state.wall.widthIn = Number((imgW / state.photo.pixelsPerInch).toFixed(1));
          state.wall.heightIn = Number((imgH / state.photo.pixelsPerInch).toFixed(1));
          if (state.layout.type === 'curved-stripes' && state.layout.lockBaseballCurve) {
            state.layout.curveCycles = computeMlbCyclesForAmplitude(
              state.layout.curveAmplitudeIn,
              getPaintedWallSpanIn(state.wall)
            );
          }
          state.photo.originPxX = 0;
          state.photo.originPxY = 0;
          calibrationMode = false;
          calibStep = 0;
          $('calib-status').classList.add('hidden');
          saveState(state);
          syncControlsFromState();
          drawMainStage();
          showToast(`Calibrated! ${state.photo.pixelsPerInch.toFixed(1)} px/in (${state.wall.widthIn}"×${state.wall.heightIn}" view)`);
        }
      }
      return;
    }

    const hit = hitTestCanvas(cx, cy);
    if (!hit) return;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('dragging');

    const vp = lastRenderResult.viewport;
    const [wx, wy] = vp.canvasToWall(cx, cy);

    if (hit.kind === 'obstacle-move' || hit.kind === 'obstacle-resize') {
      selectedObstacleId = hit.id;
      const obs = state.obstacles.find((o) => o.id === hit.id);
      pushUndoSnapshot();
      dragState = {
        ...hit,
        startWX: wx,
        startWY: wy,
        origX: obs.x,
        origY: obs.y,
        origW: obs.w,
        origH: obs.h,
      };
      renderObstacleList();
      drawMainStage();
    } else if (hit.kind === 'stripe-shift') {
      if (selectedObstacleId) {
        selectedObstacleId = null;
        renderObstacleList();
      }
      pushUndoSnapshot();
      dragState = {
        kind: 'stripe-shift',
        startWX: wx,
        origOX: state.layout.offsetX || 0,
      };
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!dragState || !lastRenderResult) return;
    const [cx, cy] = getCanvasPoint(e);
    const vp = lastRenderResult.viewport;
    const [wx, wy] = vp.canvasToWall(cx, cy);
    const dx = wx - dragState.startWX;
    const dy = wy - dragState.startWY;

    if (dragState.kind === 'obstacle-move') {
      const obs = state.obstacles.find((o) => o.id === dragState.id);
      if (obs) {
        obs.x = Number(clamp(dragState.origX + dx, 0, Math.max(0, state.wall.widthIn - obs.w)).toFixed(1));
        obs.y = Number(clamp(dragState.origY + dy, 0, Math.max(0, state.wall.heightIn - obs.h)).toFixed(1));
      }
    } else if (dragState.kind === 'obstacle-resize') {
      const obs = state.obstacles.find((o) => o.id === dragState.id);
      if (obs) {
        obs.w = Number(clamp(dragState.origW + dx, 6, state.wall.widthIn - obs.x).toFixed(1));
        obs.h = Number(clamp(dragState.origH + dy, 4, state.wall.heightIn - obs.y).toFixed(1));
      }
    } else if (dragState.kind === 'stripe-shift') {
      state.layout.offsetX = Number(clamp(dragState.origOX + dx, -18, 18).toFixed(1));
      $('ctrl-offset-x').value = state.layout.offsetX;
      $('val-offset-x').textContent = fmtDim(state.layout.offsetX, 1);
    }

    drawMainStage();
  });

  const endDrag = () => {
    if (!dragState) return;
    dragState = null;
    canvas.classList.remove('dragging');
    saveState(state);
    renderObstacleList();
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
}

/* ==================== WIRE ALL CONTROLS ==================== */

function bindRange(id, setter) {
  const el = $(id);
  let pushed = false;
  el.addEventListener('pointerdown', () => { pushed = false; });
  el.addEventListener('change', () => { pushed = false; });
  el.addEventListener('input', () => {
    if (!pushed) {
      pushUndoSnapshot();
      pushed = true;
    }
    setter(parseFloat(el.value));
    state.activePresetId = null;
    saveState(state);
    syncControlsFromState();
    drawMainStage();
  });
}

function bindControls() {
  $('btn-mode-wall2d').addEventListener('click', () => {
    calibrationMode = false;
    calibStep = 0;
    $('calib-status').classList.add('hidden');
    mutateState((s) => { s.viewMode = 'wall2d'; }, false);
  });
  $('btn-mode-photo').addEventListener('click', () => {
    mutateState((s) => { s.viewMode = 'photo'; }, false);
  });

  $('btn-undo').addEventListener('click', () => {
    if (!undoStack.length) return;
    redoStack.push(JSON.stringify(state));
    state = JSON.parse(undoStack.pop());
    updateUndoButtons();
    commitAndRender();
  });
  $('btn-redo').addEventListener('click', () => {
    if (!redoStack.length) return;
    undoStack.push(JSON.stringify(state));
    state = JSON.parse(redoStack.pop());
    updateUndoButtons();
    commitAndRender();
  });

  $('btn-unit-in').addEventListener('click', () => mutateState((s) => { s.units = 'in'; }, false));
  $('btn-unit-cm').addEventListener('click', () => mutateState((s) => { s.units = 'cm'; }, false));

  document.querySelectorAll('#layout-type-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mutateState((s) => {
        s.layout.type = btn.dataset.layout;
        if (s.layout.type === 'curved-stripes' && s.layout.lockBaseballCurve) {
          const mlb = computeMlbCurveForSpacing(s.layout.stripeSpacingIn, getPaintedWallSpanIn(s.wall));
          s.layout.curveAmplitudeIn = mlb.curveAmplitudeIn;
          s.layout.curveCycles = mlb.curveCycles;
        }
        s.activePresetId = null;
      });
    });
  });

  $('btn-center-seam').addEventListener('click', () => {
    mutateState((s) => { s.layout.offsetX = 0; });
  });

  $('ctrl-lock-mlb').addEventListener('change', (e) => {
    const locked = e.target.checked;
    mutateState((s) => {
      s.layout.lockBaseballCurve = locked;
      if (locked) {
        const mlb = computeMlbCurveForSpacing(s.layout.stripeSpacingIn, getPaintedWallSpanIn(s.wall));
        s.layout.curveAmplitudeIn = mlb.curveAmplitudeIn;
        s.layout.curveCycles = mlb.curveCycles;
      }
      s.activePresetId = null;
    });
    if (locked) {
      showToast('Locked to official MLB baseball curve proportions');
    }
  });

  $('btn-snap-mlb').addEventListener('click', () => {
    mutateState((s) => {
      const mlb = computeMlbCurveForSpacing(s.layout.stripeSpacingIn, getPaintedWallSpanIn(s.wall));
      s.layout.curveAmplitudeIn = mlb.curveAmplitudeIn;
      s.layout.curveCycles = mlb.curveCycles;
      s.activePresetId = null;
    });
    showToast('Snapped curve to official MLB proportions for current spacing');
  });

  bindRange('ctrl-stripe-spacing', (v) => {
    state.layout.stripeSpacingIn = v;
    if (state.layout.type === 'curved-stripes' && state.layout.lockBaseballCurve) {
      const mlb = computeMlbCurveForSpacing(v, getPaintedWallSpanIn(state.wall));
      state.layout.curveAmplitudeIn = mlb.curveAmplitudeIn;
      state.layout.curveCycles = mlb.curveCycles;
    }
  });
  bindRange('ctrl-offset-x', (v) => { state.layout.offsetX = v; });
  bindRange('ctrl-curve-amp', (v) => {
    state.layout.curveAmplitudeIn = v;
    if (state.layout.lockBaseballCurve) {
      state.layout.curveCycles = computeMlbCyclesForAmplitude(v, getPaintedWallSpanIn(state.wall));
    }
  });
  bindRange('ctrl-curve-cycles', (v) => {
    state.layout.curveCycles = v;
    if (state.layout.lockBaseballCurve) {
      state.layout.curveAmplitudeIn = computeMlbAmplitudeForCycles(v, getPaintedWallSpanIn(state.wall));
    }
  });

  document.querySelectorAll('#curve-style-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mutateState((s) => {
        s.layout.curveStyle = btn.dataset.curveStyle;
        s.activePresetId = null;
      });
    });
  });

  $('ctrl-alt-dir').addEventListener('change', (e) => {
    mutateState((s) => { s.layout.alternateStitchDirection = e.target.checked; });
  });
  $('ctrl-flip-dir').addEventListener('change', (e) => {
    mutateState((s) => { s.layout.flipDirection = e.target.checked; });
  });

  // Stitch sliders
  bindRange('ctrl-length', (v) => { state.stitch.lengthIn = v; });
  bindRange('ctrl-width', (v) => { state.stitch.widthIn = v; });
  bindRange('ctrl-spacing', (v) => { state.stitch.spacingIn = v; });
  bindRange('ctrl-vangle', (v) => { state.stitch.vAngleDeg = v; });
  bindRange('ctrl-gap', (v) => { state.stitch.centerGapIn = v; });
  bindRange('ctrl-bow', (v) => { state.stitch.bow = v; });

  document.querySelectorAll('#tip-style-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mutateState((s) => {
        s.stitch.tipStyle = btn.dataset.tip;
        s.activePresetId = null;
      });
    });
  });

  $('ctrl-seam-line').addEventListener('change', (e) => {
    mutateState((s) => { s.stitch.showSeamLine = e.target.checked; });
  });
  $('ctrl-lace-holes').addEventListener('change', (e) => {
    mutateState((s) => { s.stitch.showLaceHoles = e.target.checked; });
  });

  // Colors & blend
  document.querySelectorAll('[data-stitch-color]').forEach((sw) => {
    sw.addEventListener('click', () => mutateState((s) => { s.stitch.color = sw.dataset.stitchColor; }));
  });
  $('ctrl-stitch-color').addEventListener('input', (e) => mutateState((s) => { s.stitch.color = e.target.value; }, false));

  document.querySelectorAll('[data-wall-color]').forEach((sw) => {
    sw.addEventListener('click', () => mutateState((s) => { s.wall.paintColor = sw.dataset.wallColor; }));
  });
  $('ctrl-wall-color').addEventListener('input', (e) => mutateState((s) => { s.wall.paintColor = e.target.value; }, false));

  bindRange('ctrl-opacity', (v) => { state.stitch.opacity = v; });
  $('ctrl-multiply').addEventListener('change', (e) => mutateState((s) => { s.stitch.multiplyBlend = e.target.checked; }));

  // Room dimensions
  const syncWallHeightMlbCurve = (s) => {
    if (s.layout.type === 'curved-stripes' && s.layout.lockBaseballCurve) {
      s.layout.curveCycles = computeMlbCyclesForAmplitude(
        s.layout.curveAmplitudeIn,
        getPaintedWallSpanIn(s.wall)
      );
    }
  };
  $('ctrl-wall-w').addEventListener('change', (e) => mutateState((s) => { s.wall.widthIn = clamp(parseFloat(e.target.value) || 144, 48, 360); }));
  $('ctrl-wall-h').addEventListener('change', (e) => mutateState((s) => {
    s.wall.heightIn = clamp(parseFloat(e.target.value) || 96, 48, 180);
    syncWallHeightMlbCurve(s);
  }));
  $('ctrl-baseboard').addEventListener('change', (e) => mutateState((s) => {
    s.wall.baseboardIn = clamp(parseFloat(e.target.value) || 0, 0, 16);
    syncWallHeightMlbCurve(s);
  }));
  $('ctrl-crown').addEventListener('change', (e) => mutateState((s) => {
    s.wall.crownIn = clamp(parseFloat(e.target.value) || 0, 0, 12);
    syncWallHeightMlbCurve(s);
  }));
  $('ctrl-mask-furniture').addEventListener('change', (e) => mutateState((s) => { s.maskBehindFurniture = e.target.checked; }));

  // Add furniture obstacle
  $('btn-add-obstacle').addEventListener('click', () => {
    const choice = $('select-new-obstacle').value;
    const templates = {
      bed: { type: 'bed', label: 'Twin Bed', w: 42, h: 44, yFloor: 0 },
      'bed-full': { type: 'bed', label: 'Full Bed', w: 56, h: 46, yFloor: 0 },
      'bed-toddler': { type: 'bed', label: 'Toddler Bed', w: 30, h: 34, yFloor: 0 },
      window: { type: 'window', label: 'Window', w: 32, h: 44, yFloor: 34 },
      door: { type: 'door', label: 'Door', w: 32, h: 80, yFloor: 0 },
      dresser: { type: 'dresser', label: 'Dresser', w: 42, h: 34, yFloor: 0 },
      shelf: { type: 'shelf', label: 'Wall Shelf', w: 36, h: 6, yFloor: 56 },
    };
    const tpl = templates[choice] || templates.bed;
    const id = `obs-${Date.now()}`;
    mutateState((s) => {
      const y = clamp(s.wall.heightIn - tpl.h - tpl.yFloor, 0, Math.max(0, s.wall.heightIn - tpl.h));
      const x = clamp((s.wall.widthIn - tpl.w) / 2, 0, Math.max(0, s.wall.widthIn - tpl.w));
      s.obstacles.push({ id, type: tpl.type, label: tpl.label, x, y, w: tpl.w, h: tpl.h, visible: true });
      selectedObstacleId = id;
    });
  });

  // Stage checkboxes & Stitch Close-Up controls
  $('ctrl-show-grid').addEventListener('change', (e) => mutateState((s) => { s.showGrid = e.target.checked; }, false));
  $('ctrl-show-rulers').addEventListener('change', (e) => mutateState((s) => { s.showRulers = e.target.checked; }, false));
  $('ctrl-show-guide').addEventListener('change', (e) => mutateState((s) => { s.showCenterlineGuide = e.target.checked; }, false));
  $('ctrl-show-zoom').addEventListener('change', (e) => {
    mutateState((s) => { s.showStitchZoom = e.target.checked; }, false);
    requestAnimationFrame(drawMainStage);
  });
  $('btn-close-zoom').addEventListener('click', () => {
    mutateState((s) => { s.showStitchZoom = false; }, false);
    requestAnimationFrame(drawMainStage);
  });
  document.querySelectorAll('#zoom-level-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      mutateState((s) => { s.stitchZoomLevel = btn.dataset.zoom; }, false);
    });
  });

  // Photo upload & calibration
  $('btn-upload-photo').addEventListener('click', () => $('input-photo-file').click());
  $('input-photo-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        customPhotoImg = img;
        saveCustomPhotoDataUrl(dataUrl);
        mutateState((s) => {
          s.photo.useSample = false;
          s.photo.hasCustomPhoto = true;
          s.photo.photoName = file.name;
          s.photo.naturalWidth = img.naturalWidth;
          s.photo.naturalHeight = img.naturalHeight;
          s.photo.pixelsPerInch = img.naturalWidth / s.wall.widthIn;
          s.photo.originPxX = 0;
          s.photo.originPxY = 0;
          s.photo.calibPtA = [img.naturalWidth * 0.25, img.naturalHeight * 0.5];
          s.photo.calibPtB = [img.naturalWidth * 0.75, img.naturalHeight * 0.5];
        });
        showToast('Photo loaded! Click "Calibrate Scale" to set exact inches.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });

  $('btn-use-sample-photo').addEventListener('click', () => {
    mutateState((s) => {
      s.photo.useSample = true;
      s.photo.pixelsPerInch = 1600 / 144;
      s.photo.originPxX = 0;
      s.photo.originPxY = 0;
      s.photo.calibPtA = [360, 520];
      s.photo.calibPtB = [893.3, 520];
      s.photo.calibDistanceIn = 48;
    });
    showToast('Switched to built-in Sample Bedroom Wall');
  });

  $('btn-start-calib').addEventListener('click', () => {
    calibrationMode = !calibrationMode;
    calibStep = calibrationMode ? 1 : 0;
    const statusEl = $('calib-status');
    if (calibrationMode) {
      statusEl.textContent = 'Step 1/2: Click Point A on the wall photo (e.g., left painter\'s tape mark).';
      statusEl.classList.remove('hidden');
    } else {
      statusEl.classList.add('hidden');
    }
    syncControlsFromState();
    drawMainStage();
  });

  $('ctrl-calib-dist').addEventListener('change', (e) => {
    const val = Math.max(1, parseFloat(e.target.value) || 48);
    state.photo.calibDistanceIn = val;
    if (state.photo.calibPtA && state.photo.calibPtB) {
      const distPx = Math.hypot(
        state.photo.calibPtB[0] - state.photo.calibPtA[0],
        state.photo.calibPtB[1] - state.photo.calibPtA[1]
      );
      if (distPx > 5) {
        state.photo.pixelsPerInch = distPx / val;
      }
    }
    saveState(state);
    syncControlsFromState();
    drawMainStage();
  });

  // Snapshots, Compare & Shareable URL Link
  $('btn-save-snapshot').addEventListener('click', saveCurrentAsSnapshot);
  $('btn-compare').addEventListener('click', () => openCompareModal('current'));
  $('btn-share-link').addEventListener('click', async () => {
    const hash = encodeStateToHash(state);
    const shareUrl = `${window.location.origin}${window.location.pathname}${hash}`;
    try {
      window.history.replaceState(null, '', hash);
    } catch {
      // Ignore if running from restricted context
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showToast('Share link copied! Send it to share this exact design.');
      } else {
        window.prompt('Copy this shareable design link:', shareUrl);
      }
    } catch {
      window.prompt('Copy this shareable design link:', shareUrl);
    }
  });
  $('cmp-select-a').addEventListener('change', renderCompareModal);
  $('cmp-select-b').addEventListener('change', renderCompareModal);
  $('btn-cmp-side').addEventListener('click', () => { compareMode = 'side'; renderCompareModal(); });
  $('btn-cmp-split').addEventListener('click', () => { compareMode = 'split'; renderCompareModal(); });
  $('cmp-split-range').addEventListener('input', renderCompareModal);

  // Measurement guide modal
  $('btn-guide').addEventListener('click', () => $('modal-guide').classList.remove('hidden'));

  // Export modal
  $('btn-export').addEventListener('click', () => {
    // Auto-select the smartest PDF mode for current layout
    $('exp-pdf-mode').value = state.layout.type === 'curved-stripes' ? 'single-stripe' : 'reusable';
    updateExportSummaries();
    $('modal-export').classList.remove('hidden');
  });
  ['exp-pdf-mode', 'exp-pdf-orient', 'exp-pdf-overlap', 'exp-svg-mode'].forEach((id) => {
    $(id).addEventListener('change', updateExportSummaries);
  });

  $('btn-download-pdf').addEventListener('click', () => {
    const mode = $('exp-pdf-mode').value;
    const inkSaver = $('exp-pdf-inksaver').checked;
    const includeCenterline = $('exp-pdf-centerline').checked;
    const overlapIn = parseFloat($('exp-pdf-overlap').value) || 0.5;

    if (mode === 'reusable') {
      const res = generateReusableStripPDF(state, { inkSaver });
      triggerDownload(new Blob([res.bytes], { type: 'application/pdf' }), 'baseball-stencil-reusable-vertical-strip.pdf');
      showToast('Downloaded 1:1 Reusable Vertical Stencil Strip PDF!');
    } else if (mode === 'single-stripe') {
      const res = generateSingleStripePDF(state, { overlapIn, inkSaver, includeCenterline });
      triggerDownload(new Blob([res.bytes], { type: 'application/pdf' }), `baseball-stencil-single-stripe-${state.layout.type}.pdf`);
      showToast(`Downloaded ${res.pageCount}-page Single Vertical Stripe PDF!`);
    } else {
      const res = generateTiledStencilPDF(state, {
        orientation: $('exp-pdf-orient').value,
        overlapIn,
        inkSaver,
        includeCenterline,
        skipEmptyPages: true,
      });
      triggerDownload(new Blob([res.bytes], { type: 'application/pdf' }), `baseball-stencil-full-wall-${state.layout.type}.pdf`);
      showToast(`Downloaded ${res.pageCount}-page Full-Wall Tiled PDF!`);
    }
  });

  $('btn-download-svg').addEventListener('click', () => {
    const mode = $('exp-svg-mode').value;
    const outlineOnly = $('exp-svg-outline').checked;

    if (mode === 'full-wall') {
      const res = generateFullWallSVG(state, { outlineOnly });
      triggerDownload(new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' }), `baseball-stencil-full-wall-${state.layout.type}.svg`);
      showToast(`Downloaded 1:1 Full-Wall SVG (${res.stitchPairs} stitch pairs)!`);
    } else if (mode === 'single-stripe') {
      const res = generateSingleStripeSVG(state, { outlineOnly });
      triggerDownload(new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' }), `baseball-stencil-single-stripe-${state.layout.type}.svg`);
      showToast(`Downloaded 1:1 Single Vertical Stripe SVG (${res.stitchPairs} stitches)!`);
    } else {
      const dims = mode === 'tile-12x24' ? [11.5, 23.5] : mode === 'tile-letter' ? [8.5, 11.0] : [11.5, 11.5];
      const res = generateReusableTileSVG(state, {
        sheetWidthIn: dims[0],
        sheetHeightIn: dims[1],
        outlineOnly,
      });
      triggerDownload(new Blob([res.svg], { type: 'image/svg+xml;charset=utf-8' }), `baseball-stencil-vertical-${mode}.svg`);
      showToast(`Downloaded 1:1 Vertical Stencil SVG (${res.activeCount} stitches)!`);
    }
  });

  // Project JSON backup
  $('btn-export-json').addEventListener('click', () => {
    const payload = JSON.stringify({ state, snapshots }, null, 2);
    triggerDownload(new Blob([payload], { type: 'application/json' }), 'baseball-stencil-project.json');
    showToast('Saved project JSON backup');
  });
  $('btn-import-json').addEventListener('click', () => $('input-json-file').click());
  $('input-json-file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (parsed.state) {
          pushUndoSnapshot();
          state = { ...createDefaultState(), ...parsed.state };
          saveState(state);
        }
        if (Array.isArray(parsed.snapshots)) {
          snapshots = parsed.snapshots;
          saveSnapshots(snapshots);
        }
        syncControlsFromState();
        renderSnapshotsTray();
        drawMainStage();
        showToast('Project file loaded!');
      } catch {
        showToast('Invalid project JSON file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // Modal close handlers
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      $(btn.dataset.closeModal).classList.add('hidden');
    });
  });
  document.querySelectorAll('.modal').forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) $('btn-redo').click();
      else $('btn-undo').click();
    } else if (e.key === 'Escape') {
      document.querySelectorAll('.modal').forEach((m) => m.classList.add('hidden'));
      if (calibrationMode) {
        calibrationMode = false;
        calibStep = 0;
        $('calib-status').classList.add('hidden');
        syncControlsFromState();
        drawMainStage();
      }
    } else if (e.key.toLowerCase() === 'g') {
      mutateState((s) => { s.showGrid = !s.showGrid; }, false);
    }
  });

  window.addEventListener('resize', () => {
    drawMainStage();
    if (!$('modal-compare').classList.contains('hidden')) {
      renderCompareModal();
    }
  });
}

async function init() {
  // If opened via a shared URL (#d=...), load that design cleanly on top of defaults
  const shared = decodeStateFromHash(window.location.hash, createDefaultState());
  if (shared) {
    state = shared;
    saveState(state);
  }

  renderPresetButtons();
  bindControls();
  setupCanvasInteractions();
  updateUndoButtons();

  window.addEventListener('hashchange', () => {
    const nextShared = decodeStateFromHash(window.location.hash, createDefaultState());
    if (nextShared) {
      pushUndoSnapshot();
      state = nextShared;
      saveState(state);
      syncControlsFromState();
      drawMainStage();
      showToast('Loaded shared design from link!');
    }
  });

  const savedPhoto = await loadCustomPhotoDataUrl();
  if (savedPhoto) {
    const img = new Image();
    img.onload = () => {
      customPhotoImg = img;
      drawMainStage();
    };
    img.src = savedPhoto;
  }

  syncControlsFromState();
  renderSnapshotsTray();
  drawMainStage();

  if (shared) {
    showToast('Loaded shared design from link!');
  }
}

init();
