/**
 * Grid System
 * 
 * Creates and manages the infinite grid floor with fade effect,
 * and provides grid snapping functionality.
 */

import * as THREE from 'three';
import {
  GridConfig,
  DEFAULT_GRID_CONFIG,
  GridSize,
  GridPosition,
  AssetCategory,
  GRID_UNIT_METERS,
  GridAlignment,
  Orientation,
} from './types';
import { THEME_BACKGROUND_COLORS } from './environment/ScenePresets';

// Layer types for tile occupancy
export type TileLayer = 'ground' | 'object';

// Tile occupancy data
export interface TileOccupancy {
  ground: string | null;  // Object ID of ground tile (grass, pavement, etc.)
  object: string | null;  // Object ID of object on top (units, walls, etc.)
}

// Check if category is a ground type
export function isGroundCategory(category: AssetCategory | string): boolean {
  return [
    AssetCategory.GRASS,
    AssetCategory.GRAVEL,
    AssetCategory.PAVEMENT,
    AssetCategory.FLOOR,
  ].includes(category as AssetCategory);
}

// Custom shader for infinite grid with fade
const gridVertexShader = `
  varying vec3 vWorldPosition;
  
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const gridFragmentShader = `
  precision highp float;

  uniform float uSize;
  uniform float uDivisions;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform float uOpacity;
  uniform float uSecondaryOpacity;
  uniform float uUseAlignment;
  uniform vec2 uAlignOrigin;
  uniform float uAlignYaw;
  uniform float uSnapCellSize;
  uniform vec2 uContentCenter;
  uniform float uFadeStart;
  uniform float uOuterFade;
  uniform vec3 uHorizonColor;
  uniform float uHorizonBlend;
  uniform float uWorldPerPixel;

  varying vec3 vWorldPosition;

  // Adaptive anti-aliased grid line for one cell period (world units).
  // Distance to the nearest line is normalized by this level's own screen-space
  // derivative, so each level self-fades exactly as its spacing goes sub-pixel
  // (no moiré at distance). thicknessPx widens the stroke.
  float getGrid(vec2 coord, float period, float thicknessPx) {
    vec2 r = coord / period;
    vec2 grid = abs(fract(r - 0.5) - 0.5) / fwidth(r);
    float line = min(grid.x, grid.y);
    return 1.0 - min(line / thicknessPx, 1.0);
  }

  void main() {
    vec2 coord = vWorldPosition.xz;
    if (uUseAlignment > 0.5) {
      vec2 rel = vWorldPosition.xz - uAlignOrigin;
      float c = cos(uAlignYaw);
      float s = sin(uAlignYaw);
      coord = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);
    }

    float cellSize = (uUseAlignment > 0.5 && uSnapCellSize > 0.0) ? uSnapCellSize : uSize / uDivisions;

    // Three self-adaptive tiers: minor (1x), major every 10 (2x), super every 100 (3.5x).
    // Each self-fades when its spacing goes sub-pixel (handles extreme zoom-out).
    float gridSuper = getGrid(coord, cellSize * 100.0, 2.0);
    float gridMajor = getGrid(coord, cellSize * 10.0, 1.4);
    float gridMinor = getGrid(coord, cellSize, 1.0);

    // Radial fade from scene content — matches GroundPlaneManager edge dissolve.
    vec2 offset = vWorldPosition.xz - uContentCenter;
    float radial = length(offset);
    float edgeFade = 1.0 - smoothstep(uFadeStart, uOuterFade, radial);
    edgeFade = clamp(edgeFade, 0.0, 1.0);
    if (edgeFade < 0.003) discard;

    // Zoom-based, density-consistent fade: each tier fades when its own cells shrink
    // below a target on-screen size (measured globally at the camera focus, not per
    // fragment). As minor dissolves, major becomes the fine grid, then super — so the
    // apparent cell density stays roughly constant across zoom levels.
    float minorCellPx = cellSize / max(uWorldPerPixel, 1e-6);
    float minorVis = smoothstep(14.0, 30.0, minorCellPx);
    float majorVis = smoothstep(14.0, 30.0, minorCellPx * 10.0);
    float superVis = smoothstep(14.0, 30.0, minorCellPx * 100.0);

    gridSuper *= superVis;
    gridMajor *= majorVis;
    gridMinor *= minorVis;

    float primaryMask = max(gridSuper, gridMajor);
    float lineMask = max(primaryMask, gridMinor * uSecondaryOpacity);

    vec3 lineColor = mix(uSecondaryColor, uPrimaryColor, primaryMask);
    vec3 color = lineColor;
    if (uHorizonBlend > 0.5) {
      color = mix(uHorizonColor, lineColor, edgeFade);
    }

    float alpha = lineMask * uOpacity * edgeFade;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color, alpha);
  }
`;

function cardinalRotationRad(orientation: Orientation): number {
  switch (orientation) {
    case Orientation.NORTH:
      return 0;
    case Orientation.EAST:
      return Math.PI / 2;
    case Orientation.SOUTH:
      return Math.PI;
    case Orientation.WEST:
      return -Math.PI / 2;
    default:
      return 0;
  }
}

export class GridSystem {
  private scene: THREE.Scene;
  private gridMesh: THREE.Mesh | null = null;
  private gridMaterial: THREE.ShaderMaterial | null = null;
  private groundMesh: THREE.Mesh | null = null;
  private config: GridConfig;
  private currentGridSize: GridSize = GridSize.TINY;
  /** When set, grid snapping uses a rotated XZ frame (session-only) */
  private gridAlignment: GridAlignment | null = null;
  
  // Two-layer grid occupancy tracking (floor-aware)
  // Each cell can have a ground layer (grass, pavement, etc.) and an object layer (units, walls, etc.)
  // Key format: "x,z,floor" for floor-aware tracking
  private tileOccupancy: Map<string, TileOccupancy> = new Map();
  private objectMetadata: Map<string, { canStack: boolean; layer: TileLayer; category: AssetCategory | string; floor: number }> = new Map();
  
  // Helper to generate floor-aware cell key
  private getCellKey(x: number, z: number, floor: number = 0): string {
    return `${x},${z},${floor}`;
  }

  constructor(scene: THREE.Scene, config: GridConfig = DEFAULT_GRID_CONFIG) {
    this.scene = scene;
    this.config = config;
  }

  /**
   * Create the grid
   */
  create(): void {
    this.dispose();
    
    const extent = this.config.planeExtentMultiplier ?? 36;
    const planeSize = this.config.size * extent;
    const geometry = new THREE.PlaneGeometry(
      planeSize,
      planeSize,
      1,
      1
    );
    geometry.rotateX(-Math.PI / 2);
    
    const secondaryOpacity = this.config.secondaryOpacity ?? 0.5;
    
    this.gridMaterial = new THREE.ShaderMaterial({
      vertexShader: gridVertexShader,
      fragmentShader: gridFragmentShader,
      uniforms: {
        uSize: { value: this.config.size },
        uDivisions: { value: this.config.divisions },
        uPrimaryColor: { value: new THREE.Color(this.config.primaryColor) },
        uSecondaryColor: { value: new THREE.Color(this.config.secondaryColor) },
        uOpacity: { value: this.config.opacity },
        uSecondaryOpacity: { value: secondaryOpacity },
        uUseAlignment: { value: 0 },
        uAlignOrigin: { value: new THREE.Vector2(0, 0) },
        uAlignYaw: { value: 0 },
        uSnapCellSize: { value: 0 },
        uContentCenter: { value: new THREE.Vector2(0, 0) },
        uFadeStart: { value: this.config.fadeDistance * 0.5 },
        uOuterFade: { value: this.config.fadeDistance * 2.5 },
        uHorizonColor: { value: new THREE.Color(THEME_BACKGROUND_COLORS.dark) },
        uHorizonBlend: { value: 1 },
        uWorldPerPixel: { value: 0.05 },
      },
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      depthTest: true,
    });
    
    this.gridMesh = new THREE.Mesh(geometry, this.gridMaterial);
    this.gridMesh.frustumCulled = false;
    this.gridMesh.renderOrder = -100;
    this.gridMesh.userData.isGrid = true;
    this.gridMesh.userData.selectable = false;
    
    const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.ShadowMaterial({
      opacity: 0.22,
    });
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.position.y = -0.01;
    this.groundMesh.renderOrder = -99;
    this.groundMesh.receiveShadow = true;
    this.groundMesh.userData.isGround = true;
    this.groundMesh.userData.selectable = false;
    this.groundMesh.frustumCulled = false;
    
    this.scene.add(this.gridMesh);
    this.scene.add(this.groundMesh);
    this.applyAlignmentToGridMesh();
  }

  /**
   * Update content-relative fade band (call when scene bounds change or each frame while visible).
   */
  updateContentBounds(bounds: THREE.Box3): void {
    if (!this.gridMaterial) return;

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    const halfX = Math.max(size.x, 1) / 2;
    const halfZ = Math.max(size.z, 1) / 2;
    const maxHalf = Math.max(halfX, halfZ);
    const maxDim = Math.max(size.x, size.z, 8);

    const fadeStart = maxHalf + THREE.MathUtils.clamp(maxDim * 0.35, 10, 55);
    const outerFade = fadeStart + THREE.MathUtils.clamp(maxDim * 2.0, 120, 900);

    (this.gridMaterial.uniforms.uContentCenter.value as THREE.Vector2).set(center.x, center.z);
    this.gridMaterial.uniforms.uFadeStart.value = fadeStart;
    this.gridMaterial.uniforms.uOuterFade.value = outerFade;
  }

  /**
   * Set the global zoom metric (world units covered by one screen pixel at the camera
   * focus). Drives the minor-grid fade so the fine grid is tied to zoom level, not
   * camera angle. Call each frame while the grid is visible.
   */
  setWorldPerPixel(worldPerPixel: number): void {
    if (this.gridMaterial && Number.isFinite(worldPerPixel) && worldPerPixel > 0) {
      this.gridMaterial.uniforms.uWorldPerPixel.value = worldPerPixel;
    }
  }

  /** Match grid horizon dissolve to scene / theme background. */
  setHorizonColor(hex: string): void {
    if (this.gridMaterial) {
      (this.gridMaterial.uniforms.uHorizonColor.value as THREE.Color).set(hex);
    }
  }

  /**
   * @deprecated Fade is content-relative; use {@link updateContentBounds}.
   */
  update(_camera: THREE.Camera): void {
    // Kept for API compatibility — per-frame camera uniforms are no longer used.
  }

  /**
   * Whether the ground/grid plane is currently shown.
   */
  isGridVisible(): boolean {
    return this.gridMesh?.visible ?? false;
  }

  /**
   * Set grid visibility
   */
  setVisible(visible: boolean): void {
    if (this.gridMesh) {
      this.gridMesh.visible = visible;
    }
    // Ground mesh visibility follows grid visibility
    if (this.groundMesh) {
      this.groundMesh.visible = visible;
    }
  }

  /**
   * Set grid Y position (for multi-floor support)
   * Grid is offset slightly below the actual floor level to prevent z-fighting
   * Note: groundMesh stays at y=-0.01 always (true ground plane for shadows)
   */
  setGridY(y: number): void {
    if (this.gridMesh) {
      // When y=0 (ground floor), grid should be at 0, not negative (to stay above ground mesh)
      // For upper floors, offset slightly below floor level
      this.gridMesh.position.y = y;
      this.applyAlignmentToGridMesh();
    }
    // Ground mesh stays at y=-0.01 always - don't move it
  }

  /**
   * Get current grid Y position
   */
  getGridY(): number {
    return this.gridMesh?.position.y ?? 0;
  }

  /**
   * Set grid size for snapping
   */
  setGridSize(size: GridSize): void {
    this.currentGridSize = size;
    
    if (this.gridMaterial) {
      // Update divisions based on grid size
      // Smaller grid size = more divisions visible
      const divisionsMultiplier = GridSize.TINY / size;
      this.gridMaterial.uniforms.uDivisions.value = this.config.divisions * divisionsMultiplier;
    }
  }

  /**
   * Get current grid size in meters
   * Returns the actual size of one grid cell based on the GridSize multiplier
   */
  getGridSize(): number {
    // GridSize is a multiplier of GRID_UNIT_METERS (0.6096m = 2 feet)
    return this.currentGridSize * GRID_UNIT_METERS;
  }
  
  /**
   * Get current grid size multiplier (the raw GridSize enum value)
   */
  getGridSizeMultiplier(): GridSize {
    return this.currentGridSize;
  }

  /**
   * Active working grid alignment (null = world axes)
   */
  getGridAlignment(): GridAlignment | null {
    return this.gridAlignment;
  }

  /**
   * Set rotated working grid for snapping (or null to restore world axes).
   * Updates visual grid orientation/pivot.
   */
  setGridAlignment(alignment: GridAlignment | null): void {
    this.gridAlignment = alignment;
    this.applyAlignmentToGridMesh();
  }

  private applyAlignmentToGridMesh(): void {
    if (!this.gridMesh) return;
    const y = this.gridMesh.position.y;
    if (this.gridAlignment) {
      this.gridMesh.position.set(this.gridAlignment.originX, y, this.gridAlignment.originZ);
      // Yaw is applied only via uAlignYaw + gridToWorld math; rotating the mesh would double-apply it vs snapping.
      this.gridMesh.rotation.set(0, 0, 0);
    } else {
      this.gridMesh.position.set(0, y, 0);
      this.gridMesh.rotation.set(0, 0, 0);
    }
    this.syncGridShaderAlignmentUniforms();
  }

  /**
   * Fragment shader draws lines in world XZ; rotate pattern into the working frame when alignment is active.
   */
  private syncGridShaderAlignmentUniforms(): void {
    if (!this.gridMaterial) return;
    if (this.gridAlignment) {
      this.gridMaterial.uniforms.uUseAlignment.value = 1;
      this.gridMaterial.uniforms.uAlignOrigin.value.set(
        this.gridAlignment.originX,
        this.gridAlignment.originZ
      );
      this.gridMaterial.uniforms.uAlignYaw.value = this.gridAlignment.yaw;
      this.gridMaterial.uniforms.uSnapCellSize.value = this.getGridSize();
    } else {
      this.gridMaterial.uniforms.uUseAlignment.value = 0;
      this.gridMaterial.uniforms.uAlignOrigin.value.set(0, 0);
      this.gridMaterial.uniforms.uAlignYaw.value = 0;
      this.gridMaterial.uniforms.uSnapCellSize.value = 0;
    }
  }

  /** World XZ → local U/V (horizontal) relative to alignment origin */
  private worldDeltaToLocalUV(dx: number, dz: number): { u: number; v: number } {
    if (!this.gridAlignment) {
      return { u: dx, v: dz };
    }
    const { yaw } = this.gridAlignment;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return {
      u: dx * c - dz * s,
      v: dx * s + dz * c,
    };
  }

  private localUVToWorldDelta(u: number, v: number): { x: number; z: number } {
    if (!this.gridAlignment) {
      return { x: u, z: v };
    }
    const { yaw } = this.gridAlignment;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return {
      x: u * c + v * s,
      z: -u * s + v * c,
    };
  }

  /** Convert a grid-frame delta (in cells) to a world XZ delta, accounting for alignment rotation. */
  gridDeltaToWorldDelta(deltaU: number, deltaV: number): { x: number; z: number } {
    const gs = this.getGridSize();
    return this.localUVToWorldDelta(deltaU * gs, deltaV * gs);
  }

  /**
   * World-space indices on the default world grid (always axis-aligned), for building/occupancy that use world cells.
   */
  worldToWorldGrid(worldPos: THREE.Vector3): GridPosition {
    const size = this.getGridSize();
    return {
      x: Math.round(worldPos.x / size),
      z: Math.round(worldPos.z / size),
      y: worldPos.y,
    };
  }

  /**
   * Combined placement mesh rotation: alignment base + cardinal orientation (matches PlacementManager convention).
   */
  getPlacementWorldRotation(orientation: Orientation): number {
    const card = cardinalRotationRad(orientation);
    if (!this.gridAlignment) {
      return card;
    }
    return this.gridAlignment.yaw + card;
  }

  /**
   * World-axis cells used for occupancy when the working grid is rotated.
   * Maps each aligned sub-cell to the world cell containing that sub-cell's center (via {@link worldToWorldGrid}).
   * The previous AABB-over-union approach inflated footprints and blocked flush adjacent placements.
   */
  collectWorldCellsCoveringAlignedFootprint(
    anchorAligned: GridPosition,
    footprint: { x: number; z: number }
  ): Array<{ x: number; z: number }> {
    const seen = new Set<string>();
    const out: Array<{ x: number; z: number }> = [];
    const y = anchorAligned.y ?? 0;

    for (let du = 0; du < footprint.x; du++) {
      for (let dv = 0; dv < footprint.z; dv++) {
        const center = this.gridToWorld({
          x: anchorAligned.x + du + 0.5,
          z: anchorAligned.z + dv + 0.5,
          y,
        });
        const g = this.worldToWorldGrid(center);
        const key = `${g.x},${g.z}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ x: g.x, z: g.z });
      }
    }
    return out;
  }

  /**
   * Axis-aligned world XZ bounds covering a footprint expressed in the current grid frame.
   */
  getFootprintWorldAabb(
    anchor: GridPosition,
    footprint: { x: number; z: number }
  ): { minX: number; maxX: number; minZ: number; maxZ: number } {
    const c = [
      this.gridToWorld({ x: anchor.x, z: anchor.z, y: 0 }),
      this.gridToWorld({ x: anchor.x + footprint.x, z: anchor.z, y: 0 }),
      this.gridToWorld({ x: anchor.x, z: anchor.z + footprint.z, y: 0 }),
      this.gridToWorld({ x: anchor.x + footprint.x, z: anchor.z + footprint.z, y: 0 }),
    ];
    return {
      minX: Math.min(...c.map((p) => p.x)),
      maxX: Math.max(...c.map((p) => p.x)),
      minZ: Math.min(...c.map((p) => p.z)),
      maxZ: Math.max(...c.map((p) => p.z)),
    };
  }

  /**
   * True if any world cell overlapping the aligned footprint is occupied.
   */
  isOccupiedAlignedFootprint(
    anchorAligned: GridPosition,
    footprint: { x: number; z: number },
    canStack: boolean,
    category: AssetCategory | string | undefined,
    floor: number
  ): boolean {
    const cells = this.collectWorldCellsCoveringAlignedFootprint(anchorAligned, footprint);
    for (const { x, z } of cells) {
      if (this.isOccupied({ x, z, y: 0 }, { x: 1, z: 1 }, canStack, category, floor)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Mark world cells covering an aligned footprint (delegates to 1×1 markOccupied per cell).
   */
  markOccupiedAlignedFootprint(
    objectId: string,
    anchorAligned: GridPosition,
    footprint: { x: number; z: number },
    canStack: boolean,
    category: AssetCategory | string | undefined,
    floor: number
  ): string | null {
    const cells = this.collectWorldCellsCoveringAlignedFootprint(anchorAligned, footprint);
    let replacedGroundId: string | null = null;
    for (const { x, z } of cells) {
      const r = this.markOccupied(
        objectId,
        { x, z, y: 0 },
        { x: 1, z: 1 },
        canStack,
        category,
        floor
      );
      if (r && !replacedGroundId) replacedGroundId = r;
    }
    return replacedGroundId;
  }

  /**
   * Snap a world position to the grid
   */
  snapToGrid(position: THREE.Vector3): GridPosition {
    const g = this.worldToGrid(new THREE.Vector3(position.x, position.y, position.z));
    const corner = this.gridToWorld(g);
    return {
      x: corner.x,
      z: corner.z,
      y: position.y,
    };
  }

  /**
   * World XZ center of a footprint whose min-corner cell is `anchor` (grid indices, may be fractional).
   * Matches mesh placement when pivot is at footprint center (see PlacementManager / placement coordinator).
   */
  getFootprintCenterWorld(
    anchor: GridPosition,
    footprintCells: { x: number; z: number }
  ): THREE.Vector3 {
    return this.gridToWorld({
      x: anchor.x + footprintCells.x / 2,
      z: anchor.z + footprintCells.z / 2,
      y: anchor.y,
    });
  }

  /**
   * Convert grid position to world position (min corner of cell in current frame)
   */
  gridToWorld(gridPos: GridPosition): THREE.Vector3 {
    const size = this.getGridSize();
    const lu = gridPos.x * size;
    const lv = gridPos.z * size;
    if (!this.gridAlignment) {
      return new THREE.Vector3(lu, gridPos.y ?? 0, lv);
    }
    const { originX, originZ } = this.gridAlignment;
    const w = this.localUVToWorldDelta(lu, lv);
    return new THREE.Vector3(originX + w.x, gridPos.y ?? 0, originZ + w.z);
  }

  /**
   * Convert world position to grid position (indices in current frame)
   */
  worldToGrid(worldPos: THREE.Vector3): GridPosition {
    const size = this.getGridSize();
    if (!this.gridAlignment) {
      return {
        x: Math.round(worldPos.x / size),
        z: Math.round(worldPos.z / size),
        y: worldPos.y,
      };
    }
    const dx = worldPos.x - this.gridAlignment.originX;
    const dz = worldPos.z - this.gridAlignment.originZ;
    const { u, v } = this.worldDeltaToLocalUV(dx, dz);
    return {
      x: Math.round(u / size),
      z: Math.round(v / size),
      y: worldPos.y,
    };
  }

  /**
   * Check if a position is valid on the grid
   */
  isValidPosition(gridPos: GridPosition, objectSize: { x: number; z: number }): boolean {
    void objectSize;
    // Check bounds
    const halfSize = this.config.size / 2;
    const size = this.getGridSize(); // Size in meters
    const worldX = gridPos.x * size;
    const worldZ = gridPos.z * size;

    return (
      worldX >= -halfSize && worldX <= halfSize &&
      worldZ >= -halfSize && worldZ <= halfSize
    );
  }

  /**
   * Get grid cells occupied by an object
   */
  getOccupiedCells(
    position: GridPosition,
    size: { x: number; z: number },
    orientation: number
  ): GridPosition[] {
    const cells: GridPosition[] = [];
    
    // Swap dimensions if rotated 90 or 270 degrees
    const isRotated = orientation === 90 || orientation === 270;
    const sizeX = isRotated ? size.z : size.x;
    const sizeZ = isRotated ? size.x : size.z;
    
    for (let x = 0; x < sizeX; x++) {
      for (let z = 0; z < sizeZ; z++) {
        cells.push({
          x: position.x + x,
          z: position.z + z,
          y: position.y,
        });
      }
    }
    
    return cells;
  }

  /**
   * Update grid colors
   */
  setColors(primary: string, secondary: string): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uPrimaryColor.value.set(primary);
      this.gridMaterial.uniforms.uSecondaryColor.value.set(secondary);
    }
  }

  /**
   * Update fade distance
   */
  setFadeDistance(distance: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uFadeDistance.value = distance;
    }
  }

  /**
   * Update opacity
   */
  setOpacity(opacity: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uOpacity.value = opacity;
    }
  }

  /**
   * Update secondary grid opacity (fine lines)
   */
  setSecondaryOpacity(opacity: number): void {
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uSecondaryOpacity.value = opacity;
    }
  }

  /**
   * Apply a full config update (for theme changes)
   */
  applyConfig(config: GridConfig): void {
    this.config = config;
    if (this.gridMaterial) {
      this.gridMaterial.uniforms.uPrimaryColor.value.set(config.primaryColor);
      this.gridMaterial.uniforms.uSecondaryColor.value.set(config.secondaryColor);
      this.gridMaterial.uniforms.uOpacity.value = config.opacity;
      this.gridMaterial.uniforms.uSecondaryOpacity.value = config.secondaryOpacity ?? 0.5;
      this.syncGridShaderAlignmentUniforms();
    }
  }

  /**
   * Determine which layer an asset should occupy
   */
  getLayerForCategory(category: AssetCategory | string): TileLayer {
    return isGroundCategory(category) ? 'ground' : 'object';
  }

  /**
   * Check if a grid position is occupied for the given layer (floor-aware)
   * Ground layer: Cannot place ground on ground (returns true if ground exists)
   * Object layer: Check if object exists, walls can stack with non-walls
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls can overlap)
   * @param category Asset category to determine layer
   * @param floor Floor level to check (default 0)
   * @returns true if occupied (cannot place), false if available
   */
  isOccupied(
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean, 
    category?: AssetCategory | string,
    floor: number = 0
  ): boolean {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    
    // Check all cells this object would occupy on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        const tile = this.tileOccupancy.get(cellKey);
        
        if (!tile) continue;
        
        if (layer === 'ground') {
          // Ground on ground = replace, but we need to return true to trigger replacement logic
          // Actually, for isOccupied to signal "cannot place", we return true only if same layer occupied
          if (tile.ground) {
            // Ground exists - will be replaced, but that's handled separately
            // Return false to allow placement (which will trigger replacement)
            // Actually, return a special indicator - let's use a different check
            continue; // Ground can always be placed (replaces existing)
          }
        } else {
          // Object layer - check for conflicts
          if (tile.object) {
            const existingObj = this.objectMetadata.get(tile.object);
            if (!existingObj) continue;
            
            // If both are walls (both canStack), cannot place
            if (canStack && existingObj.canStack) {
              return true; // Both walls - invalid
            }
            
            // If neither can stack, cannot place
            if (!canStack && !existingObj.canStack) {
              return true; // Both solid objects - invalid
            }
            
            // Otherwise one is a wall and one isn't - can stack
          }
        }
      }
    }
    
    return false; // All cells are free or stackable
  }

  /**
   * Check if a grid position is occupied, excluding specified object IDs
   * Used for movement validation where the objects being moved should be excluded
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls can overlap)
   * @param category Asset category to determine layer
   * @param floor Floor level to check
   * @param excludeIds Set of object IDs to exclude from collision check
   * @returns true if occupied (cannot place), false if available
   */
  isOccupiedExcluding(
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean, 
    category: AssetCategory | string | undefined,
    floor: number,
    excludeIds: Set<string>
  ): boolean {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    
    // Check all cells this object would occupy on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        const tile = this.tileOccupancy.get(cellKey);
        
        if (!tile) continue;
        
        if (layer === 'ground') {
          // Ground can always be placed (replaces existing)
          continue;
        } else {
          // Object layer - check for conflicts
          if (tile.object && !excludeIds.has(tile.object)) {
            const existingObj = this.objectMetadata.get(tile.object);
            if (!existingObj) continue;
            
            // If both are walls (both canStack), cannot place
            if (canStack && existingObj.canStack) {
              return true; // Both walls - invalid
            }
            
            // If neither can stack, cannot place
            if (!canStack && !existingObj.canStack) {
              return true; // Both solid objects - invalid
            }
            
            // Otherwise one is a wall and one isn't - can stack
          }
        }
      }
    }
    
    return false; // All cells are free or stackable (excluding the moving objects)
  }

  /**
   * Get existing ground at a position (for replacement logic)
   * @param gridPos Grid position
   * @param floor Floor level (default 0)
   */
  getGroundAt(gridPos: GridPosition, floor: number = 0): string | null {
    const cellKey = this.getCellKey(gridPos.x, gridPos.z, floor);
    const tile = this.tileOccupancy.get(cellKey);
    return tile?.ground ?? null;
  }

  /**
   * Mark cells as occupied by an object (floor-aware)
   * @param objectId Unique object ID
   * @param gridPos Starting grid position
   * @param size Size in grid units
   * @param canStack Whether this object can stack (walls)
   * @param category Asset category to determine layer
   * @param floor Floor level (default 0)
   * @returns Object ID of replaced ground (if any)
   */
  markOccupied(
    objectId: string, 
    gridPos: GridPosition, 
    size: { x: number; z: number }, 
    canStack: boolean = false,
    category?: AssetCategory | string,
    floor: number = 0
  ): string | null {
    const layer = category ? this.getLayerForCategory(category) : 'object';
    let replacedGroundId: string | null = null;
    
    // Store object metadata with floor information
    this.objectMetadata.set(objectId, { canStack, layer, category: category ?? 'unknown', floor });
    
    // Mark cells as occupied on the specified floor
    for (let x = 0; x < size.x; x++) {
      for (let z = 0; z < size.z; z++) {
        const cellKey = this.getCellKey(gridPos.x + x, gridPos.z + z, floor);
        
        // Get or create tile occupancy
        let tile = this.tileOccupancy.get(cellKey);
        if (!tile) {
          tile = { ground: null, object: null };
          this.tileOccupancy.set(cellKey, tile);
        }
        
        if (layer === 'ground') {
          // Replace existing ground if any
          if (tile.ground) {
            replacedGroundId = tile.ground;
          }
          tile.ground = objectId;
        } else {
          // Mark object layer
          tile.object = objectId;
        }
      }
    }
    
    return replacedGroundId;
  }

  /**
   * Clear occupied cells for an object (searches across all floors)
   */
  clearOccupied(objectId: string): void {
    const metadata = this.objectMetadata.get(objectId);
    if (!metadata) {
      // Fallback to searching all tiles (across all floors)
      for (const [key, tile] of this.tileOccupancy.entries()) {
        if (tile.ground === objectId) {
          tile.ground = null;
        }
        if (tile.object === objectId) {
          tile.object = null;
        }
        // Clean up empty tiles
        if (!tile.ground && !tile.object) {
          this.tileOccupancy.delete(key);
        }
      }
      return;
    }
    
    const layer = metadata.layer;
    
    // Remove from all tiles on the appropriate layer (across all floors since we search by objectId)
    for (const [key, tile] of this.tileOccupancy.entries()) {
      if (layer === 'ground' && tile.ground === objectId) {
        tile.ground = null;
      } else if (layer === 'object' && tile.object === objectId) {
        tile.object = null;
      }
      
      // Clean up empty tiles
      if (!tile.ground && !tile.object) {
        this.tileOccupancy.delete(key);
      }
    }
    
    // Remove metadata
    this.objectMetadata.delete(objectId);
  }

  /**
   * Clear all occupancy data
   */
  clearAllOccupancy(): void {
    this.tileOccupancy.clear();
    this.objectMetadata.clear();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.gridMesh) {
      this.scene.remove(this.gridMesh);
      this.gridMesh.geometry.dispose();
      this.gridMesh = null;
    }
    
    if (this.gridMaterial) {
      this.gridMaterial.dispose();
      this.gridMaterial = null;
    }
    
    // Remove ground plane mesh
    if (this.groundMesh) {
      this.scene.remove(this.groundMesh);
      this.groundMesh.geometry.dispose();
      if (this.groundMesh.material) {
        (this.groundMesh.material as THREE.Material).dispose();
      }
      this.groundMesh = null;
    }
    
    // Clear occupancy
    this.clearAllOccupancy();
  }
}

