/**
 * Site terrain fetch harness — fetches real tiles, stitches previews, writes output files.
 *
 *   npm run terrain:fetch-harness -- --lat 43.653 --lng -79.383 --radius 400 --out ./terrain-harness-out
 *   npm run terrain:fetch-harness -- --stub --lat 43.653 --lng -79.383   # offline stub tiles
 *
 * Uses SITE_TERRAIN_*_PROVIDER env vars (defaults: terrarium + esri-world-imagery).
 * ESRI_API_KEY required for default imagery provider.
 */

import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';
import sharp from 'sharp';

dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { createDefaultSiteTerrainService } from '../src/bludesign/services/site-terrain/site-terrain.service';
import { SiteTerrainService } from '../src/bludesign/services/site-terrain/site-terrain.service';
import { StubElevationProvider } from '../src/bludesign/services/site-terrain/providers/stub.elevation.provider';
import { StubImageryProvider } from '../src/bludesign/services/site-terrain/providers/stub.imagery.provider';
import { SiteTerrainError } from '../src/bludesign/services/site-terrain/types';

interface HarnessArgs {
  lat: number;
  lng: number;
  radius: number;
  out: string;
  zoom?: number;
  imageryZoom?: number;
  elevationZoom?: number;
  stub: boolean;
}

function parseArgs(argv: string[]): HarnessArgs {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = 'true';
      }
    }
  }

  const lat = parseFloat(args.lat ?? '');
  const lng = parseFloat(args.lng ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.error('Usage: terrain:fetch-harness -- --lat <lat> --lng <lng> [--radius 400] [--out ./terrain-harness-out] [--zoom 15]');
    process.exit(1);
  }

  return {
    lat,
    lng,
    radius: parseFloat(args.radius ?? '400'),
    out: path.resolve(args.out ?? './terrain-harness-out'),
    zoom: args.zoom ? parseInt(args.zoom, 10) : undefined,
    imageryZoom: args['imagery-zoom'] ? parseInt(args['imagery-zoom'], 10) : undefined,
    elevationZoom: args['elevation-zoom'] ? parseInt(args['elevation-zoom'], 10) : undefined,
    stub: args.stub === 'true',
  };
}

function heightsToGrayscalePng(
  heights: Float32Array,
  width: number,
  height: number,
  minM: number,
  maxM: number
): Promise<Buffer> {
  const rgba = Buffer.alloc(width * height * 4);
  const range = maxM - minM || 1;

  for (let i = 0; i < width * height; i++) {
    const t = (heights[i] - minM) / range;
    const g = Math.round(Math.max(0, Math.min(1, t)) * 255);
    const o = i * 4;
    rgba[o] = g;
    rgba[o + 1] = g;
    rgba[o + 2] = g;
    rgba[o + 3] = 255;
  }

  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.out, { recursive: true });

  console.log(`Site terrain fetch harness`);
  console.log(`  center: ${args.lat}, ${args.lng}`);
  console.log(`  radius: ${args.radius}m`);
  console.log(`  output: ${args.out}`);

  const service = args.stub
    ? new SiteTerrainService({
        config: { elevation: 'stub', imagery: 'stub' },
        elevationProvider: new StubElevationProvider(),
        imageryProvider: new StubImageryProvider(),
      })
    : createDefaultSiteTerrainService();

  const health = await service.healthCheck();
  console.log(`  health: elevation=${health.elevation} imagery=${health.imagery}`);

  if (!health.elevation) {
    console.error('Elevation provider health check failed');
    process.exit(1);
  }
  if (!health.imagery) {
    console.error('Imagery provider health check failed (is ESRI_API_KEY set?)');
    process.exit(1);
  }

  const pack = await service.fetchSitePack({
    center: { lat: args.lat, lng: args.lng },
    radiusMeters: args.radius,
    zoom: args.zoom,
    imageryZoom: args.imageryZoom,
    elevationZoom: args.elevationZoom,
  });

  console.log(`  imagery zoom: z${pack.imageryZoom} (~${pack.imageryMetersPerPixel.toFixed(2)} m/px)`);
  console.log(`  elevation zoom: z${pack.elevationZoom}`);
  console.log(`  tiles: elevation=${pack.tilesFetched.elevation} imagery=${pack.tilesFetched.imagery}`);
  console.log(`  size: ${pack.imagery.width}x${pack.imagery.height}`);
  console.log(`  elevation range: ${pack.elevation.minM.toFixed(1)}m – ${pack.elevation.maxM.toFixed(1)}m`);

  const imageryJpeg = await sharp(pack.imagery.rgba, {
    raw: { width: pack.imagery.width, height: pack.imagery.height, channels: 4 },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

  const elevationPng = await heightsToGrayscalePng(
    pack.elevation.heights,
    pack.elevation.width,
    pack.elevation.height,
    pack.elevation.minM,
    pack.elevation.maxM
  );

  fs.writeFileSync(path.join(args.out, 'imagery.jpg'), imageryJpeg);
  fs.writeFileSync(path.join(args.out, 'elevation.png'), elevationPng);

  fs.writeFileSync(
    path.join(args.out, 'elevation-meta.json'),
    JSON.stringify(
      {
        encoding: pack.elevation.encoding,
        width: pack.elevation.width,
        height: pack.elevation.height,
        minM: pack.elevation.minM,
        maxM: pack.elevation.maxM,
        imageryZoom: pack.imageryZoom,
        elevationZoom: pack.elevationZoom,
        imageryMetersPerPixel: pack.imageryMetersPerPixel,
        bounds: pack.bounds,
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(args.out, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        center: { lat: args.lat, lng: args.lng },
        radiusMeters: args.radius,
        imageryZoom: pack.imageryZoom,
        elevationZoom: pack.elevationZoom,
        imageryMetersPerPixel: pack.imageryMetersPerPixel,
        providers: pack.providers,
        tilesFetched: pack.tilesFetched,
        attribution: pack.attribution,
        outputs: ['imagery.jpg', 'elevation.png', 'elevation-meta.json', 'manifest.json'],
      },
      null,
      2
    )
  );

  console.log('Done — wrote imagery.jpg, elevation.png, elevation-meta.json, manifest.json');
}

main().catch((err) => {
  if (err instanceof SiteTerrainError) {
    console.error(`SiteTerrainError [${err.code}]: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
