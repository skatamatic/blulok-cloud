/**
 * Extract an upright, OCR-friendly grayscale crop for a single detected unit.
 *
 * Units can be rotated (angled rows on the site plan), so a naive axis-aligned
 * crop would capture neighbouring numbers. We rotate a padded ROI so the unit's
 * own rotation is undone, then **localize the digit ink** inside the upright cell
 * (dropping the thin outline border and the empty cell space) and crop tight to
 * just the number before upscaling. The localization step is what rescues tall
 * portrait cells whose small number sits in the upper region: a centred whole-
 * cell crop would leave that number tiny in a big frame and OCR would miss it.
 *
 * The `gray` Mat passed in is expected to be the native-resolution **Value
 * channel** (max RGB), not luma — see `valueChannel` in preprocess. That keeps
 * black digits black on a white field for any fill color; cropping at native
 * resolution (rather than the upscaled detection image) keeps strokes crisp
 * instead of fuzzy/bold from compounded interpolation.
 *
 * Deliberately **no binarization**: Tesseract does its own adaptive thresholding
 * and reads clean *anti-aliased grayscale* markedly better than a hard 1-bit
 * image, which jaggs the strokes and can merge the already tightly-kerned digits
 * (e.g. "95" → "5"). Output is a grayscale PNG buffer the `OcrProvider` consumes.
 */

import sharp from 'sharp';
import type { CvModule } from '../opencv';
import { rectCorners } from '../geometry';
import type { RotatedRectPx } from '../types';

export interface CropCandidate {
  bounds: RotatedRectPx;
  rotationRad: number;
}

export interface CropLabelOptions {
  /** Override the normalized output height (default {@link TARGET_HEIGHT}). */
  targetHeight?: number;
  /**
   * `respaced`: re-typeset the glyph components with breathing room instead of
   * cropping the ink as printed. Rescues tightly-kerned digits that the LSTM
   * merges into a letter ("71" → "n" → nothing), but is less faithful than the
   * printed image, so callers should use it only as a fallback when the
   * standard crop yields no label. Returns null when not applicable (fewer
   * than 2 glyphs, stacked rows, or already well-spaced).
   */
  variant?: 'standard' | 'respaced';
}

/**
 * Height (px) the cropped number is normalized to before OCR. Kept modest: the
 * source is cropped at native resolution (~30px tall cells), so a single cubic
 * upscale to this height stays crisp; larger targets only blur/fatten strokes.
 */
const TARGET_HEIGHT = 64;
/** Quiet white margin (px) added around the crop for OCR. */
const MARGIN = 18;
/** ROI padding as a fraction of the rect size, to keep glyph edges in-frame. */
const PAD_FRACTION = 0.15;
/**
 * Fraction of the cell kept for OCR. Kept high so an off-centre number (e.g. at
 * the bottom of a tall portrait cell, or the left of a wide one) is never
 * clipped; the thin residual border that remains is tolerated by the `block`
 * page-seg mode in the OCR provider rather than by cropping it away here.
 */
const INNER_FRACTION = 0.9;

/** Threshold (0..255) below which a Value-channel pixel counts as ink. */
const INK_THRESHOLD = 150;
/** Padding added around the located ink, as a fraction of its extent. */
const INK_PAD_FRACTION = 0.18;
/** Absolute minimum component height (px) to count as a digit, not noise. */
const MIN_DIGIT_HEIGHT = 6;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Find the tight bounding box of the unit number inside an upright cell crop.
 *
 * Runs connected-components on the cell sub-region of the (already de-rotated)
 * Mat, discards the thin frame border lines and noise specks, and unions the
 * remaining digit-like blobs. Returns the padded box in `rotated`-Mat coordinates
 * or null when nothing digit-like is found (caller keeps the whole-cell crop).
 *
 * Operating on the *de-rotated* cell is what makes this reliable: the cell border
 * is then axis-aligned at the frame edges, so it is cheap to reject as long thin
 * components while keeping compact digit blobs wherever they sit in the cell.
 */
interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface InkLayout {
  /** Padded union of all digit-like ink, in rotated-Mat coordinates. */
  union: InkBox;
  /**
   * When the label is printed on two stacked text rows (e.g. "26" over "A" in
   * narrow cells), the padded per-row boxes top-to-bottom; null for the normal
   * single-row case.
   */
  rows: [InkBox, InkBox] | null;
  /**
   * Individual glyph component boxes (unpadded, rotated-Mat coordinates,
   * left-to-right) for the single-row case; used to re-typeset tightly-kerned
   * digits with breathing room.
   */
  glyphs: InkBox[];
}

function localizeInk(
  cv: CvModule,
  rotated: any,
  cx0: number,
  cy0: number,
  cwC: number,
  chC: number
): InkLayout | null {
  const cell = rotated.roi(new cv.Rect(cx0, cy0, cwC, chC));
  const bin = new cv.Mat();
  const labels = new cv.Mat();
  const stats = new cv.Mat();
  const centroids = new cv.Mat();
  try {
    cv.threshold(cell, bin, INK_THRESHOLD, 255, cv.THRESH_BINARY_INV);
    const n = cv.connectedComponentsWithStats(bin, labels, stats, centroids, 8);
    const comps: { x: number; y: number; w: number; h: number }[] = [];
    for (let l = 1; l < n; l++) {
      const x = stats.intAt(l, 0);
      const y = stats.intAt(l, 1);
      const w = stats.intAt(l, 2);
      const h = stats.intAt(l, 3);
      const area = stats.intAt(l, 4);
      if (area < 8) continue; // speck / anti-alias noise
      // Too short to be a digit. ABSOLUTE, not cell-relative: numbers are often
      // small inside a tall cell, so a cell-relative floor (e.g. 0.12·cellH)
      // wrongly drops a thin leading/trailing "1" and turns "104" into "04".
      if (h < MIN_DIGIT_HEIGHT) continue;
      // Border lines: long, thin AND hugging a frame edge. The edge test is what
      // keeps a digit "1" (tall + thin, but interior) from being discarded.
      const atTopEdge = y <= 1;
      const atBottomEdge = y + h >= chC - 1;
      const atLeftEdge = x <= 1;
      const atRightEdge = x + w >= cwC - 1;
      if (w >= cwC * 0.8 && h <= 4 && (atTopEdge || atBottomEdge)) continue;
      if (h >= chC * 0.8 && w <= 4 && (atLeftEdge || atRightEdge)) continue;
      // Hairlines spanning nearly the full cell are walls wherever they sit
      // (a slightly-off detected box leaves a neighbor's wall mid-crop, which
      // OCR then reads as an extra stroke: "|3" → 2, "|1" → 4). A real digit
      // "1" never spans the full cell height and is wider than a hairline.
      if (h >= chC * 0.85 && w <= 3) continue;
      if (w >= cwC * 0.85 && h <= 3) continue;
      // 1px slivers flush against the frame edge are wall fragments even when
      // short (anti-aliasing breaks a wall into pieces). Real digits at native
      // plan resolution are ≥3px wide and sit inside the cell, not on its edge.
      if (w <= 2 && (atLeftEdge || atRightEdge)) continue;
      if (h <= 2 && (atTopEdge || atBottomEdge)) continue;
      comps.push({ x, y, w, h });
    }
    if (comps.length === 0) return null;

    const pad = (bx0: number, by0: number, bx1: number, by1: number): InkBox | null => {
      const mx = Math.max(2, Math.round((bx1 - bx0) * INK_PAD_FRACTION));
      const my = Math.max(2, Math.round((by1 - by0) * INK_PAD_FRACTION));
      const x = clamp(cx0 + bx0 - mx, 0, rotated.cols - 1);
      const y = clamp(cy0 + by0 - my, 0, rotated.rows - 1);
      const w = Math.min(bx1 - bx0 + mx * 2, rotated.cols - x);
      const h = Math.min(by1 - by0 + my * 2, rotated.rows - y);
      if (w < 4 || h < 4) return null;
      return { x, y, w, h };
    };
    const unionOf = (cs: typeof comps): [number, number, number, number] => [
      Math.min(...cs.map((c) => c.x)),
      Math.min(...cs.map((c) => c.y)),
      Math.max(...cs.map((c) => c.x + c.w)),
      Math.max(...cs.map((c) => c.y + c.h)),
    ];

    const [ux0, uy0, ux1, uy1] = unionOf(comps);
    const union = pad(ux0, uy0, ux1, uy1);
    if (!union) return null;

    // Detect a stacked two-row label ("26" over "A"): split components into
    // two y-bands with a clear gap. Only trust the split when both bands look
    // like text rows of similar height and the bands don't overlap vertically.
    let rows: [InkBox, InkBox] | null = null;
    const sorted = [...comps].sort((a, b) => a.y - b.y);
    let splitAt = -1;
    let bestGap = 1;
    for (let i = 1; i < sorted.length; i++) {
      const aboveBottom = Math.max(...sorted.slice(0, i).map((c) => c.y + c.h));
      const belowTop = Math.min(...sorted.slice(i).map((c) => c.y));
      const gapPx = belowTop - aboveBottom;
      if (gapPx > bestGap) {
        bestGap = gapPx;
        splitAt = i;
      }
    }
    if (splitAt > 0) {
      const top = sorted.slice(0, splitAt);
      const bottom = sorted.slice(splitAt);
      const [tx0, ty0, tx1, ty1] = unionOf(top);
      const [lx0, ly0, lx1, ly1] = unionOf(bottom);
      const topH = ty1 - ty0;
      const botH = ly1 - ly0;
      const similarHeight = Math.min(topH, botH) / Math.max(topH, botH) >= 0.5;
      if (similarHeight && topH >= MIN_DIGIT_HEIGHT && botH >= MIN_DIGIT_HEIGHT) {
        const topBox = pad(tx0, ty0, tx1, ty1);
        const botBox = pad(lx0, ly0, lx1, ly1);
        if (topBox && botBox) rows = [topBox, botBox];
      }
    }

    // 1px halo only: anything larger leaks slivers of the neighboring glyph
    // into each tile, which OCR reads as phantom "1"s.
    const GLYPH_PAD = 1;
    const glyphs = [...comps]
      .sort((a, b) => a.x - b.x)
      .map((c) => {
        const gx = clamp(cx0 + c.x - GLYPH_PAD, 0, rotated.cols - 1);
        const gy = clamp(cy0 + c.y - GLYPH_PAD, 0, rotated.rows - 1);
        return {
          x: gx,
          y: gy,
          w: Math.min(cx0 + c.x + c.w + GLYPH_PAD, rotated.cols) - gx,
          h: Math.min(cy0 + c.y + c.h + GLYPH_PAD, rotated.rows) - gy,
        };
      });
    return { union, rows, glyphs };
  } finally {
    cell.delete();
    bin.delete();
    labels.delete();
    stats.delete();
    centroids.delete();
  }
}

/**
 * Produce a grayscale PNG buffer of the unit's interior, rotated upright and
 * upscaled. Returns null when the region is degenerate or outside the image.
 */
export async function cropLabel(
  cv: CvModule,
  gray: any,
  candidate: CropCandidate,
  options?: CropLabelOptions
): Promise<Buffer | null> {
  const targetHeight = options?.targetHeight ?? TARGET_HEIGHT;
  const { bounds, rotationRad } = candidate;
  // Normalize the crop rotation into [-45°, 45°]. Detection labels a *portrait*
  // cell with a ~±90° angle (it picks the longer axis as "width"), which would
  // rotate the cell's horizontal unit number to vertical and break OCR. No row on
  // a real plan runs at 90°, so folding the angle by 90° (and swapping w/h)
  // recovers the true text-aligned orientation.
  const QUARTER = Math.PI / 2;
  let ocrAngle = rotationRad;
  let ocrW = bounds.width;
  let ocrH = bounds.height;
  while (ocrAngle > Math.PI / 4) {
    ocrAngle -= QUARTER;
    [ocrW, ocrH] = [ocrH, ocrW];
  }
  while (ocrAngle < -Math.PI / 4) {
    ocrAngle += QUARTER;
    [ocrW, ocrH] = [ocrH, ocrW];
  }
  const corners = rectCorners(bounds, rotationRad);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const padX = bounds.width * PAD_FRACTION;
  const padY = bounds.height * PAD_FRACTION;

  const minX = clamp(Math.floor(Math.min(...xs) - padX), 0, gray.cols - 1);
  const minY = clamp(Math.floor(Math.min(...ys) - padY), 0, gray.rows - 1);
  const maxX = clamp(Math.ceil(Math.max(...xs) + padX), 0, gray.cols);
  const maxY = clamp(Math.ceil(Math.max(...ys) + padY), 0, gray.rows);

  const roiW = maxX - minX;
  const roiH = maxY - minY;
  if (roiW < 4 || roiH < 4) return null;

  const roi = gray.roi(new cv.Rect(minX, minY, roiW, roiH)).clone();
  const rotated = new cv.Mat();
  const centerInRoi = new cv.Point(bounds.cx - minX, bounds.cy - minY);

  try {
    const M = cv.getRotationMatrix2D(centerInRoi, (ocrAngle * 180) / Math.PI, 1);
    cv.warpAffine(
      roi,
      rotated,
      M,
      new cv.Size(roiW, roiH),
      cv.INTER_CUBIC,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255)
    );
    M.delete();

    const cw = Math.min(Math.round(ocrW * INNER_FRACTION), roiW);
    const ch = Math.min(Math.round(ocrH * INNER_FRACTION), roiH);
    let cx0 = clamp(Math.round(centerInRoi.x - cw / 2), 0, roiW - 1);
    let cy0 = clamp(Math.round(centerInRoi.y - ch / 2), 0, roiH - 1);
    let cwC = Math.min(cw, roiW - cx0);
    let chC = Math.min(ch, roiH - cy0);
    if (cwC < 4 || chC < 4) return null;

    // Localize the number within the upright cell and tighten the crop to it.
    // No-op (keeps the centred cell box) when no digit-like ink is found.
    const ink = localizeInk(cv, rotated, cx0, cy0, cwC, chC);
    if (ink) {
      cx0 = ink.union.x;
      cy0 = ink.union.y;
      cwC = ink.union.w;
      chC = ink.union.h;
    }

    // Read the FULL warped mat (a fresh, continuous Mat → reliable `.data`) and
    // let sharp crop the cell rect. A sub-ROI clone's `.data` is unreliable in
    // this OpenCV.js (wasm) build, so we never raw-read one.
    const full = Buffer.from(rotated.data.slice(0, roiW * roiH));
    const raw = { raw: { width: roiW, height: roiH, channels: 1 as const } };

    // Stacked two-row label ("26" printed over "A" in a narrow cell): no page-seg
    // mode reads that reliably as one token, so re-typeset the rows side by side
    // ("26"+"A" → "26A") before OCR.
    if (ink?.rows) {
      const [top, bottom] = ink.rows;
      const scaleBand = async (b: InkBox) =>
        sharp(full, raw)
          .extract({ left: b.x, top: b.y, width: b.w, height: b.h })
          .resize(Math.max(8, Math.round((b.w / b.h) * targetHeight)), targetHeight, {
            kernel: 'cubic',
          })
          .png()
          .toBuffer();
      const [topImg, botImg] = await Promise.all([scaleBand(top), scaleBand(bottom)]);
      const topMeta = await sharp(topImg).metadata();
      const botMeta = await sharp(botImg).metadata();
      const gap = Math.round(targetHeight * 0.2);
      const width = topMeta.width! + gap + botMeta.width!;
      return await sharp({
        create: {
          width: width + MARGIN * 2,
          height: targetHeight + MARGIN * 2,
          channels: 3,
          background: { r: 255, g: 255, b: 255 },
        },
      })
        .composite([
          { input: topImg, left: MARGIN, top: MARGIN },
          { input: botImg, left: MARGIN + topMeta.width! + gap, top: MARGIN },
        ])
        .png()
        .toBuffer();
    }

    // Tightly-kerned digits (the plan font nearly touches "7" and "1") can merge
    // into a single letter for the LSTM ("71" → "n", read as nothing under the
    // digit whitelist). The `respaced` variant re-typesets the glyph components
    // with breathing room; only produced on request (fallback crop).
    if (options?.variant === 'respaced') {
      if (!ink || ink.rows || ink.glyphs.length < 2) return null;
      let minGap = Infinity;
      for (let i = 1; i < ink.glyphs.length; i++) {
        const prev = ink.glyphs[i - 1];
        minGap = Math.min(minGap, ink.glyphs[i].x - (prev.x + prev.w));
      }
      if (minGap > 4) return null;
      {
        const minY = Math.min(...ink.glyphs.map((g) => g.y));
        const maxY = Math.max(...ink.glyphs.map((g) => g.y + g.h));
        const bandH = maxY - minY;
        const gapPx = Math.max(3, Math.round(bandH * 0.35));
        const canvasW =
          ink.glyphs.reduce((s, g) => s + g.w, 0) + gapPx * (ink.glyphs.length - 1) + 4;
        const canvasH = bandH + 4;
        const composites: sharp.OverlayOptions[] = [];
        let penX = 2;
        for (const g of ink.glyphs) {
          composites.push({
            input: await sharp(full, raw)
              .extract({ left: g.x, top: g.y, width: g.w, height: g.h })
              .png()
              .toBuffer(),
            left: penX,
            top: 2 + (g.y - minY),
          });
          penX += g.w + gapPx;
        }
        const scale = targetHeight / canvasH;
        return await sharp({
          create: {
            width: canvasW,
            height: canvasH,
            channels: 3,
            background: { r: 255, g: 255, b: 255 },
          },
        })
          .composite(composites)
          .png()
          .toBuffer()
          .then((buf) =>
            sharp(buf)
              .resize(Math.round(canvasW * scale), targetHeight, { kernel: 'cubic' })
              .extend({
                top: MARGIN,
                bottom: MARGIN,
                left: MARGIN,
                right: MARGIN,
                background: { r: 255, g: 255, b: 255 },
              })
              .png()
              .toBuffer()
          );
      }
    }

    const targetW = Math.max(targetHeight, Math.round((cwC / chC) * targetHeight));
    return await sharp(full, raw)
      .extract({ left: cx0, top: cy0, width: cwC, height: chC })
      .resize(targetW, targetHeight, { kernel: 'cubic' })
      .extend({
        top: MARGIN,
        bottom: MARGIN,
        left: MARGIN,
        right: MARGIN,
        background: { r: 255, g: 255, b: 255 },
      })
      .png()
      .toBuffer();
  } finally {
    roi.delete();
    rotated.delete();
  }
}
