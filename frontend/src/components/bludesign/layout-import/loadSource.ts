/**
 * BluDesign Layout Import — Source loading
 *
 * Normalizes an uploaded PNG/JPG/WEBP/PDF into a raster the detection engine can
 * consume. The backend engine decodes raster formats only, so PDFs are rendered
 * to a PNG on the client (first page, capped resolution) before upload.
 */

import * as pdfjsLib from 'pdfjs-dist';
// Vite resolves this worker URL at build time.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Largest dimension (px) we rasterize a PDF page to before upload. PDFs are
 * vector, so rendering large yields genuinely crisp unit-number glyphs (true
 * detail the backend OCR can read) rather than relying on backend upscaling.
 */
const MAX_PDF_RASTER_DIM = 6000;

export interface LoadedSource {
  /** File to send to the detection endpoint (always a raster image). */
  uploadFile: File;
  /** Object/data URL for previewing the raster in the canvas. */
  previewUrl: string;
  /** Raster width in pixels (matches what the backend will report). */
  width: number;
  /** Raster height in pixels. */
  height: number;
  /** Number of pages (1 for images, page count for PDFs). */
  pageCount: number;
  /** True when the source was a PDF that we rasterized. */
  rasterizedFromPdf: boolean;
}

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

async function readImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to read image dimensions'));
    img.src = url;
  });
}

async function rasterizePdf(file: File, pageNumber = 1): Promise<LoadedSource> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(pageNumber);

  const baseViewport = page.getViewport({ scale: 1 });
  const longest = Math.max(baseViewport.width, baseViewport.height) || 1;
  // Render so the longest side targets MAX_PDF_RASTER_DIM: upscale small pages
  // (capped at 4×) and downscale oversized pages so we never exceed the cap.
  const scale = Math.min(MAX_PDF_RASTER_DIM / longest, 4);
  const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create canvas context for PDF rendering');

  // White background so transparent PDFs render like printed plans.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png')
  );
  if (!blob) throw new Error('Failed to rasterize PDF page');

  const baseName = file.name.replace(/\.pdf$/i, '');
  const uploadFile = new File([blob], `${baseName}-p${pageNumber}.png`, {
    type: 'image/png',
  });
  const previewUrl = URL.createObjectURL(blob);

  return {
    uploadFile,
    previewUrl,
    width: canvas.width,
    height: canvas.height,
    pageCount: pdf.numPages,
    rasterizedFromPdf: true,
  };
}

/**
 * Normalize an uploaded file into a {@link LoadedSource}. PDFs are rasterized;
 * raster images pass through unchanged.
 */
export async function loadSource(file: File, pageNumber = 1): Promise<LoadedSource> {
  if (isPdf(file)) {
    return rasterizePdf(file, pageNumber);
  }

  const previewUrl = URL.createObjectURL(file);
  const { width, height } = await readImageDimensions(previewUrl);
  return {
    uploadFile: file,
    previewUrl,
    width,
    height,
    pageCount: 1,
    rasterizedFromPdf: false,
  };
}

/** Accept attribute for the upload input. */
export const ACCEPTED_FILE_TYPES = '.png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf';

/** Validate a candidate file before processing. Returns an error string or null. */
export function validateSourceFile(file: File): string | null {
  const okExt = /\.(png|jpe?g|webp|pdf)$/i.test(file.name);
  const okMime = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
  ].includes(file.type);
  if (!okExt && !okMime) {
    return 'Unsupported file. Please upload a PNG, JPG, WEBP, or PDF.';
  }
  const MAX_BYTES = 25 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return 'File is too large. Maximum size is 25 MB.';
  }
  return null;
}

/** Return page count for PDFs (1 for raster images). */
export async function peekSourcePageCount(file: File): Promise<number> {
  if (!isPdf(file)) return 1;
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  return pdf.numPages;
}

export function isPdfFile(file: File): boolean {
  return isPdf(file);
}
