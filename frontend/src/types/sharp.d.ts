/** Minimal sharp typings for visual test harnesses (runtime loaded from backend node_modules). */
declare module 'sharp' {
  interface CreateOptions {
    width: number;
    height: number;
    channels: number;
    background: { r: number; g: number; b: number };
  }

  interface ExtractOptions {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  interface Metadata {
    width?: number;
    height?: number;
  }

  interface SharpInstance {
    extract(options: ExtractOptions): SharpInstance;
    removeAlpha(): SharpInstance;
    ensureAlpha(alpha: number): SharpInstance;
    resize(width: number, height: number, options?: { kernel?: string }): SharpInstance;
    composite(
      inputs: Array<{ input: Buffer; top: number; left: number; blend?: string }>
    ): SharpInstance;
    metadata(): Promise<Metadata>;
    png(): SharpInstance;
    toBuffer(): Promise<Buffer>;
  }

  interface SharpStatic {
    (input: Buffer | string | { create: CreateOptions }): SharpInstance;
    kernel: { nearest: string };
  }

  const sharp: SharpStatic;
  export = sharp;
}
