/**
 * Read the unit-number label for one detected cell: standard crop first, then
 * the re-spaced glyph crop as a fallback.
 *
 * The standard crop (ink as printed) is the most faithful and reads correctly
 * for the vast majority of cells. But the plan font kerns digits so tightly
 * that the LSTM occasionally merges a pair into a letter ("71" → "n", which the
 * label whitelist rejects → no read at all). The `respaced` variant re-typesets
 * the glyphs with breathing room and rescues exactly those cells; it is only
 * consulted when the standard crop produced nothing label-like, so it can never
 * regress a cell the standard crop already reads.
 */

import type { CvModule } from '../opencv';
import { cropLabel, type CropCandidate } from './cropLabel';
import { normalizeLabel, type OcrProvider } from './ocrLabels';

export interface ReadLabelResult {
  label: string;
  confidence: number;
}

function digitCount(label: string): number {
  return (label.match(/\d/g) ?? []).length;
}

export async function readUnitLabel(
  cv: CvModule,
  gray: unknown,
  candidate: CropCandidate,
  provider: OcrProvider
): Promise<ReadLabelResult | null> {
  let standard: ReadLabelResult | null = null;
  const crop = await cropLabel(cv, gray, candidate);
  if (crop) {
    const ocr = await provider.recognize(crop);
    const label = normalizeLabel(ocr.text);
    if (label) standard = { label, confidence: ocr.confidence };
  }

  // A kerning-merged read is always SHORTER than the truth (a digit pair
  // collapses into a letter, or only junk survives), so the respaced crop is
  // consulted when the standard read is missing or short, and wins only when
  // it recovers strictly more digits. A standard read of equal length always
  // wins — it is the more faithful image.
  if (!standard || digitCount(standard.label) < 2) {
    const respaced = await cropLabel(cv, gray, candidate, { variant: 'respaced' });
    if (respaced) {
      const ocr = await provider.recognize(respaced);
      const label = normalizeLabel(ocr.text);
      if (label && (!standard || digitCount(label) > digitCount(standard.label))) {
        return { label, confidence: ocr.confidence };
      }
    }
  }

  return standard;
}
