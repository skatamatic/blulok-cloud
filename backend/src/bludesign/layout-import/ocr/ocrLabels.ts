/**
 * OCR for unit labels.
 *
 * Detection produces crops; this module reads the printed unit number inside
 * each crop. tesseract.js sits behind an `OcrProvider` interface so the
 * orchestrator (and tests) can swap in a deterministic stub without spinning up
 * the WASM worker.
 *
 * The Tesseract worker is configured for offline/deterministic use: it reads
 * the vendored `eng.traineddata.gz` from a local directory (no network fetch in
 * CI), uses the LSTM engine, restricts the character set to the label alphabet,
 * and treats each crop as a single text line.
 */

import path from 'path';
import sharp from 'sharp';

/** Encoded image bytes (PNG/JPG) for a single label crop. */
export type OcrImageInput = Buffer;

export interface OcrResult {
  /** Raw recognized text (un-normalized). */
  text: string;
  /** Engine confidence 0..1. */
  confidence: number;
}

/**
 * Pluggable OCR backend. Implementations must be safe to call repeatedly and
 * expose `terminate()` for cleanup of any background workers.
 */
export interface OcrProvider {
  recognize(image: OcrImageInput): Promise<OcrResult>;
  terminate(): Promise<void>;
}

/** Directory holding the vendored tesseract language data (eng.traineddata.gz). */
export const VENDORED_TESSDATA_DIR = path.join(__dirname, 'tessdata');

/** Characters a unit label can contain — digits plus an optional suffix letter. */
const LABEL_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Normalize raw OCR text into a unit label, or `undefined` if nothing
 * label-like was read.
 *
 * Rules: uppercase, strip non-alphanumerics, then extract the first
 * `<digits><optional single letter>` token (e.g. "26", "26A"). This rejects
 * stray punctuation/garbage while keeping real labels.
 */
export function normalizeLabel(raw: string): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (!cleaned) return undefined;
  const match = cleaned.match(/\d{1,3}[A-Z]?/);
  if (!match) return undefined;
  // Unit numbers start at 1 — a numeric part of 0 ("0", "0A", "T0") is always
  // a misread of border art or a stray glyph, never a real label.
  if (parseInt(match[0], 10) === 0) return undefined;
  return match[0];
}

/**
 * tesseract.js-backed OCR provider. Lazily creates a single worker on first use
 * and reuses it across crops for speed and determinism.
 */
/**
 * tesseract page-segmentation mode to use. Unit labels are short isolated tokens,
 * so 'word' (PSM 8) and 'block' (PSM 6) generally beat 'line' (PSM 7) for them.
 */
export type OcrPsmMode = 'line' | 'word' | 'block' | 'sparse' | 'char' | 'auto';

export class TesseractOcrProvider implements OcrProvider {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private worker: any = null;
  private initPromise: Promise<void> | null = null;
  private readonly langPath: string;
  private readonly psm: OcrPsmMode;

  constructor(langPath: string = VENDORED_TESSDATA_DIR, psm: OcrPsmMode = 'word') {
    this.langPath = langPath;
    this.psm = psm;
  }

  private async ensureWorker(): Promise<void> {
    if (this.worker) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Tesseract = require('tesseract.js');
        const { createWorker, OEM, PSM } = Tesseract;
        const psmValue =
          this.psm === 'word'
            ? PSM.SINGLE_WORD
            : this.psm === 'block'
              ? PSM.SINGLE_BLOCK
              : this.psm === 'sparse'
                ? PSM.SPARSE_TEXT
                : this.psm === 'char'
                  ? PSM.SINGLE_CHAR
                  : this.psm === 'auto'
                    ? PSM.AUTO
                    : PSM.SINGLE_LINE;
        const worker = await createWorker('eng', OEM.LSTM_ONLY, {
          langPath: this.langPath,
          gzip: true,
          // Never hit the network or a stale cache directory: always read the
          // vendored traineddata from langPath.
          cacheMethod: 'none',
          logger: () => {},
        });
        await worker.setParameters({
          tessedit_char_whitelist: LABEL_WHITELIST,
          tessedit_pageseg_mode: psmValue,
        });
        this.worker = worker;
      })();
    }
    await this.initPromise;
  }

  async recognize(image: OcrImageInput): Promise<OcrResult> {
    await this.ensureWorker();
    const { data } = await this.worker.recognize(image);
    const confidence =
      typeof data.confidence === 'number'
        ? Math.max(0, Math.min(1, data.confidence / 100))
        : 0;
    return { text: (data.text ?? '').trim(), confidence };
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initPromise = null;
    }
  }
}

/**
 * Ordered fallback OCR: tries each backend in turn and returns the **first**
 * result that normalizes to a valid label; if none do, returns the
 * highest-confidence raw read. Each backend's worker is created lazily, so cells
 * that the first mode reads (the majority) never spin up the slower modes.
 *
 * This recovers the labels a single page-seg mode misses (short single digits,
 * tight crops, angled rows) at a fraction of the cost of always running every
 * mode on every crop.
 */
export class FallbackOcrProvider implements OcrProvider {
  constructor(private readonly providers: OcrProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackOcrProvider requires at least one provider');
    }
  }

  async recognize(image: OcrImageInput): Promise<OcrResult> {
    let best: OcrResult = { text: '', confidence: 0 };
    for (const provider of this.providers) {
      const result = await provider.recognize(image);
      if (normalizeLabel(result.text)) {
        return result; // first valid label wins — short-circuit
      }
      if (result.confidence > best.confidence) best = result;
    }
    return best;
  }

  async terminate(): Promise<void> {
    await Promise.all(this.providers.map((p) => p.terminate()));
  }
}

/** A normalized candidate label produced by one OCR pass. */
interface LabelCandidate {
  label: string;
  confidence: number;
}

/** Count of digit characters in a normalized label (e.g. "26A" → 2). */
function digitCount(label: string): number {
  return (label.match(/\d/g) ?? []).length;
}

/**
 * Choose the best label among candidate reads by **support-weighted voting**:
 * each reader (page-seg mode × scale) contributes `1 + confidence` to the
 * label it produced; the label with the most total support wins (digit count,
 * then confidence break exact ties).
 *
 * Why support, not digit count: with several readers, the empirical failure
 * modes pull in opposite directions — `word` truncates small numbers ("13" →
 * "1") but also *duplicates* strokes at high scale ("26A" → "226A"), so
 * "prefer the longest read" amplifies garbage. Agreement across independent
 * modes is the reliable signal: truncations and duplications are produced by
 * one reader, while the true label is read consistently by `block`+`line`
 * (and they outvote the single bad read).
 *
 * The returned confidence is the max of the engine's own confidence and an
 * **agreement-derived floor**. Tesseract routinely reports 0.00 on reads that
 * are in fact correct (notably suffixed labels like "26A" and small stacked
 * cells); if downstream consumers trusted that raw number they would discard
 * good labels (the frontend strips labels < 0.5 before neighbor resolution).
 * Multiple independent readers producing the same normalized label is far
 * stronger evidence than the engine's self-score, so it sets the floor:
 * 3+ agreeing reads → 0.85, 2 → 0.65, a lone read keeps the engine score.
 */
function chooseBestLabel(candidates: LabelCandidate[]): LabelCandidate | null {
  if (candidates.length === 0) return null;
  const groups = new Map<
    string,
    { label: string; support: number; maxConf: number; count: number }
  >();
  for (const c of candidates) {
    const g =
      groups.get(c.label) ?? { label: c.label, support: 0, maxConf: 0, count: 0 };
    g.support += 1 + c.confidence;
    g.maxConf = Math.max(g.maxConf, c.confidence);
    g.count += 1;
    groups.set(c.label, g);
  }
  let best: { label: string; support: number; maxConf: number; count: number } | null =
    null;
  let bestScore = -Infinity;
  for (const g of groups.values()) {
    // Digit weight (0.15) settles near-ties in favor of the more complete
    // number (block/line sometimes truncate "91" to "9" with high confidence
    // while word + 2x-block read the full number at slightly lower support).
    const score = g.support + digitCount(g.label) * 0.15 + g.maxConf * 0.001;
    if (score > bestScore) {
      bestScore = score;
      best = g;
    }
  }
  if (!best) return null;
  const agreementFloor = best.count >= 3 ? 0.85 : best.count === 2 ? 0.65 : 0;
  return { label: best.label, confidence: Math.max(best.maxConf, agreementFloor) };
}

/**
 * Production OCR backend: reads each crop with multiple page-seg modes and
 * orientations and returns the best label via {@link chooseBestLabel}.
 *
 * - No single page-seg mode wins across all cell sizes: `block`/`line` read the
 *   large numbers (yellow column, clusters) that `word` truncates, while `word`
 *   reads the small numbers (tight blue/green/red rows) that `block`/`line` miss.
 *   Running all three at 0° and voting on the most digit-complete read recovers
 *   both, and `block` additionally tolerates a thin residual border in-frame.
 * - Angled rows on a site plan can leave the crop's text rotated ~90°; if the
 *   upright pass yields no confident multi-digit read, we retry `line` at 90°/270°
 *   so sideways labels still resolve.
 *
 * Rotations are only attempted when the upright pass is weak, so most (upright)
 * cells cost two reads and only the hard ones pay for the extra orientations.
 */
export class RobustOcrProvider implements OcrProvider {
  private readonly block: TesseractOcrProvider;
  private readonly line: TesseractOcrProvider;
  private readonly word: TesseractOcrProvider;

  constructor(langPath: string = VENDORED_TESSDATA_DIR) {
    this.block = new TesseractOcrProvider(langPath, 'block');
    this.line = new TesseractOcrProvider(langPath, 'line');
    this.word = new TesseractOcrProvider(langPath, 'word');
  }

  private async read(provider: TesseractOcrProvider, image: OcrImageInput): Promise<LabelCandidate | null> {
    const r = await provider.recognize(image);
    const label = normalizeLabel(r.text);
    return label ? { label, confidence: r.confidence } : null;
  }

  async recognize(image: OcrImageInput): Promise<OcrResult> {
    const candidates: LabelCandidate[] = [];
    const push = (c: LabelCandidate | null) => {
      if (c) candidates.push(c);
    };

    // Upright pass: block + line + word. Cell sizes vary widely, and no single
    // page-seg mode wins across all: `block`/`line` read the large numbers (yellow
    // column, clusters) that `word` mangles, while `word` reads the small numbers
    // (tight blue/green/red rows) that `block`/`line` miss. Running all three and
    // voting on the most digit-complete read gets the best of each.
    push(await this.read(this.block, image));
    push(await this.read(this.line, image));
    push(await this.read(this.word, image));

    // Second look at 2× scale with `block` only. The LSTM resolves tightly-
    // kerned small digits markedly better with fatter strokes ("31" misread as
    // "K"/"3" at 1× reads cleanly at 2×; "49" vs "43" likewise). `word` at 2×
    // is deliberately skipped: it tends to hallucinate duplicated strokes
    // ("26A" → "226A") and would corrupt the vote.
    try {
      const meta = await sharp(image).metadata();
      if (meta.width) {
        const up = await sharp(image)
          .resize({ width: meta.width * 2, kernel: 'lanczos3' })
          .png()
          .toBuffer();
        push(await this.read(this.block, up));
      }
    } catch {
      // Non-image buffer: skip the scaled pass.
    }

    // Only pay for rotations when upright didn't give any multi-digit read —
    // i.e. the crop is probably a sideways (angled-row) label. Deliberately NOT
    // gated on confidence: tesseract reports 0.00 on plenty of correct reads
    // here, and the rotated passes then flood the vote with junk single digits
    // that outvote the correct upright read.
    const uprightSolid = candidates.some((c) => digitCount(c.label) >= 2);
    if (!uprightSolid) {
      for (const angle of [90, 270]) {
        try {
          const rotated = await sharp(image).rotate(angle).png().toBuffer();
          push(await this.read(this.line, rotated));
          push(await this.read(this.word, rotated));
        } catch {
          // Non-image buffer or sharp failure: skip this orientation.
        }
      }
    }

    const best = chooseBestLabel(candidates);
    return best ? { text: best.label, confidence: best.confidence } : { text: '', confidence: 0 };
  }

  async terminate(): Promise<void> {
    await Promise.all([this.block.terminate(), this.line.terminate(), this.word.terminate()]);
  }
}

/**
 * The default OCR backend for the detection engine: a {@link RobustOcrProvider}
 * that combines page-seg modes and orientations and picks the most digit-complete
 * read (see that class for the rationale).
 */
export function createDefaultOcrProvider(
  langPath: string = VENDORED_TESSDATA_DIR
): OcrProvider {
  return new RobustOcrProvider(langPath);
}
