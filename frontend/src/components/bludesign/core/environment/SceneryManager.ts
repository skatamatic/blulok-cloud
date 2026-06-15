/**
 * Procedural scenery for outdoor ground presets — deterministic instanced scatter.
 */

import * as THREE from 'three';
import {
  computeWoodlandTreePlacements,
  type WoodlandSceneryAssetId,
  type WoodlandTreePlacementInput,
} from './woodlandTreePlacements';
import {
  computeUrbanSceneryPlacements,
  urbanSceneryExtentDistance,
  type UrbanSceneryPlacement,
  type UrbanSceneryPlacementInput,
} from './urbanPlacements';
import { computeWoodlandWaterLayout, waterOptionsFrom } from './woodlandWater';
import { createWoodlandWaterSurface, type WoodlandWaterSurface } from './woodlandWaterSurface';

export interface SceneryManagerOptions {
  scene: THREE.Scene;
}

export class SceneryManager {
  private scene: THREE.Scene;
  private root: THREE.Group | null = null;
  private active = false;
  private water: WoodlandWaterSurface | null = null;
  private elapsedSeconds = 0;
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempScale = new THREE.Vector3();

  constructor(options: SceneryManagerOptions) {
    this.scene = options.scene;
  }

  isActive(): boolean {
    return this.active;
  }

  applyWoodland(input: WoodlandTreePlacementInput): void {
    this.clear();

    const placements = computeWoodlandTreePlacements(input);
    if (placements.length === 0) return;

    this.root = new THREE.Group();
    this.root.name = 'WoodlandScenery';
    this.root.userData.isViewerScenery = true;

    const batches = new Map<string, THREE.Matrix4[]>();
    const push = (key: string, matrix: THREE.Matrix4) => {
      const list = batches.get(key) ?? [];
      list.push(matrix.clone());
      batches.set(key, list);
    };

    for (const placement of placements) {
      const fade = this.sceneryFade(placement.x, placement.z, input);
      if (fade <= 0.035) continue;
      this.addPlacementInstances(push, placement.assetId, placement.scale, placement.rotationY, fade, {
        x: placement.x,
        y: placement.y,
        z: placement.z,
      });
    }

    this.addInstancedMeshes(batches);

    const waterLayout = computeWoodlandWaterLayout(input, input.environmentSeed, waterOptionsFrom(input));
    const water = createWoodlandWaterSurface(waterLayout);
    if (water) {
      this.water = water;
      this.root.add(water.group);
    }

    this.scene.add(this.root);
    this.active = true;
  }

  /** Advance animated scenery (woodland water ripples). */
  update(deltaSeconds: number): void {
    if (!this.water) return;
    this.elapsedSeconds += deltaSeconds;
    this.water.update(this.elapsedSeconds);
  }

  applyUrban(input: UrbanSceneryPlacementInput): void {
    this.clear();

    const placements = computeUrbanSceneryPlacements(input);
    if (placements.length === 0) return;

    this.root = new THREE.Group();
    this.root.name = 'UrbanScenery';
    this.root.userData.isViewerScenery = true;

    const batches = new Map<string, THREE.Matrix4[]>();
    const push = (key: string, matrix: THREE.Matrix4) => {
      const list = batches.get(key) ?? [];
      list.push(matrix.clone());
      batches.set(key, list);
    };

    for (const placement of placements) {
      const fade = this.urbanSceneryFade(placement.x, placement.z, input);
      if (fade <= 0.035) continue;
      this.addUrbanPlacementInstances(push, placement, fade);
    }

    this.addInstancedMeshes(batches);

    this.scene.add(this.root);
    this.active = true;
  }

  private sceneryFade(x: number, z: number, input: WoodlandTreePlacementInput): number {
    const dx = x - input.centerX;
    const dz = z - input.centerZ;
    const radial = Math.hypot(dx, dz);
    const fadeStart = (input.outerFade ?? input.fadeStart * 1.55) * 0.62;
    const fadeEnd = (input.outerFade ?? input.fadeStart * 1.55) * 0.92;
    const t = THREE.MathUtils.smoothstep(radial, fadeStart, fadeEnd);
    return 1 - t;
  }

  private urbanSceneryFade(x: number, z: number, input: UrbanSceneryPlacementInput): number {
    const dx = x - input.centerX;
    const dz = z - input.centerZ;
    const radial = Math.hypot(dx, dz);
    const extent = urbanSceneryExtentDistance(input);
    const fadeStartScale = input.sceneryFadeStartScale ?? 1;
    const fadeEndScale = input.sceneryFadeEndScale ?? 1;
    const fadeStart = extent * 0.48 * fadeStartScale;
    const fadeEnd = extent * 0.8 * fadeEndScale;
    const t = THREE.MathUtils.smoothstep(radial, fadeStart, fadeEnd);
    return 1 - t;
  }

  private fadeBucket(fade: number): 'near' | 'mid' | 'far' {
    if (fade > 0.78) return 'near';
    if (fade > 0.38) return 'mid';
    return 'far';
  }

  private addPlacementInstances(
    push: (key: string, matrix: THREE.Matrix4) => void,
    assetId: WoodlandSceneryAssetId,
    scale: number,
    rotationY: number,
    fade: number,
    base: { x: number; y: number; z: number }
  ): void {
    const bucket = this.fadeBucket(fade);
    if (assetId === 'shrub-round') {
      this.compose(push, `shrub:${bucket}`, base, rotationY, [0, 0.45 * scale, 0], [
        1.06 * scale,
        0.62 * scale,
        0.86 * scale,
      ]);
      this.composeShadow(push, `shadow:${bucket}`, base, 1.0 * scale);
      return;
    }

    if (assetId.includes('pine')) {
      const large = assetId === 'tree-pine-large';
      const height = (large ? 8.8 : 6.8) * scale;
      const radius = (large ? 1.65 : 1.28) * scale;
      this.compose(push, `trunk:${bucket}`, base, rotationY, [0, height * 0.19, 0], [
        0.22 * scale,
        height * 0.38,
        0.22 * scale,
      ]);
      const levels = large ? 5 : 4;
      for (let i = 0; i < levels; i++) {
        const t = i / Math.max(levels - 1, 1);
        this.compose(push, `pine:${bucket}`, base, rotationY + t * 0.7, [0, height * (0.36 + t * 0.13), 0], [
          radius * (1 - t * 0.14),
          height * (0.34 - t * 0.035),
          radius * (1 - t * 0.14),
        ]);
      }
      this.composeShadow(push, `shadow:${bucket}`, base, radius * 1.25);
      return;
    }

    const small = assetId === 'tree-oak-small';
    const height = (small ? 5.4 : 7.5) * scale;
    const radius = (small ? 1.38 : 2.05) * scale;
    this.compose(push, `trunk:${bucket}`, base, rotationY, [0, height * 0.26, 0], [
      0.28 * scale,
      height * 0.52,
      0.28 * scale,
    ]);
    const blobs = small
      ? [
          [0, 0.72, 0, 0.85],
          [0.42, 0.62, 0.1, 0.58],
          [-0.35, 0.64, -0.18, 0.55],
        ]
      : [
          [0, 0.71, 0, 1.0],
          [0.52, 0.62, 0.16, 0.67],
          [-0.55, 0.63, -0.24, 0.72],
          [0.08, 0.82, -0.38, 0.56],
          [-0.24, 0.77, 0.46, 0.62],
        ];
    for (const [x, y, z, r] of blobs) {
      this.compose(push, `oak:${bucket}`, base, rotationY, [x * scale, height * y, z * scale], [
        radius * r,
        radius * r * (0.82 + r * 0.18),
        radius * r,
      ]);
    }
    this.composeShadow(push, `shadow:${bucket}`, base, radius * 1.55);
  }

  private addUrbanPlacementInstances(
    push: (key: string, matrix: THREE.Matrix4) => void,
    placement: UrbanSceneryPlacement,
    fade: number
  ): void {
    const bucket = this.fadeBucket(fade);
    const base = { x: placement.x, y: placement.y, z: placement.z };

    if (placement.kind === 'street' || placement.kind === 'parking-lot') {
      this.compose(push, `${placement.kind}:${bucket}`, base, placement.rotationY, [0, 0.34, 0], [
        placement.width,
        placement.height,
        placement.depth,
      ]);
      return;
    }

    if (placement.kind === 'park') {
      this.compose(push, `park:${bucket}`, base, placement.rotationY, [0, 0.38, 0], [
        placement.width,
        placement.height,
        placement.depth,
      ]);
      return;
    }

    if (placement.kind === 'lane-line') {
      this.compose(push, `lane-line:${bucket}`, base, placement.rotationY, [0, 0.5, 0], [
        placement.width,
        placement.height,
        placement.depth,
      ]);
      return;
    }

    if (placement.kind === 'urban-tree') {
      this.compose(push, `urban-trunk:${bucket}`, base, placement.rotationY, [0, placement.height * 0.34, 0], [
        0.18 * placement.width,
        placement.height * 0.68,
        0.18 * placement.depth,
      ]);
      this.compose(push, `urban-tree:${bucket}`, base, placement.rotationY, [0, placement.height * 0.86, 0], [
        placement.width,
        placement.height * 0.5,
        placement.depth,
      ]);
      return;
    }

    if (placement.kind === 'streetlight') {
      const poleH = placement.height;
      const armLen = 1.28 + (placement.variant % 3) * 0.08;
      this.compose(push, `light-pole:${bucket}`, base, placement.rotationY, [0, poleH * 0.5, 0], [
        placement.width,
        poleH,
        placement.depth,
      ]);
      this.compose(push, `light-arm:${bucket}`, base, placement.rotationY, [armLen * 0.48, poleH - 0.08, 0], [
        armLen,
        0.07,
        0.07,
      ]);
      this.compose(push, `light-head:${bucket}`, base, placement.rotationY, [armLen * 0.94, poleH + 0.06, 0], [
        0.55,
        0.14,
        0.32,
      ]);
      return;
    }

    this.addUrbanBuildingInstances(push, placement, bucket, base);
  }

  private static readonly BUILDING_STYLE_COUNT = 8;

  private addUrbanBuildingInstances(
    push: (key: string, matrix: THREE.Matrix4) => void,
    placement: UrbanSceneryPlacement,
    bucket: 'near' | 'mid' | 'far',
    base: { x: number; y: number; z: number }
  ): void {
    const style = placement.variant % SceneryManager.BUILDING_STYLE_COUNT;
    const bodyKey = `building-${style}:${bucket}`;
    const roofKey = `roof:${bucket}`;
    const detailLevel = bucket === 'near' ? 2 : bucket === 'mid' ? 1 : 0;
    const colorShift = Math.floor(placement.variant / SceneryManager.BUILDING_STYLE_COUNT) % 3;

    const addBody = (
      key: string,
      y: number,
      height: number,
      width: number,
      depth: number,
      xOffset = 0,
      zOffset = 0
    ) => {
      this.compose(push, key, base, placement.rotationY, [xOffset, y + height * 0.5, zOffset], [
        width,
        height,
        depth,
      ]);
    };

    const topY = placement.height;
    let facadeWidth = placement.width;
    let facadeDepth = placement.depth;
    let facadeXOffset = 0;
    const facadeZOffset = 0;

    if (style === 1 && placement.height > 22) {
      const podiumH = Math.min(11, placement.height * 0.28);
      const towerH = placement.height - podiumH;
      facadeWidth = placement.width * 0.68;
      facadeDepth = placement.depth * 0.72;
      addBody(bodyKey, 0, podiumH, placement.width, placement.depth);
      addBody(bodyKey, podiumH, towerH, facadeWidth, facadeDepth);
    } else if (style === 2 && placement.height > 26) {
      const lowerH = placement.height * 0.58;
      const upperH = placement.height - lowerH;
      facadeWidth = placement.width * 0.76;
      facadeDepth = placement.depth * 0.74;
      facadeXOffset = placement.width * 0.06;
      addBody(bodyKey, 0, lowerH, placement.width, placement.depth);
      addBody(bodyKey, lowerH, upperH, facadeWidth, facadeDepth, facadeXOffset);
    } else if (style === 4 && placement.height > 18) {
      const annexH = placement.height * 0.42;
      addBody(bodyKey, 0, placement.height, placement.width * 0.72, placement.depth);
      addBody(bodyKey, 0, annexH, placement.width * 0.32, placement.depth * 0.82, placement.width * 0.28);
      facadeWidth = placement.width * 0.72;
    } else if (style === 5) {
      addBody(bodyKey, 0, placement.height, placement.width, placement.depth * 0.88);
      facadeDepth = placement.depth * 0.88;
    } else if (style === 6 && placement.height > 20) {
      const towerW = placement.width * 0.34;
      const towerD = placement.depth * 0.34;
      facadeWidth = towerW;
      facadeDepth = towerD;
      addBody(bodyKey, 0, placement.height, towerW, towerD, -placement.width * 0.22);
      addBody(bodyKey, 0, placement.height * 0.92, towerW, towerD, placement.width * 0.22);
    } else if (style === 7 && placement.height > 16) {
      const tiers = 3;
      let y = 0;
      for (let tier = 0; tier < tiers; tier++) {
        const tierH = placement.height / tiers;
        const shrink = 1 - tier * 0.12;
        addBody(bodyKey, y, tierH, placement.width * shrink, placement.depth * shrink);
        y += tierH;
      }
      facadeWidth = placement.width * 0.76;
      facadeDepth = placement.depth * 0.76;
    } else {
      addBody(bodyKey, 0, placement.height, placement.width, placement.depth);
    }

    const roofVariant = (style + colorShift) % 4;
    const roofOverhang = roofVariant === 0 ? 1.04 : roofVariant === 1 ? 1.01 : 1.08;
    const roofThickness = roofVariant === 2 ? 0.24 : 0.18;
    this.compose(push, roofKey, base, placement.rotationY, [facadeXOffset, topY + roofThickness * 0.45, facadeZOffset], [
      facadeWidth * roofOverhang,
      roofThickness,
      facadeDepth * roofOverhang,
    ]);

    if (detailLevel === 0) return;

    this.addFacadeDetails(push, bucket, base, placement, {
      width: facadeWidth,
      depth: facadeDepth,
      height: placement.height,
      xOffset: facadeXOffset,
      zOffset: facadeZOffset,
      detailLevel,
      style,
    });
  }

  private static readonly FACADE_BOTTOM_MARGIN = 0.3;
  private static readonly FACADE_TOP_MARGIN = 0.4;

  private addFacadeDetails(
    push: (key: string, matrix: THREE.Matrix4) => void,
    bucket: 'near' | 'mid' | 'far',
    base: { x: number; y: number; z: number },
    placement: UrbanSceneryPlacement,
    detail: {
      width: number;
      depth: number;
      height: number;
      xOffset: number;
      zOffset: number;
      detailLevel: number;
      style: number;
    }
  ): void {
    this.addCurtainFacades(push, bucket, base, placement, detail);

    if (placement.variant % 3 === 0) {
      this.compose(push, `roof-mech:${bucket}`, base, placement.rotationY, [
        detail.xOffset + detail.width * 0.18,
        detail.height + 0.55,
        detail.zOffset - detail.depth * 0.12,
      ], [
        Math.max(1.2, detail.width * 0.22),
        0.9,
        Math.max(1, detail.depth * 0.18),
      ]);
    }

    if (detail.style === 0 || detail.style === 3 || (detail.style === 6 && placement.variant % 2 === 0)) {
      this.compose(push, `antenna:${bucket}`, base, placement.rotationY, [
        detail.xOffset - detail.width * 0.28,
        detail.height + 1.2,
        detail.zOffset + detail.depth * 0.2,
      ], [
        0.12,
        2.4,
        0.12,
      ]);
    }
  }

  private addCurtainFacades(
    push: (key: string, matrix: THREE.Matrix4) => void,
    bucket: 'near' | 'mid' | 'far',
    base: { x: number; y: number; z: number },
    placement: UrbanSceneryPlacement,
    detail: {
      width: number;
      depth: number;
      height: number;
      xOffset: number;
      zOffset: number;
      detailLevel: number;
      style: number;
    }
  ): void {
    for (const config of this.getCurtainFaceConfigs(detail, placement)) {
      this.addCurtainWallWindows(push, bucket, base, placement, detail, config);
    }
  }

  private getCurtainFaceConfigs(
    detail: { width: number; depth: number; detailLevel: number; style: number },
    placement: UrbanSceneryPlacement
  ): Array<{
    face: 'front' | 'back' | 'left' | 'right';
    columnCount: number;
    width: number;
  }> {
    const isIndustrial = detail.style === 4 || detail.style === 5;
    const widthScale = isIndustrial ? 0.76 : detail.style === 1 ? 0.78 : 0.84;

    const configs: Array<{
      face: 'front' | 'back' | 'left' | 'right';
      columnCount: number;
      width: number;
    }> = [
      {
        face: 'front',
        columnCount: detail.style === 2 ? 4 : 3,
        width: detail.width * widthScale,
      },
    ];

    if (detail.detailLevel > 1) {
      configs.push({
        face: 'back',
        columnCount: detail.style === 2 ? 3 : 2,
        width: detail.width * (widthScale - 0.08),
      });

      const sideFace = (placement.variant + detail.style) % 2 === 0 ? 'left' : 'right';
      configs.push({
        face: sideFace,
        columnCount: 2,
        width: detail.depth * (isIndustrial ? 0.58 : 0.64),
      });
    }

    return configs;
  }

  /** Stack horizontal window bands from sill to roof; cap row count and stretch bands on tall towers. */
  private computeFacadeVerticalLayout(
    height: number,
    detailLevel: number
  ): { rowCount: number; rowHeight: number; panelHeight: number } {
    const usableHeight = Math.max(
      2,
      height - SceneryManager.FACADE_BOTTOM_MARGIN - SceneryManager.FACADE_TOP_MARGIN
    );
    const targetRowHeight = detailLevel > 1 ? 3.4 : 4.6;
    const maxRows = detailLevel > 1 ? 14 : 7;
    const rowCount = Math.min(
      maxRows,
      Math.max(2, Math.round(usableHeight / targetRowHeight))
    );
    const rowHeight = usableHeight / rowCount;
    return { rowCount, rowHeight, panelHeight: rowHeight * 0.88 };
  }

  private addCurtainWallWindows(
    push: (key: string, matrix: THREE.Matrix4) => void,
    bucket: 'near' | 'mid' | 'far',
    base: { x: number; y: number; z: number },
    placement: UrbanSceneryPlacement,
    detail: {
      width: number;
      depth: number;
      height: number;
      xOffset: number;
      zOffset: number;
      detailLevel: number;
      style: number;
    },
    options: {
      face: 'front' | 'back' | 'left' | 'right';
      columnCount: number;
      width: number;
    }
  ): void {
    const { rowCount, rowHeight, panelHeight } = this.computeFacadeVerticalLayout(
      detail.height,
      detail.detailLevel
    );
    const panelWidth = Math.max(1.05, options.width / (options.columnCount * 1.42));
    const bottomY = SceneryManager.FACADE_BOTTOM_MARGIN;

    for (let floor = 0; floor < rowCount; floor++) {
      const y = bottomY + rowHeight * (floor + 0.5);

      for (let column = 0; column < options.columnCount; column++) {
        const t = (column + 0.5) / options.columnCount - 0.5;
        const stripKey = `window-strip-${(floor + column + detail.style) % 3}:${bucket}`;
        this.composeFacadeWindow(push, stripKey, base, placement, detail, options.face, {
          y,
          t,
          span: options.width,
          scale:
            options.face === 'left' || options.face === 'right'
              ? [0.055, panelHeight, panelWidth]
              : [panelWidth, panelHeight, 0.055],
        });
      }
    }
  }

  private composeFacadeWindow(
    push: (key: string, matrix: THREE.Matrix4) => void,
    key: string,
    base: { x: number; y: number; z: number },
    placement: UrbanSceneryPlacement,
    detail: { width: number; depth: number; xOffset: number; zOffset: number },
    face: 'front' | 'back' | 'left' | 'right',
    window: { y: number; t: number; span: number; scale: [number, number, number] }
  ): void {
    const offset =
      face === 'front'
        ? [
            detail.xOffset + window.t * window.span,
            window.y,
            detail.zOffset + detail.depth * 0.506,
          ]
        : face === 'back'
          ? [
              detail.xOffset + window.t * window.span,
              window.y,
              detail.zOffset - detail.depth * 0.506,
            ]
          : face === 'right'
            ? [
                detail.xOffset + detail.width * 0.506,
                window.y,
                detail.zOffset + window.t * window.span,
              ]
            : [
                detail.xOffset - detail.width * 0.506,
                window.y,
                detail.zOffset + window.t * window.span,
              ];

    this.compose(push, key, base, placement.rotationY, offset, window.scale);
  }

  private compose(
    push: (key: string, matrix: THREE.Matrix4) => void,
    key: string,
    base: { x: number; y: number; z: number },
    rotationY: number,
    offset: number[],
    scale: number[]
  ): void {
    const cos = Math.cos(rotationY);
    const sin = Math.sin(rotationY);
    const ox = offset[0] * cos - offset[2] * sin;
    const oz = offset[0] * sin + offset[2] * cos;
    this.tempPosition.set(base.x + ox, base.y + offset[1], base.z + oz);
    this.tempQuaternion.setFromEuler(new THREE.Euler(0, rotationY, 0));
    this.tempScale.set(scale[0], scale[1], scale[2]);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    push(key, this.tempMatrix);
  }

  private composeShadow(
    push: (key: string, matrix: THREE.Matrix4) => void,
    key: string,
    base: { x: number; y: number; z: number },
    radius: number
  ): void {
    this.tempPosition.set(base.x, base.y + 0.015, base.z);
    this.tempQuaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    this.tempScale.set(radius, radius, radius);
    this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale);
    push(key, this.tempMatrix);
  }

  private addInstancedMeshes(batches: Map<string, THREE.Matrix4[]>): void {
    const geometries = {
      trunk: new THREE.CylinderGeometry(0.72, 1, 1, 8),
      pine: new THREE.ConeGeometry(1, 1, 10),
      oak: new THREE.IcosahedronGeometry(1, 1),
      shrub: new THREE.IcosahedronGeometry(1, 1),
      shadow: new THREE.CircleGeometry(1, 20),
      street: new THREE.BoxGeometry(1, 1, 1),
      'lane-line': new THREE.BoxGeometry(1, 1, 1),
      'parking-lot': new THREE.BoxGeometry(1, 1, 1),
      park: new THREE.BoxGeometry(1, 1, 1),
      'building-0': new THREE.BoxGeometry(1, 1, 1),
      'building-1': new THREE.BoxGeometry(1, 1, 1),
      'building-2': new THREE.BoxGeometry(1, 1, 1),
      'building-3': new THREE.BoxGeometry(1, 1, 1),
      'building-4': new THREE.BoxGeometry(1, 1, 1),
      'building-5': new THREE.BoxGeometry(1, 1, 1),
      'building-6': new THREE.BoxGeometry(1, 1, 1),
      'building-7': new THREE.BoxGeometry(1, 1, 1),
      roof: new THREE.BoxGeometry(1, 1, 1),
      'window-pane-0': new THREE.BoxGeometry(1, 1, 1),
      'window-pane-1': new THREE.BoxGeometry(1, 1, 1),
      'window-pane-2': new THREE.BoxGeometry(1, 1, 1),
      'window-strip-0': new THREE.BoxGeometry(1, 1, 1),
      'window-strip-1': new THREE.BoxGeometry(1, 1, 1),
      'window-strip-2': new THREE.BoxGeometry(1, 1, 1),
      'roof-mech': new THREE.BoxGeometry(1, 1, 1),
      antenna: new THREE.CylinderGeometry(1, 1, 1, 5),
      'urban-trunk': new THREE.CylinderGeometry(1, 1, 1, 6),
      'urban-tree': new THREE.IcosahedronGeometry(1, 1),
      'light-pole': new THREE.CylinderGeometry(1, 1, 1, 6),
      'light-arm': new THREE.BoxGeometry(1, 1, 1),
      'light-head': new THREE.BoxGeometry(1, 1, 1),
    };

    const materialFor = (part: string, bucket: string): THREE.Material => {
      const opacity = bucket === 'near' ? 1 : bucket === 'mid' ? 0.58 : 0.24;
      if (part === 'shadow') {
        return new THREE.MeshBasicMaterial({
          color: 0x071407,
          transparent: true,
          opacity: 0.16 * opacity,
          depthWrite: false,
        });
      }
      if (part === 'street' || part === 'parking-lot') {
        return new THREE.MeshStandardMaterial({
          color: part === 'street' ? 0x2d3238 : 0x42454a,
          roughness: 0.96,
          transparent: true,
          opacity: opacity * 0.82,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      }
      if (part === 'park') {
        return new THREE.MeshStandardMaterial({
          color: 0x496b45,
          roughness: 0.94,
          transparent: true,
          opacity: opacity * 0.74,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      }
      if (part === 'lane-line') {
        return new THREE.MeshBasicMaterial({
          color: 0xe6dfbd,
          transparent: true,
          opacity: opacity * 0.42,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        });
      }
      if (part === 'urban-trunk' || part === 'urban-tree') {
        return new THREE.MeshStandardMaterial({
          color: part === 'urban-trunk' ? 0x4f3b2a : 0x2f5f3c,
          roughness: 0.9,
          transparent: opacity < 1,
          opacity: opacity * 0.86,
          depthWrite: opacity > 0.72,
        });
      }
      if (part.startsWith('window-pane-')) {
        const paneColors = [0x6f879f, 0x42586f, 0x8aa0b2];
        const index = Number(part.split('-')[2]) || 0;
        return new THREE.MeshStandardMaterial({
          color: paneColors[index % paneColors.length],
          emissive: index === 2 ? 0x111a20 : 0x07101a,
          roughness: 0.26,
          metalness: 0.18,
          transparent: true,
          opacity: opacity * 0.68,
          depthWrite: false,
        });
      }
      if (part.startsWith('window-strip-')) {
        const stripColors = [0x263747, 0x385064, 0x536f86];
        const index = Number(part.split('-')[2]) || 0;
        return new THREE.MeshStandardMaterial({
          color: stripColors[index % stripColors.length],
          emissive: index === 2 ? 0x0d151c : 0x050b10,
          roughness: 0.18,
          metalness: 0.24,
          transparent: true,
          opacity: opacity * 0.76,
          depthWrite: false,
        });
      }
      if (part === 'roof-mech' || part === 'antenna') {
        return new THREE.MeshStandardMaterial({
          color: part === 'antenna' ? 0x333943 : 0x6f747d,
          roughness: 0.78,
          metalness: 0.12,
          transparent: opacity < 1,
          opacity: opacity * 0.82,
          depthWrite: opacity > 0.72,
        });
      }
      if (part === 'roof' || part.startsWith('building-')) {
        const buildingColors = [
          0xa8aab0, 0x969da7, 0x858b94, 0xaaa197, 0x7b8791, 0xb5b0a3, 0x8e959f, 0x9aa3ad,
        ];
        const index = part.startsWith('building-') ? Number(part.split('-')[1]) || 0 : 2;
        return new THREE.MeshStandardMaterial({
          color: part === 'roof' ? 0x5a5f67 : buildingColors[index % buildingColors.length],
          roughness: 0.82,
          metalness: 0.04,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity > 0.72,
        });
      }
      if (part === 'light-pole' || part === 'light-arm' || part === 'light-head') {
        return new THREE.MeshStandardMaterial({
          color: part === 'light-head' ? 0xe7dca5 : 0x39414b,
          emissive: part === 'light-head' ? 0x2a2410 : 0x000000,
          emissiveIntensity: part === 'light-head' ? 0.35 : 0,
          roughness: part === 'light-head' ? 0.55 : 0.72,
          metalness: part === 'light-arm' ? 0.18 : 0.04,
          transparent: opacity < 1,
          opacity: opacity * (part === 'light-head' ? 0.88 : 0.75),
          depthWrite: opacity > 0.72,
        });
      }
      const color =
        part === 'trunk'
          ? 0x503624
          : part === 'pine'
            ? 0x22583a
            : part === 'oak'
              ? 0x376c31
              : 0x3f7331;
      return new THREE.MeshStandardMaterial({
        color,
        roughness: 0.88,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity > 0.72,
      });
    };

    for (const [key, matrices] of batches) {
      const [part, bucket] = key.split(':') as [keyof typeof geometries, string];
      const mesh = new THREE.InstancedMesh(
        geometries[part].clone(),
        materialFor(part, bucket),
        matrices.length
      );
      matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = part !== 'shadow';
      mesh.receiveShadow = part !== 'shadow';
      mesh.frustumCulled = false;
      mesh.renderOrder =
        part === 'shadow' ||
        part === 'street' ||
        part === 'lane-line' ||
        part === 'parking-lot' ||
        part === 'park'
          ? -80
          : 0;
      mesh.userData.isViewerScenery = true;
      mesh.userData.selectable = false;
      this.root?.add(mesh);
    }

    Object.values(geometries).forEach((geometry) => geometry.dispose());
  }

  hide(): void {
    this.clear();
  }

  private clear(): void {
    if (this.water) {
      this.water.dispose();
      this.water = null;
    }
    this.elapsedSeconds = 0;

    if (!this.root) {
      this.active = false;
      return;
    }

    this.scene.remove(this.root);
    this.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        const mat = child.material;
        if (Array.isArray(mat)) {
          mat.forEach((m) => m.dispose());
        } else {
          mat?.dispose();
        }
      }
    });
    this.root = null;
    this.active = false;
  }

  dispose(): void {
    this.clear();
  }
}
