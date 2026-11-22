/**
 * Two focused starter presets ("Straight vertical stitches" and "Curved baseball stitches"),
 * default state factory, and snapshot comparison diff utility.
 */

import { getPaintedWallSpanIn, computeMlbCurveForSpacing } from './geometry.js';

export function createDefaultState() {
  return {
    version: 2,
    activePresetId: 'straight-vertical',
    viewMode: 'wall2d', // 'wall2d' | 'photo'
    units: 'in', // 'in' | 'cm'
    showGrid: true,
    showRulers: true,
    showCenterlineGuide: false,
    maskBehindFurniture: true,
    wall: {
      widthIn: 144, // 12 ft
      heightIn: 96, // 8 ft
      baseboardIn: 4.5,
      crownIn: 0,
      clipStitchesToTrim: true,
      paintColor: '#FAFAFA', // Crisp white like the inspiration wallpaper
      trimColor: '#FFFFFF',
    },
    layout: {
      type: 'straight-stripes', // 'straight-stripes' | 'curved-stripes'
      stripeSpacingIn: 12, // Distance between vertical stripes (in)
      offsetX: 0,
      curveAmplitudeIn: 1.8, // Official MLB ~15% of stripe spacing (in)
      curveCycles: 2.75, // Official MLB ~2.75x wavelength on 91.5" painted wall
      lockBaseballCurve: true, // Keep Curve Amount & Waves locked to authentic MLB baseball proportions
      curveStyle: 'opposing', // 'opposing' | 'parallel'
      curvePhaseDeg: 0,
      flipDirection: false, // false = Vs pointing downward like inspiration wallpaper
      alternateStitchDirection: false,
    },
    stitch: {
      lengthIn: 0.65,
      widthIn: 0.16,
      vAngleDeg: 42,
      spacingIn: 0.7,
      centerGapIn: 0.14,
      tipStyle: 'tapered', // 'tapered' | 'rounded' | 'square'
      bow: 0.06,
      phaseOffsetIn: 0,
      showSeamLine: false,
      seamLineWidthIn: 0.05,
      seamLineColor: '#D6D3CD',
      showLaceHoles: false,
      color: '#C8102E', // Classic baseball stitch red
      opacity: 0.94,
      multiplyBlend: true,
    },
    obstacles: [
      {
        id: 'obs-bed',
        type: 'bed',
        label: 'Twin Bed',
        x: 51,
        y: 52,
        w: 42,
        h: 44,
        visible: true,
      },
      {
        id: 'obs-window',
        type: 'window',
        label: 'Window',
        x: 102,
        y: 16,
        w: 32,
        h: 44,
        visible: true,
      },
    ],
    photo: {
      useSample: true,
      hasCustomPhoto: false,
      photoName: 'Sample Kid Bedroom Wall',
      naturalWidth: 1600,
      naturalHeight: 1067,
      pixelsPerInch: 11.111, // 1600 / 144"
      originPxX: 0,
      originPxY: 0,
      calibPtA: [360, 520],
      calibPtB: [893.3, 520],
      calibDistanceIn: 48,
    },
  };
}

export const STARTER_PRESETS = [
  {
    id: 'straight-vertical',
    name: 'Straight vertical stitches',
    tagline: 'Clean vertical pinstripe baseball stitches like the inspiration wallpaper',
    patch: {
      layout: {
        type: 'straight-stripes',
        stripeSpacingIn: 12,
        offsetX: 0,
        flipDirection: false,
        alternateStitchDirection: false,
      },
      stitch: {
        lengthIn: 0.65,
        widthIn: 0.16,
        vAngleDeg: 42,
        spacingIn: 0.7,
        centerGapIn: 0.14,
        tipStyle: 'tapered',
        bow: 0.06,
        showSeamLine: false,
        showLaceHoles: false,
        color: '#C8102E',
      },
    },
  },
  {
    id: 'curved-baseball',
    name: 'Curved baseball stitches',
    tagline: 'Vertical stitch stripes with official MLB baseball-seam proportions',
    patch: {
      layout: {
        type: 'curved-stripes',
        stripeSpacingIn: 13,
        offsetX: 0,
        curveAmplitudeIn: 1.95,
        curveCycles: 2.55,
        lockBaseballCurve: true,
        curveStyle: 'opposing',
        curvePhaseDeg: 0,
        flipDirection: false,
        alternateStitchDirection: true,
      },
      stitch: {
        lengthIn: 0.75,
        widthIn: 0.18,
        vAngleDeg: 40,
        spacingIn: 0.8,
        centerGapIn: 0.16,
        tipStyle: 'tapered',
        bow: 0.08,
        showSeamLine: false,
        showLaceHoles: false,
        color: '#C8102E',
      },
    },
  },
];

export function applyPresetToState(state, presetId) {
  const preset = STARTER_PRESETS.find((p) => p.id === presetId);
  if (!preset) return state;

  const next = structuredClone(state);
  next.activePresetId = preset.id;
  if (preset.patch.layout) {
    next.layout = { ...next.layout, ...structuredClone(preset.patch.layout) };
  }
  if (preset.patch.stitch) {
    next.stitch = { ...next.stitch, ...structuredClone(preset.patch.stitch) };
  }
  if (next.layout.type === 'curved-stripes' && next.layout.lockBaseballCurve) {
    const mlb = computeMlbCurveForSpacing(next.layout.stripeSpacingIn, getPaintedWallSpanIn(next.wall));
    next.layout.curveAmplitudeIn = mlb.curveAmplitudeIn;
    next.layout.curveCycles = mlb.curveCycles;
  }
  return next;
}

const LAYOUT_LABELS = {
  'straight-stripes': 'Straight Vertical Stripes',
  'curved-stripes': 'Curved Baseball Stripes',
};

const TIP_LABELS = {
  tapered: 'Tapered',
  rounded: 'Rounded',
  square: 'Square',
};

/**
 * Compare two config objects (and optional stats) to produce a clean diff table.
 */
export function diffConfigs(configA, configB, statsA = null, statsB = null) {
  const rows = [];
  const check = (label, valA, valB, fmt = (v) => String(v)) => {
    const aStr = fmt(valA);
    const bStr = fmt(valB);
    if (aStr !== bStr) {
      rows.push({ label, a: aStr, b: bStr });
    }
  };

  const fmtIn = (v) => `${Number(v).toFixed(2)}"`;
  const fmtDeg = (v) => `${Math.round(v)}°`;

  check('Pattern', configA.layout.type, configB.layout.type, (v) => LAYOUT_LABELS[v] || v);
  check('Stripe Spacing', configA.layout.stripeSpacingIn, configB.layout.stripeSpacingIn, (v) => `${Number(v).toFixed(1)}"`);
  if (configA.layout.type === 'curved-stripes' || configB.layout.type === 'curved-stripes') {
    check('Curve Amount', configA.layout.type === 'curved-stripes' ? configA.layout.curveAmplitudeIn : 0, configB.layout.type === 'curved-stripes' ? configB.layout.curveAmplitudeIn : 0, (v) => `${Number(v).toFixed(2)}"`);
    check('Curve Cycles', configA.layout.curveCycles, configB.layout.curveCycles, (v) => `${Number(v).toFixed(2)}`);
    check('Curve Style', configA.layout.curveStyle, configB.layout.curveStyle, (v) => (v === 'opposing' ? 'Opposing Pairs' : 'Parallel'));
  }
  check('Stitch Length', configA.stitch.lengthIn, configB.stitch.lengthIn, fmtIn);
  check('Stitch Width', configA.stitch.widthIn, configB.stitch.widthIn, fmtIn);
  check('Vertical Pitch', configA.stitch.spacingIn, configB.stitch.spacingIn, fmtIn);
  check('V-Angle', configA.stitch.vAngleDeg, configB.stitch.vAngleDeg, fmtDeg);
  check('Center Gap', configA.stitch.centerGapIn, configB.stitch.centerGapIn, fmtIn);
  check('Tip Style', configA.stitch.tipStyle, configB.stitch.tipStyle, (v) => TIP_LABELS[v] || v);
  check('Thread Curve', configA.stitch.bow, configB.stitch.bow, (v) => `${Math.round(v * 100)}%`);
  check('Stitch Color', configA.stitch.color, configB.stitch.color, (v) => v.toUpperCase());

  if (statsA && statsB) {
    check('Stripes on Wall', statsA.stripeCount, statsB.stripeCount, (v) => `${v}`);
    check('Total Stitches', statsA.pairCount, statsB.pairCount, (v) => `${v} pairs`);
    check('Min Bridge', statsA.minBridgeIn, statsB.minBridgeIn, fmtIn);
  }

  return rows;
}
