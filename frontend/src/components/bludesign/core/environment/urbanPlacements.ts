import { createSeededRandom, hashStringToSeed } from './deterministicRandom';

export type UrbanSceneryKind =
  | 'building'
  | 'street'
  | 'lane-line'
  | 'parking-lot'
  | 'streetlight'
  | 'park'
  | 'urban-tree';

export interface UrbanSceneryPlacement {
  kind: UrbanSceneryKind;
  x: number;
  z: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotationY: number;
  variant: number;
}

export interface UrbanSceneryPlacementInput {
  centerX: number;
  centerZ: number;
  padHalfX: number;
  padHalfZ: number;
  fadeStart: number;
  outerFade?: number;
  facilityHalfX: number;
  facilityHalfZ: number;
  environmentSeed: string;
  cityDensity?: number;
  buildingHeightScale?: number;
  buildingFootprintScale?: number;
  parkFrequency?: number;
  largeParkChance?: number;
  streetWidth?: number;
  blockSize?: number;
  streetTreeDensity?: number;
  sceneryFadeStartScale?: number;
  sceneryFadeEndScale?: number;
}

const DEFAULT_STREET_WIDTH = 10;
const DEFAULT_BLOCK_STEP = 58;
const CITY_BLOCK_LIMIT = 3600;
const BUILDING_LIMIT = 10400;
const RING_ROAD_CLEARANCE_MULTIPLIER = 1.55;

interface CityBlock {
  x: number;
  z: number;
  ix: number;
  iz: number;
}

interface ParkReservation {
  x: number;
  z: number;
  width: number;
  depth: number;
  minIx: number;
  maxIx: number;
  minIz: number;
  maxIz: number;
}

function streetWidth(input: UrbanSceneryPlacementInput): number {
  return input.streetWidth ?? DEFAULT_STREET_WIDTH;
}

function blockStep(input: UrbanSceneryPlacementInput): number {
  return input.blockSize ?? DEFAULT_BLOCK_STEP;
}

function urbanOuterRadius(input: UrbanSceneryPlacementInput): number {
  return input.outerFade ? input.outerFade * 0.92 : input.fadeStart * 1.8;
}

function urbanSceneryExtents(input: UrbanSceneryPlacementInput): { x: number; z: number } {
  const outerRadius = urbanOuterRadius(input);
  return {
    x: Math.min(
      outerRadius * 2.16,
      Math.max(440, Math.max(input.padHalfX, input.facilityHalfX) + 720)
    ),
    z: Math.min(
      outerRadius * 2.08,
      Math.max(370, Math.max(input.padHalfZ, input.facilityHalfZ) + 600)
    ),
  };
}

/** Max axis extent for radial fade; scenery is fully gone by 80% of this distance. */
export function urbanSceneryExtentDistance(input: UrbanSceneryPlacementInput): number {
  const extents = urbanSceneryExtents(input);
  return Math.max(extents.x, extents.z);
}

function radialDistance(input: UrbanSceneryPlacementInput, x: number, z: number): number {
  return Math.hypot(x - input.centerX, z - input.centerZ);
}

function isInsideFacilityBuffer(
  input: UrbanSceneryPlacementInput,
  x: number,
  z: number,
  margin: number
): boolean {
  return (
    Math.abs(x - input.centerX) <= input.padHalfX + margin ||
    Math.abs(x - input.centerX) <= input.facilityHalfX + margin
  ) && (
    Math.abs(z - input.centerZ) <= input.padHalfZ + margin ||
    Math.abs(z - input.centerZ) <= input.facilityHalfZ + margin
  );
}

function facilityRingClearance(input: UrbanSceneryPlacementInput): { clearX: number; clearZ: number } {
  const facilityHalfX = Math.max(input.padHalfX, input.facilityHalfX);
  const facilityHalfZ = Math.max(input.padHalfZ, input.facilityHalfZ);
  const sw = streetWidth(input);
  return {
    clearX: facilityHalfX + sw * RING_ROAD_CLEARANCE_MULTIPLIER,
    clearZ: facilityHalfZ + sw * RING_ROAD_CLEARANCE_MULTIPLIER,
  };
}

function intersectsFacilityRingClearance(
  input: UrbanSceneryPlacementInput,
  x: number,
  z: number,
  width: number,
  depth: number,
  margin = 0
): boolean {
  const { clearX, clearZ } = facilityRingClearance(input);
  const relX = Math.abs(x - input.centerX);
  const relZ = Math.abs(z - input.centerZ);
  return relX - width * 0.5 < clearX + margin && relZ - depth * 0.5 < clearZ + margin;
}

function pushPlacement(
  placements: UrbanSceneryPlacement[],
  placement: Omit<UrbanSceneryPlacement, 'y'>
): void {
  placements.push({ ...placement, y: 0.04 });
}

function pushStreet(
  placements: UrbanSceneryPlacement[],
  x: number,
  z: number,
  width: number,
  depth: number,
  variant: number,
  addLaneLines = true
): void {
  pushPlacement(placements, {
    kind: 'street',
    x,
    z,
    width,
    depth,
    height: 0.04,
    rotationY: 0,
    variant,
  });

  if (!addLaneLines || Math.abs(variant) % 4 === 1) return;

  const horizontal = width >= depth;
  const lineCount = horizontal
    ? Math.max(2, Math.floor(width / 14))
    : Math.max(2, Math.floor(depth / 14));
  for (let i = 0; i < lineCount; i++) {
    const t = (i + 0.5) / lineCount - 0.5;
    pushPlacement(placements, {
      kind: 'lane-line',
      x: horizontal ? x + t * width : x,
      z: horizontal ? z : z + t * depth,
      width: horizontal ? 3.2 : 0.16,
      depth: horizontal ? 0.16 : 3.2,
      height: 0.025,
      rotationY: 0,
      variant,
    });
  }
}

interface UrbanStreetGridContext {
  offsetX: number;
  offsetZ: number;
  xLines: number;
  zLines: number;
  sw: number;
  bs: number;
  clearX: number;
  clearZ: number;
  xExtent: number;
  zExtent: number;
  parkReservations: ParkReservation[];
  outerRadius: number;
}

function tryPushStreetLight(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  grid: UrbanStreetGridContext,
  x: number,
  z: number,
  rotationY: number,
  variant: number
): boolean {
  if (Math.hypot(x - input.centerX, z - input.centerZ) > grid.outerRadius * 0.98) return false;
  if (isInsideFacilityBuffer(input, x, z, 10)) return false;
  if (intersectsFacilityRingClearance(input, x, z, 0.25, 0.25, 1)) return false;
  if (footprintIntersectsParkReservation(x, z, 0.25, 0.25, grid.parkReservations, 1)) return false;

  pushPlacement(placements, {
    kind: 'streetlight',
    x,
    z,
    width: 0.14,
    depth: 0.14,
    height: 4.6 + rng() * 1.2,
    rotationY,
    variant,
  });
  return true;
}

/** Place lamps on sidewalk curbs beside street centerlines — not in travel lanes. */
function addStreetLightsAlongGrid(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  grid: UrbanStreetGridContext
): void {
  const {
    offsetX,
    offsetZ,
    xLines,
    zLines,
    sw,
    bs,
    clearX,
    clearZ,
    xExtent,
    zExtent,
    parkReservations,
  } = grid;
  const streetSpan = Math.max(1, bs - sw);
  const spacing = 46 + rng() * 14;
  const curbOffset = sw * 0.5 + 0.85;
  const maxLights = Math.min(130, Math.max(36, Math.floor(streetSpan * (xLines + zLines) * 0.11)));
  let lightCount = 0;
  let variant = 0;

  const pushLight = (x: number, z: number, rotationY: number): void => {
    if (lightCount >= maxLights) return;
    if (
      tryPushStreetLight(placements, input, rng, grid, x, z, rotationY, variant++)
    ) {
      lightCount++;
    }
  };

  for (let i = -zLines; i <= zLines; i++) {
    for (let j = -xLines; j < xLines; j++) {
      const segmentX = input.centerX + (j + 0.5) * bs + offsetX;
      const streetZ = input.centerZ + i * bs + offsetZ;
      if (
        Math.abs(segmentX - input.centerX) > xExtent ||
        Math.abs(streetZ - input.centerZ) > zExtent ||
        streetSegmentIntersectsFacilityBuffer(input, segmentX, streetZ, streetSpan, sw, clearX, clearZ) ||
        segmentIntersectsParkReservation(segmentX, streetZ, streetSpan, sw, parkReservations)
      ) {
        continue;
      }

      const startX = segmentX - streetSpan * 0.5 + spacing * 0.42;
      const endX = segmentX - streetSpan * 0.5 + spacing * 0.42 + Math.floor(streetSpan / spacing) * spacing;
      for (let x = startX; x <= endX + 0.01; x += spacing) {
        const northSide = (i + j + Math.floor(x)) % 2 === 0;
        if (northSide) {
          pushLight(x, streetZ + curbOffset, Math.PI);
        } else {
          pushLight(x, streetZ - curbOffset, 0);
        }
      }
    }
  }

  for (let i = -xLines; i <= xLines; i++) {
    for (let j = -zLines; j < zLines; j++) {
      const streetX = input.centerX + i * bs + offsetX;
      const segmentZ = input.centerZ + (j + 0.5) * bs + offsetZ;
      if (
        Math.abs(streetX - input.centerX) > xExtent ||
        Math.abs(segmentZ - input.centerZ) > zExtent ||
        streetSegmentIntersectsFacilityBuffer(input, streetX, segmentZ, sw, streetSpan, clearX, clearZ) ||
        segmentIntersectsParkReservation(streetX, segmentZ, sw, streetSpan, parkReservations)
      ) {
        continue;
      }

      const startZ = segmentZ - streetSpan * 0.5 + spacing * 0.42;
      const endZ = segmentZ - streetSpan * 0.5 + spacing * 0.42 + Math.floor(streetSpan / spacing) * spacing;
      for (let z = startZ; z <= endZ + 0.01; z += spacing) {
        const eastSide = (i + j + Math.floor(z)) % 2 === 0;
        if (eastSide) {
          pushLight(streetX + curbOffset, z, -Math.PI * 0.5);
        } else {
          pushLight(streetX - curbOffset, z, Math.PI * 0.5);
        }
      }
    }
  }
}

function pushIntersection(
  placements: UrbanSceneryPlacement[],
  x: number,
  z: number,
  variant: number,
  sw: number
): void {
  pushStreet(placements, x, z, sw, sw, variant, false);
}

function addFacilityRingRoad(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput
): { clearX: number; clearZ: number } {
  const sw = streetWidth(input);
  const facilityHalfX = Math.max(input.padHalfX, input.facilityHalfX);
  const facilityHalfZ = Math.max(input.padHalfZ, input.facilityHalfZ);
  const { clearX, clearZ } = facilityRingClearance(input);
  const ringHalfX = facilityHalfX + sw * 1.05;
  const ringHalfZ = facilityHalfZ + sw * 1.05;
  const ringSpanX = Math.max(sw, ringHalfX * 2 - sw);
  const ringSpanZ = Math.max(sw, ringHalfZ * 2 - sw);

  pushStreet(placements, input.centerX, input.centerZ + ringHalfZ, ringSpanX, sw, 9001);
  pushStreet(placements, input.centerX, input.centerZ - ringHalfZ, ringSpanX, sw, 9002);
  pushStreet(placements, input.centerX + ringHalfX, input.centerZ, sw, ringSpanZ, 9003);
  pushStreet(placements, input.centerX - ringHalfX, input.centerZ, sw, ringSpanZ, 9004);
  pushIntersection(placements, input.centerX + ringHalfX, input.centerZ + ringHalfZ, 9011, sw);
  pushIntersection(placements, input.centerX - ringHalfX, input.centerZ + ringHalfZ, 9012, sw);
  pushIntersection(placements, input.centerX + ringHalfX, input.centerZ - ringHalfZ, 9013, sw);
  pushIntersection(placements, input.centerX - ringHalfX, input.centerZ - ringHalfZ, 9014, sw);

  return { clearX, clearZ };
}

function streetSegmentIntersectsFacilityBuffer(
  input: UrbanSceneryPlacementInput,
  x: number,
  z: number,
  width: number,
  depth: number,
  clearX: number,
  clearZ: number
): boolean {
  const relX = Math.abs(x - input.centerX);
  const relZ = Math.abs(z - input.centerZ);
  return relX - width * 0.5 < clearX && relZ - depth * 0.5 < clearZ;
}

function segmentIntersectsParkReservation(
  x: number,
  z: number,
  width: number,
  depth: number,
  reservations: ParkReservation[]
): boolean {
  return reservations.some(
    (reservation) =>
      Math.abs(x - reservation.x) < width * 0.5 + reservation.width * 0.5 &&
      Math.abs(z - reservation.z) < depth * 0.5 + reservation.depth * 0.5
  );
}

function footprintIntersectsParkReservation(
  x: number,
  z: number,
  width: number,
  depth: number,
  reservations: ParkReservation[],
  margin = 0
): boolean {
  return reservations.some(
    (reservation) =>
      Math.abs(x - reservation.x) < width * 0.5 + reservation.width * 0.5 + margin &&
      Math.abs(z - reservation.z) < depth * 0.5 + reservation.depth * 0.5 + margin
  );
}

function reservationKey(ix: number, iz: number): string {
  return `${ix}:${iz}`;
}

function reservePark(
  reservations: ParkReservation[],
  reservedBlocks: Set<string>,
  input: UrbanSceneryPlacementInput,
  blocksByKey: Map<string, CityBlock>,
  block: CityBlock,
  cols: number,
  rows: number
): boolean {
  const covered: CityBlock[] = [];
  for (let dx = 0; dx < cols; dx++) {
    for (let dz = 0; dz < rows; dz++) {
      const candidate = blocksByKey.get(reservationKey(block.ix + dx, block.iz + dz));
      if (!candidate || reservedBlocks.has(reservationKey(candidate.ix, candidate.iz))) return false;
      covered.push(candidate);
    }
  }

  const minIx = Math.min(...covered.map((candidate) => candidate.ix));
  const maxIx = Math.max(...covered.map((candidate) => candidate.ix));
  const minIz = Math.min(...covered.map((candidate) => candidate.iz));
  const maxIz = Math.max(...covered.map((candidate) => candidate.iz));
  const centerX = covered.reduce((sum, candidate) => sum + candidate.x, 0) / covered.length;
  const centerZ = covered.reduce((sum, candidate) => sum + candidate.z, 0) / covered.length;
  const width = (maxIx - minIx + 1) * blockStep(input) - streetWidth(input) * 1.55;
  const depth = (maxIz - minIz + 1) * blockStep(input) - streetWidth(input) * 1.55;
  if (intersectsFacilityRingClearance(input, centerX, centerZ, width, depth, 1)) return false;

  covered.forEach((candidate) => reservedBlocks.add(reservationKey(candidate.ix, candidate.iz)));
  reservations.push({
    x: centerX,
    z: centerZ,
    width,
    depth,
    minIx,
    maxIx,
    minIz,
    maxIz,
  });
  return true;
}

function createParkReservations(
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  blocks: CityBlock[]
): { reservations: ParkReservation[]; reservedBlocks: Set<string> } {
  const reservations: ParkReservation[] = [];
  const reservedBlocks = new Set<string>();
  const blocksByKey = new Map(blocks.map((block) => [reservationKey(block.ix, block.iz), block]));
  const parkFrequency = input.parkFrequency ?? 1;
  const target = Math.max(3, Math.min(14, Math.floor(blocks.length * 0.042 * parkFrequency)));
  const largeParkThreshold = 1 - (input.largeParkChance ?? 0.18);

  for (let blockIndex = 0; blockIndex < blocks.length && reservations.length < target; blockIndex++) {
    const block = blocks[blockIndex];
    const radial = radialDistance(input, block.x, block.z);
    const parkChance = (radial > Math.max(input.padHalfX, input.padHalfZ) + 32 ? 0.036 : 0.015) * parkFrequency;
    if (blockIndex % 27 !== 5 && rng() >= parkChance) continue;

    const largeRoll = rng();
    const cols = largeRoll > largeParkThreshold ? 2 : largeRoll > 0.62 ? 1 + Math.floor(rng() * 2) : 1;
    const rows = largeRoll > largeParkThreshold ? 2 : cols === 2 ? 1 : largeRoll > 0.62 ? 2 : 1;
    if (reservePark(reservations, reservedBlocks, input, blocksByKey, block, cols, rows)) continue;
    reservePark(reservations, reservedBlocks, input, blocksByKey, block, 1, 1);
  }

  return { reservations, reservedBlocks };
}

function addStreetGrid(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  outerRadius: number
): {
  blocks: CityBlock[];
  parkReservations: ParkReservation[];
  reservedParkBlocks: Set<string>;
  grid: UrbanStreetGridContext;
} {
  const sw = streetWidth(input);
  const bs = blockStep(input);
  const { x: xExtent, z: zExtent } = urbanSceneryExtents(input);
  const { clearX, clearZ } = addFacilityRingRoad(placements, input);
  const offsetX = (rng() - 0.5) * 7;
  const offsetZ = (rng() - 0.5) * 7;
  const xLines = Math.max(5, Math.min(48, Math.ceil(xExtent / bs)));
  const zLines = Math.max(5, Math.min(40, Math.ceil(zExtent / bs)));
  const blocks: CityBlock[] = [];

  for (let ix = -xLines; ix < xLines; ix++) {
    for (let iz = -zLines; iz < zLines; iz++) {
      const x = input.centerX + (ix + 0.5) * bs + offsetX;
      const z = input.centerZ + (iz + 0.5) * bs + offsetZ;
      if (Math.abs(x - input.centerX) > xExtent || Math.abs(z - input.centerZ) > zExtent) continue;
      if (radialDistance(input, x, z) > outerRadius * 2.04) continue;
      if (isInsideFacilityBuffer(input, x, z, 12)) continue;
      if (intersectsFacilityRingClearance(input, x, z, 0, 0, 1)) continue;
      blocks.push({ x, z, ix, iz });
    }
  }

  blocks.sort((a, b) => {
    const da = radialDistance(input, a.x, a.z);
    const db = radialDistance(input, b.x, b.z);
    return da - db;
  });

  const limitedBlocks = blocks.slice(0, CITY_BLOCK_LIMIT);
  const { reservations: parkReservations, reservedBlocks: reservedParkBlocks } = createParkReservations(
    input,
    rng,
    limitedBlocks
  );
  const streetSpan = Math.max(1, bs - sw);

  for (let i = -zLines; i <= zLines; i++) {
    for (let j = -xLines; j < xLines; j++) {
      const segmentX = input.centerX + (j + 0.5) * bs + offsetX;
      const horizontalZ = input.centerZ + i * bs + offsetZ;
      if (
        Math.abs(segmentX - input.centerX) <= xExtent &&
        Math.abs(horizontalZ - input.centerZ) <= zExtent &&
        !streetSegmentIntersectsFacilityBuffer(
          input,
          segmentX,
          horizontalZ,
          streetSpan,
          sw,
          clearX,
          clearZ
        ) &&
        !segmentIntersectsParkReservation(segmentX, horizontalZ, streetSpan, sw, parkReservations)
      ) {
        pushStreet(placements, segmentX, horizontalZ, streetSpan, sw, i * 13 + j);
      }
    }
  }

  for (let i = -xLines; i <= xLines; i++) {
    for (let j = -zLines; j < zLines; j++) {
      const verticalX = input.centerX + i * bs + offsetX;
      const segmentZ = input.centerZ + (j + 0.5) * bs + offsetZ;

      if (
        Math.abs(verticalX - input.centerX) <= xExtent &&
        Math.abs(segmentZ - input.centerZ) <= zExtent &&
        !streetSegmentIntersectsFacilityBuffer(
          input,
          verticalX,
          segmentZ,
          sw,
          streetSpan,
          clearX,
          clearZ
        ) &&
        !segmentIntersectsParkReservation(verticalX, segmentZ, sw, streetSpan, parkReservations)
      ) {
        pushStreet(placements, verticalX, segmentZ, sw, streetSpan, i * 17 + j);
      }
    }
  }

  for (let ix = -xLines; ix <= xLines; ix++) {
    for (let iz = -zLines; iz <= zLines; iz++) {
      const x = input.centerX + ix * bs + offsetX;
      const z = input.centerZ + iz * bs + offsetZ;
      if (
        Math.abs(x - input.centerX) <= xExtent &&
        Math.abs(z - input.centerZ) <= zExtent &&
        !streetSegmentIntersectsFacilityBuffer(input, x, z, sw, sw, clearX, clearZ) &&
        !segmentIntersectsParkReservation(x, z, sw, sw, parkReservations)
      ) {
        pushIntersection(placements, x, z, ix * 19 + iz, sw);
      }
    }
  }

  return { blocks: limitedBlocks, parkReservations, reservedParkBlocks, grid: {
    offsetX,
    offsetZ,
    xLines,
    zLines,
    sw,
    bs,
    clearX,
    clearZ,
    xExtent,
    zExtent,
    parkReservations,
    outerRadius,
  } };
}

function minBuildingSpacingOk(
  placements: UrbanSceneryPlacement[],
  x: number,
  z: number,
  minDist: number
): boolean {
  const minDistSq = minDist * minDist;
  for (const placement of placements) {
    if (placement.kind !== 'building') continue;
    const dx = placement.x - x;
    const dz = placement.z - z;
    if (dx * dx + dz * dz < minDistSq) return false;
  }
  return true;
}

function urbanDensity(input: UrbanSceneryPlacementInput, x: number, z: number, outerRadius: number): number {
  const radial = radialDistance(input, x, z);
  const inner = Math.max(input.padHalfX, input.padHalfZ, input.facilityHalfX, input.facilityHalfZ) + 24;
  if (radial < inner) return 0.18;
  const t = Math.min(1, (radial - inner) / Math.max(outerRadius - inner, 1));
  return 0.46 + Math.sin(t * Math.PI) * 0.22;
}

function addPark(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  park: { x: number; z: number; width: number; depth: number },
  variant: number
): void {
  if (intersectsFacilityRingClearance(input, park.x, park.z, park.width, park.depth, 1)) return;

  const sw = streetWidth(input);
  const bs = blockStep(input);

  pushPlacement(placements, {
    kind: 'park',
    x: park.x,
    z: park.z,
    width: park.width,
    depth: park.depth,
    height: 0.05,
    rotationY: 0,
    variant,
  });

  const blockArea = Math.max(1, Math.round((park.width * park.depth) / (bs * bs)));
  const treeCount = 5 + Math.floor(rng() * 7) + blockArea * 4;
  for (let i = 0; i < treeCount; i++) {
    const x = park.x + (rng() - 0.5) * Math.max(1, park.width - sw * 0.9);
    const z = park.z + (rng() - 0.5) * Math.max(1, park.depth - sw * 0.9);
    if (isInsideFacilityBuffer(input, x, z, 8)) continue;
    if (intersectsFacilityRingClearance(input, x, z, 2.6, 2.6, 1)) continue;
    pushPlacement(placements, {
      kind: 'urban-tree',
      x,
      z,
      width: 1.2 + rng() * 1.4,
      depth: 1.2 + rng() * 1.4,
      height: 4.5 + rng() * 3.5,
      rotationY: rng() * Math.PI * 2,
      variant: variant + i,
    });
  }
}

function addStreetTrees(
  placements: UrbanSceneryPlacement[],
  input: UrbanSceneryPlacementInput,
  rng: () => number,
  blocks: Array<{ x: number; z: number }>,
  parkReservations: ParkReservation[]
): void {
  const bs = blockStep(input);
  const sw = streetWidth(input);
  const treeDensity = input.streetTreeDensity ?? 1;
  const target = Math.min(180, Math.floor(blocks.length * 1.35 * treeDensity));
  for (let i = 0; i < target; i++) {
    const block = blocks[Math.floor(rng() * blocks.length)];
    if (!block) break;
    const alongX = rng() > 0.5;
    const curb = (rng() > 0.5 ? 1 : -1) * (bs * 0.5 - sw * 0.38);
    const x = block.x + (alongX ? (rng() - 0.5) * bs : curb);
    const z = block.z + (alongX ? curb : (rng() - 0.5) * bs);
    if (isInsideFacilityBuffer(input, x, z, 8)) continue;
    if (intersectsFacilityRingClearance(input, x, z, 2, 2, 1)) continue;
    if (footprintIntersectsParkReservation(x, z, 2, 2, parkReservations, 1)) continue;
    pushPlacement(placements, {
      kind: 'urban-tree',
      x,
      z,
      width: 0.9 + rng() * 1.1,
      depth: 0.9 + rng() * 1.1,
      height: 3.8 + rng() * 3.2,
      rotationY: rng() * Math.PI * 2,
      variant: i,
    });
  }
}

export function computeUrbanSceneryPlacements(
  input: UrbanSceneryPlacementInput
): UrbanSceneryPlacement[] {
  const rng = createSeededRandom(hashStringToSeed(`${input.environmentSeed}:urban-scenery`));
  const outerRadius = urbanOuterRadius(input);
  const placements: UrbanSceneryPlacement[] = [];
  const bs = blockStep(input);
  const sw = streetWidth(input);
  const cityDensity = input.cityDensity ?? 1;
  const heightScale = input.buildingHeightScale ?? 1;
  const footprintScale = input.buildingFootprintScale ?? 1;

  const { blocks, parkReservations, reservedParkBlocks, grid } = addStreetGrid(placements, input, rng, outerRadius);
  const buildableBlocks = blocks.filter((block) => !reservedParkBlocks.has(reservationKey(block.ix, block.iz)));
  let buildingCount = 0;
  let parkingCount = 0;

  const buildingTarget = Math.min(
    BUILDING_LIMIT,
    Math.max(90, Math.floor(buildableBlocks.length * 4 * cityDensity))
  );

  for (let blockIndex = 0; blockIndex < buildableBlocks.length; blockIndex++) {
    const block = buildableBlocks[blockIndex];
    const density = urbanDensity(input, block.x, block.z, outerRadius);
    const lotRoll = rng();
    const lotCols = lotRoll > 0.9 ? 1 : lotRoll > 0.62 ? 3 : 2;
    const lotRows = lotRoll > 0.86 ? 1 : lotRoll > 0.68 ? 3 : 2;
    const maxLots = lotCols * lotRows;
    const buildingsInBlock = Math.min(maxLots, 3 + Math.floor(rng() * 2 + density * 1.6 * cityDensity));
    const buildableWidth = bs - sw * 2.7;
    const buildableDepth = bs - sw * 2.7;
    const lotWidth = buildableWidth / lotCols;
    const lotDepth = buildableDepth / lotRows;

    for (
      let i = 0;
      i < buildingsInBlock && buildingCount < buildingTarget;
      i++
    ) {
      const col = i % lotCols;
      const row = Math.floor(i / lotCols) % lotRows;
      const landmark = i === 0 && (blockIndex % 12 === 3 || rng() < 0.12);
      const lotX = landmark ? 0 : ((col + 0.5) / lotCols - 0.5) * buildableWidth;
      const lotZ = landmark ? 0 : ((row + 0.5) / lotRows - 0.5) * buildableDepth;
      const x = block.x + lotX + (rng() - 0.5) * Math.min(2.4, lotWidth * 0.18);
      const z = block.z + lotZ + (rng() - 0.5) * Math.min(2.4, lotDepth * 0.18);
      if (isInsideFacilityBuffer(input, x, z, 16)) continue;
      if (!minBuildingSpacingOk(placements, x, z, Math.min(lotWidth, lotDepth) * 0.72)) continue;

      const maxFootprint = landmark
        ? Math.max(12, Math.min(buildableWidth, buildableDepth) * (0.62 + rng() * 0.1))
        : Math.max(5.5, Math.min(lotWidth, lotDepth) * (0.58 + rng() * 0.24));
      const footprint = Math.max(4.8, maxFootprint * footprintScale);
      const broad = rng() > 0.5;
      const cityCore = radialDistance(input, x, z) > Math.max(input.padHalfX, input.padHalfZ) + 54;
      const heightRoll = rng();
      let height: number;
      if (landmark) {
        height = (26 + Math.pow(rng(), 1.1) * (cityCore ? 78 : 48)) * heightScale;
      } else if (heightRoll < 0.14) {
        height = (5.5 + rng() * 7.5) * heightScale;
      } else if (heightRoll < 0.34) {
        height = (12 + rng() * 18) * heightScale;
      } else {
        height = (14 + Math.pow(rng(), 1.15) * (cityCore ? 72 : 42)) * heightScale;
      }
      const archVariant = Math.floor(rng() * 8);
      const width = landmark
        ? Math.min(buildableWidth * 0.72, footprint * (broad ? 1.2 : 0.95))
        : Math.min(lotWidth * 0.86, footprint * (broad ? 1.28 : 0.92));
      const depth = landmark
        ? Math.min(buildableDepth * 0.66, footprint * (broad ? 0.9 : 1.08))
        : Math.min(lotDepth * 0.86, footprint * (broad ? 0.86 : 1.18));
      if (intersectsFacilityRingClearance(input, x, z, width, depth, 2)) continue;
      if (footprintIntersectsParkReservation(x, z, width, depth, parkReservations, 1.5)) continue;

      pushPlacement(placements, {
        kind: 'building',
        x,
        z,
        width,
        depth,
        height,
        rotationY: Math.round(rng() * 3) * (Math.PI / 2),
        variant: archVariant,
      });
      buildingCount++;
    }
  }

  for (const reservation of parkReservations) {
    addPark(placements, input, rng, reservation, placements.length);
  }

  addStreetTrees(placements, input, rng, buildableBlocks, parkReservations);
  addStreetLightsAlongGrid(placements, input, rng, grid);

  const parkingTarget = Math.min(10, Math.max(3, Math.floor(buildingTarget / 10)));
  for (
    let i = 0;
    i < parkingTarget * 8 && parkingCount < parkingTarget;
    i++
  ) {
    const block = buildableBlocks[Math.floor(rng() * buildableBlocks.length)];
    if (!block) break;
    const x = block.x + (rng() - 0.5) * 9;
    const z = block.z + (rng() - 0.5) * 9;
    const width = 12 + rng() * 16;
    const depth = 8 + rng() * 12;
    if (radialDistance(input, x, z) > outerRadius * 0.72) continue;
    if (isInsideFacilityBuffer(input, x, z, 8)) continue;
    if (intersectsFacilityRingClearance(input, x, z, width, depth, 1)) continue;
    if (footprintIntersectsParkReservation(x, z, width, depth, parkReservations, 1)) continue;
    pushPlacement(placements, {
      kind: 'parking-lot',
      x,
      z,
      width,
      depth,
      height: 0.035,
      rotationY: Math.round(rng() * 3) * (Math.PI / 2),
      variant: i,
    });
    parkingCount++;
  }

  return placements;
}
