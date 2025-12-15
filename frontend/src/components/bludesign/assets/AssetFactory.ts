/**
 * Asset Factory
 * 
 * Creates 3D meshes for assets. This is the GEOMETRY layer of the asset system:
 * 
 * ARCHITECTURE:
 * 1. AssetRegistry (AssetRegistry.ts) - Defines asset METADATA (dimensions, category, properties)
 * 2. AssetFactory (this file) - Creates 3D GEOMETRY with default materials (fallback primitives)
 * 3. SkinManager (SkinManager.ts) - Manages MATERIAL OVERRIDES (user customizable colors/materials)
 * 4. AssetService (AssetService.ts) - Loads custom assets from BACKEND (future: GLTF models, etc.)
 * 
 * MATERIAL FLOW:
 * - AssetFactory creates meshes with default/hardcoded materials
 * - SkinManager.applyActiveSkin() can override materials after creation
 * - Each mesh part has userData.partName (e.g., 'body', 'door', 'frame') for skinning
 * 
 * WHY HARDCODED MATERIALS?
 * - These are FALLBACK primitives when no custom model exists
 * - They provide reasonable defaults that can be overridden via skins
 * - Backend can define custom models that replace these entirely
 * 
 * TO CUSTOMIZE AN ASSET'S APPEARANCE:
 * 1. Use SkinManager to create a skin with custom partMaterials
 * 2. Or define a custom model in the backend with AssetService
 */

import * as THREE from 'three';
import {
  AssetMetadata,
  AssetCategory,
  DeviceState,
} from '../core/types';

// Material presets
const MATERIALS = {
  storageUnit: {
    locked: new THREE.MeshStandardMaterial({ 
      color: 0xf7f7f7, 
      metalness: 0.3, 
      roughness: 0.7 
    }),
    unlocked: new THREE.MeshStandardMaterial({ 
      color: 0xa77777,
      metalness: 0.2, 
      roughness: 0.8 
    }),
    error: new THREE.MeshStandardMaterial({ 
      color: 0xFA7777, 
      metalness: 0.3, 
      roughness: 0.7 
    }),
    maintenance: new THREE.MeshStandardMaterial({ 
      color: 0xed8936, 
      metalness: 0.3, 
      roughness: 0.7 
    }),
    offline: new THREE.MeshStandardMaterial({ 
      color: 0x718096, 
      metalness: 0.3, 
      roughness: 0.7 
    }),
    door: new THREE.MeshStandardMaterial({ 
      color: 0x7777FA, 
      metalness: 0.4, 
      roughness: 0.6 
    }),
  },
  gate: {
    frame: new THREE.MeshStandardMaterial({ 
      color: 0x1a202c, 
      metalness: 0.6, 
      roughness: 0.3 
    }),
    bars: new THREE.MeshStandardMaterial({ 
      color: 0x2d3748, 
      metalness: 0.7, 
      roughness: 0.3 
    }),
  },
  structural: {
    wall: new THREE.MeshStandardMaterial({ 
      color: 0xf5f5f0, // Off-white
      metalness: 0.1, 
      roughness: 0.9 
    }),
    floor: new THREE.MeshStandardMaterial({ 
      color: 0xa0aec0, 
      metalness: 0.1, 
      roughness: 0.8 
    }),
    ceiling: new THREE.MeshStandardMaterial({ 
      color: 0xedf2f7, 
      metalness: 0.1, 
      roughness: 0.9 
    }),
  },
  outdoor: {
    pavement: new THREE.MeshStandardMaterial({ 
      color: 0x505860, // Dark asphalt gray with subtle blue undertone
      metalness: 0.02, 
      roughness: 0.85 
    }),
    grass: new THREE.MeshStandardMaterial({ 
      color: 0x3d7a3d, // Natural grass green (not neon!)
      metalness: 0.0, 
      roughness: 0.95 
    }),
    gravel: new THREE.MeshStandardMaterial({ 
      color: 0xa8957a, // Warm sandy brown gravel
      metalness: 0.05, 
      roughness: 0.95 
    }),
    fence: new THREE.MeshStandardMaterial({ 
      color: 0x4a5568, // Medium gray steel
      metalness: 0.65, 
      roughness: 0.35 
    }),
  },
};

export class AssetFactory {
  /**
   * Create a 3D mesh for an asset
   */
  static createAssetMesh(
    asset: AssetMetadata,
    state?: DeviceState
  ): THREE.Object3D {
    switch (asset.category) {
      case AssetCategory.STORAGE_UNIT:
        return this.createStorageUnit(asset, state ?? DeviceState.LOCKED);
      case AssetCategory.GATE:
        return this.createGate(asset, state ?? DeviceState.LOCKED);
      case AssetCategory.ELEVATOR:
        return this.createElevator(asset, state ?? DeviceState.UNKNOWN);
      case AssetCategory.ACCESS_CONTROL:
        return this.createAccessControl(asset, state ?? DeviceState.UNKNOWN);
      case AssetCategory.WALL:
        return this.createWall(asset);
      case AssetCategory.FLOOR:
        return this.createFloor(asset);
      case AssetCategory.CEILING:
        return this.createCeiling(asset);
      case AssetCategory.STAIRWELL:
        return this.createStairwell(asset);
      case AssetCategory.DOOR:
        return this.createDoor(asset);
      case AssetCategory.WINDOW:
        return this.createWindow(asset);
      case AssetCategory.BUILDING:
        return this.createBuildingPreview(asset);
      case AssetCategory.INTERIOR_WALL:
        return this.createInteriorWall(asset);
      case AssetCategory.PAVEMENT:
        return this.createPavement(asset);
      case AssetCategory.GRASS:
        return this.createGrass(asset);
      case AssetCategory.GRAVEL:
        return this.createGravel(asset);
      case AssetCategory.FENCE:
        return this.createFence(asset);
      case AssetCategory.DECORATION:
        return this.createDecoration(asset);
      case AssetCategory.MARKER:
        return this.createMarker(asset);
      case AssetCategory.LABEL:
        return this.createLabel(asset);
      default:
        return this.createGenericBox(asset);
    }
  }

  /**
   * Create a storage unit mesh (simple fallback primitive)
   */
  private static createStorageUnit(
    asset: AssetMetadata,
    state: DeviceState
  ): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Main body - simple box
    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const bodyMaterial = this.getMaterialForState(state);
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = height / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.stateDependent = true;
    body.userData.partName = 'body';  // Track part name for skinning
    group.add(body);
    
    // Small skinny rectangular door on front face
    const doorWidth = width * 0.6;
    const doorHeight = height * 0.7;
    const doorThickness = 0.05;
    const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, doorThickness);
    const door = new THREE.Mesh(doorGeometry, MATERIALS.storageUnit.door.clone());
    door.position.set(0, height * 0.35, depth / 2 + doorThickness / 2);
    door.castShadow = true;
    door.userData.partName = 'door';  // Track part name for skinning
    group.add(door);
    
    // Track all part names on the group
    group.userData.partNames = ['body', 'door'];
    
    return group;
  }

  /**
   * Create a gate mesh (simple fallback primitive)
   */
  private static createGate(
    asset: AssetMetadata,
    _state: DeviceState
  ): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height } = asset.dimensions;
    const depth = 0.15; // Gates are thin
    
    // Frame material - dark steel
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a3444,
      metalness: 0.4,
      roughness: 0.4,
    });
    
    // Main posts - tall, sturdy
    const postWidth = 0.2;
    const postGeometry = new THREE.BoxGeometry(postWidth, height, depth);
    postGeometry.translate(0, height / 2, 0);
    
    const leftPost = new THREE.Mesh(postGeometry, frameMaterial);
    leftPost.position.set(-width / 2 + postWidth / 2, 0, 0);
    leftPost.castShadow = true;
    leftPost.userData.partName = 'frame';
    group.add(leftPost);
    
    const rightPost = new THREE.Mesh(postGeometry, frameMaterial);
    rightPost.position.set(width / 2 - postWidth / 2, 0, 0);
    rightPost.castShadow = true;
    rightPost.userData.partName = 'frame';
    group.add(rightPost);
    
    // Top beam / header
    const beamGeometry = new THREE.BoxGeometry(width + 0.1, 0.15, depth + 0.1);
    const topBeam = new THREE.Mesh(beamGeometry, frameMaterial);
    topBeam.position.set(0, height + 0.075, 0);
    topBeam.castShadow = true;
    group.add(topBeam);
    
    // Gate door panel - sliding design
    const gateWidth = width - postWidth * 2 - 0.05;
    const gateHeight = height * 0.85;
    
    // Gate frame
    const gateFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x445566,
      metalness: 0.5,
      roughness: 0.5,
    });
    
    // Gate outer frame
    const frameThickness = 0.06;
    const gateFrameTopGeo = new THREE.BoxGeometry(gateWidth, frameThickness, 0.08);
    const gateFrameTop = new THREE.Mesh(gateFrameTopGeo, gateFrameMaterial);
    gateFrameTop.position.set(0, gateHeight, 0);
    group.add(gateFrameTop);
    
    const gateFrameBottomGeo = new THREE.BoxGeometry(gateWidth, frameThickness, 0.08);
    const gateFrameBottom = new THREE.Mesh(gateFrameBottomGeo, gateFrameMaterial);
    gateFrameBottom.position.set(0, frameThickness / 2, 0);
    group.add(gateFrameBottom);
    
    // Gate bars (vertical)
    const barMaterial = new THREE.MeshStandardMaterial({
      color: 0x556677,
      metalness: 0.4,
      roughness: 0.4,
    });
    
    const barCount = Math.max(4, Math.floor(gateWidth / 0.25));
    const barSpacing = gateWidth / (barCount + 1);
    const barGeometry = new THREE.BoxGeometry(0.04, gateHeight - frameThickness * 2, 0.04);
    
    for (let i = 1; i <= barCount; i++) {
      const bar = new THREE.Mesh(barGeometry, barMaterial);
      bar.position.set(-gateWidth / 2 + barSpacing * i, gateHeight / 2, 0);
      bar.castShadow = true;
      bar.userData.partName = 'bars';
      group.add(bar);
    }
    
    // Horizontal bars for structure
    const horizBarGeo = new THREE.BoxGeometry(gateWidth, 0.04, 0.04);
    const horizBar1 = new THREE.Mesh(horizBarGeo, barMaterial);
    horizBar1.position.set(0, gateHeight * 0.33, 0);
    horizBar1.userData.partName = 'bars';
    group.add(horizBar1);
    
    const horizBar2 = new THREE.Mesh(horizBarGeo, barMaterial);
    horizBar2.position.set(0, gateHeight * 0.66, 0);
    horizBar2.userData.partName = 'bars';
    group.add(horizBar2);
    
    // Indicator light on top
    const lightGeometry = new THREE.BoxGeometry(0.15, 0.08, 0.15);
    const lightMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6633,
      emissive: 0xff6633,
      emissiveIntensity: 0.6,
    });
    const light = new THREE.Mesh(lightGeometry, lightMaterial);
    light.position.set(0, height + 0.2, 0);
    light.userData.partName = 'indicator';
    group.add(light);
    
    // Track all part names
    group.userData.partNames = ['frame', 'bars', 'indicator'];
    
    return group;
  }

  /**
   * Create an elevator mesh (simple fallback primitive)
   */
  private static createElevator(
    asset: AssetMetadata,
    _state: DeviceState
  ): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Elevator frame - bright brushed steel look
    const frameMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xc0c8d0, // Bright silver steel
      metalness: 0.4, 
      roughness: 0.25 
    });
    
    // Main shaft body (hollow appearance - just walls)
    const wallThickness = 0.08;
    
    // Back wall
    const backWallGeometry = new THREE.BoxGeometry(width, height, wallThickness);
    backWallGeometry.translate(0, height / 2, 0);
    const backWall = new THREE.Mesh(backWallGeometry, frameMaterial);
    backWall.position.z = -depth / 2 + wallThickness / 2;
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    backWall.userData.partName = 'frame';
    group.add(backWall);
    
    // Side walls
    const sideWallGeometry = new THREE.BoxGeometry(wallThickness, height, depth);
    sideWallGeometry.translate(0, height / 2, 0);
    
    const leftWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    leftWall.position.x = -width / 2 + wallThickness / 2;
    leftWall.castShadow = true;
    leftWall.userData.partName = 'frame';
    group.add(leftWall);
    
    const rightWall = new THREE.Mesh(sideWallGeometry, frameMaterial);
    rightWall.position.x = width / 2 - wallThickness / 2;
    rightWall.castShadow = true;
    rightWall.userData.partName = 'frame';
    group.add(rightWall);
    
    // Top
    const topGeometry = new THREE.BoxGeometry(width, wallThickness, depth);
    const top = new THREE.Mesh(topGeometry, frameMaterial);
    top.position.y = height;
    top.userData.partName = 'frame';
    group.add(top);
    
    // Door frame - chrome trim
    const doorFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x667788,
      metalness: 0.4,
      roughness: 0.25,
    });
    
    const doorWidth = width * 0.8;
    const doorHeight = height * 0.8;
    const frameThickness = 0.06;
    
    // Door frame top
    const doorFrameTopGeo = new THREE.BoxGeometry(doorWidth + frameThickness * 2, frameThickness, 0.08);
    const doorFrameTop = new THREE.Mesh(doorFrameTopGeo, doorFrameMaterial);
    doorFrameTop.position.set(0, doorHeight + frameThickness / 2, depth / 2);
    group.add(doorFrameTop);
    
    // Door frame sides
    const doorFrameSideGeo = new THREE.BoxGeometry(frameThickness, doorHeight, 0.08);
    const doorFrameLeft = new THREE.Mesh(doorFrameSideGeo, doorFrameMaterial);
    doorFrameLeft.position.set(-doorWidth / 2 - frameThickness / 2, doorHeight / 2, depth / 2);
    group.add(doorFrameLeft);
    
    const doorFrameRight = new THREE.Mesh(doorFrameSideGeo, doorFrameMaterial);
    doorFrameRight.position.set(doorWidth / 2 + frameThickness / 2, doorHeight / 2, depth / 2);
    group.add(doorFrameRight);
    
    // Split doors - bright polished stainless steel
    const doorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xd0d8e0, 
      metalness: 0.5, 
      roughness: 0.1 
    });
    
    const doorPanelWidth = doorWidth / 2 - 0.02; // Small gap between doors
    const doorGeometry = new THREE.BoxGeometry(doorPanelWidth, doorHeight - 0.1, 0.03);
    
    // Left door
    const leftDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    leftDoor.position.set(-doorPanelWidth / 2 - 0.01, doorHeight / 2, depth / 2 + 0.02);
    leftDoor.castShadow = true;
    leftDoor.userData.partName = 'doors';
    group.add(leftDoor);
    
    // Right door
    const rightDoor = new THREE.Mesh(doorGeometry, doorMaterial);
    rightDoor.position.set(doorPanelWidth / 2 + 0.01, doorHeight / 2, depth / 2 + 0.02);
    rightDoor.castShadow = true;
    rightDoor.userData.partName = 'doors';
    group.add(rightDoor);
    
    // Door seam line (vertical divider between doors)
    const seamGeometry = new THREE.BoxGeometry(0.01, doorHeight - 0.15, 0.035);
    const seamMaterial = new THREE.MeshStandardMaterial({ color: 0x556677, metalness: 0.8, roughness: 0.2 });
    const seam = new THREE.Mesh(seamGeometry, seamMaterial);
    seam.position.set(0, doorHeight / 2, depth / 2 + 0.025);
    seam.userData.partName = 'doors';
    group.add(seam);
    
    // Floor indicator light (small box above door) - bright cyan LED
    const indicatorGeometry = new THREE.BoxGeometry(0.3, 0.1, 0.02);
    const indicatorMaterial = new THREE.MeshStandardMaterial({
      color: 0x40e0d0, // Turquoise
      emissive: 0x40e0d0,
      emissiveIntensity: 0.7,
    });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.set(0, doorHeight + frameThickness + 0.1, depth / 2 + 0.01);
    indicator.userData.partName = 'indicator';
    group.add(indicator);
    
    // Track all part names
    group.userData.partNames = ['frame', 'doors', 'indicator'];
    
    return group;
  }

  /**
   * Create a wall mesh (off-white, can coexist with other assets)
   */
  private static createWall(asset: AssetMetadata): THREE.Object3D {
    const { width, height, depth } = asset.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, MATERIALS.structural.wall.clone());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Mark as non-blocking so other assets can be placed on same tile
    mesh.userData.isWall = true;
    mesh.userData.allowOverlap = true;
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create a floor mesh (concrete)
   */
  private static createFloor(asset: AssetMetadata): THREE.Object3D {
    const { width, height, depth } = asset.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    
    // Beautiful polished concrete material
    const concreteMaterial = new THREE.MeshStandardMaterial({
      color: 0xb8b8b0, // Light warm gray
      metalness: 0.05,
      roughness: 0.7,
    });
    
    const mesh = new THREE.Mesh(geometry, concreteMaterial);
    mesh.receiveShadow = true;
    mesh.userData.allowOverlap = true;
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create a door mesh
   * Doors are designed to sit flush with building walls (0.2 thickness)
   */
  private static createDoor(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Match building wall thickness for flush appearance
    const wallThickness = 0.2;
    const effectiveDepth = depth || wallThickness;
    
    // Frame - elegant dark bronze finish
    const frameThickness = 0.1;
    const frameMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x5d4e37, // Warm bronze brown
      metalness: 0.6, 
      roughness: 0.35 
    });
    
    // Top frame
    const topGeometry = new THREE.BoxGeometry(width, frameThickness, effectiveDepth);
    const topFrame = new THREE.Mesh(topGeometry, frameMaterial);
    topFrame.position.y = height;
    topFrame.userData.partName = 'frame';
    topFrame.castShadow = true;
    group.add(topFrame);
    
    // Side frames
    const sideGeometry = new THREE.BoxGeometry(frameThickness, height, effectiveDepth);
    const leftFrame = new THREE.Mesh(sideGeometry, frameMaterial);
    leftFrame.position.set(-width / 2 + frameThickness / 2, height / 2, 0);
    leftFrame.userData.partName = 'frame';
    leftFrame.castShadow = true;
    group.add(leftFrame);
    
    const rightFrame = new THREE.Mesh(sideGeometry, frameMaterial);
    rightFrame.position.set(width / 2 - frameThickness / 2, height / 2, 0);
    rightFrame.userData.partName = 'frame';
    rightFrame.castShadow = true;
    group.add(rightFrame);
    
    // Door panel - rich warm wood-like finish, fills full depth for flush appearance
    const doorGeometry = new THREE.BoxGeometry(
      width - frameThickness * 2,
      height - frameThickness,
      effectiveDepth
    );
    const doorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8b7355, // Warm oak color
      metalness: 0.1, 
      roughness: 0.6 
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.y = (height - frameThickness) / 2;
    door.castShadow = true;
    door.userData.partName = 'panel';
    group.add(door);
    
    // Door handle - positioned to protrude from door face
    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Brushed gold
      metalness: 0.5,
      roughness: 0.2,
    });
    const handleGeometry = new THREE.BoxGeometry(0.15, 0.04, 0.08);
    const handle = new THREE.Mesh(handleGeometry, handleMaterial);
    handle.position.set(width * 0.3, height * 0.45, effectiveDepth / 2 + 0.02);
    handle.userData.partName = 'handle';
    group.add(handle);
    
    // Track part names
    group.userData.partNames = ['frame', 'panel', 'handle'];
    
    return group;
  }

  /**
   * Create a window mesh with proper transparency for seeing into buildings
   * Windows snap to walls and are designed to replace wall sections
   */
  private static createWindow(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    const isFloorToCeiling = asset.id.includes('floor-to-ceiling');
    
    // Frame material - elegant brushed aluminum
    const frameMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8090a0, // Darker aluminum for better contrast
      metalness: 0.6, 
      roughness: 0.25,
    });
    
    // Glass material - true transparent glass
    // Using MeshPhysicalMaterial for better glass rendering
    const glassBaseOpacity = 0.3; // Fallback opacity for non-transmission rendering
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, // White base for clear glass
      metalness: 0.0,
      roughness: 0.05,  // Very smooth
      transmission: 0.9, // High transmission for transparency
      thickness: 0.02,   // Thin glass
      transparent: true,
      opacity: glassBaseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false, // Important for proper transparency
      envMapIntensity: 1.0,
    });
    // Store base opacity for ghosting calculations (effective opacity = baseOpacity * ghostOpacity)
    glassMaterial.userData.baseOpacity = glassBaseOpacity;
    glassMaterial.userData.isNaturallyTransparent = true;
    
    // Match building wall thickness - make window slightly thicker to ensure wall coverage
    const wallThickness = 0.2;
    const frameThickness = (depth || wallThickness) + 0.02; // Slightly thicker than wall
    const frameWidth = 0.08; // Slim frame
    
    if (isFloorToCeiling) {
      // Floor-to-ceiling window - full glass with minimal frame
      
      // Bottom frame rail
      const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(width, frameWidth, frameThickness + 0.01),
        frameMaterial
      );
      bottomFrame.position.y = frameWidth / 2;
      bottomFrame.position.z = 0.005; // Slightly in front of backing
      bottomFrame.userData.partName = 'frame';
      bottomFrame.castShadow = true;
      group.add(bottomFrame);
      
      // Top frame rail  
      const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(width, frameWidth, frameThickness),
        frameMaterial
      );
      topFrame.position.y = height - frameWidth / 2;
      topFrame.userData.partName = 'frame';
      topFrame.castShadow = true;
      group.add(topFrame);
      
      // Left frame
      const leftFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth, height - frameWidth * 2, frameThickness),
        frameMaterial
      );
      leftFrame.position.set(-width / 2 + frameWidth / 2, height / 2, 0);
      leftFrame.userData.partName = 'frame';
      leftFrame.castShadow = true;
      group.add(leftFrame);
      
      // Right frame
      const rightFrame = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth, height - frameWidth * 2, frameThickness),
        frameMaterial
      );
      rightFrame.position.set(width / 2 - frameWidth / 2, height / 2, 0);
      rightFrame.userData.partName = 'frame';
      rightFrame.castShadow = true;
      group.add(rightFrame);
      
      // Center vertical divider
      const divider = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth, height - frameWidth * 2, frameThickness * 0.8),
        frameMaterial
      );
      divider.position.y = height / 2;
      divider.userData.partName = 'frame';
      group.add(divider);
      
      // Glass panes (two panes separated by divider)
      const paneWidth = (width - frameWidth * 3) / 2;
      const paneHeight = height - frameWidth * 2;
      
      // Use PlaneGeometry for truly flat glass - better transparency
      const glassGeometry = new THREE.PlaneGeometry(paneWidth, paneHeight);
      
      const leftGlass = new THREE.Mesh(glassGeometry, glassMaterial);
      leftGlass.position.set(-paneWidth / 2 - frameWidth / 2, height / 2, 0);
      leftGlass.userData.partName = 'glass';
      leftGlass.renderOrder = 1; // Render after opaque objects
      group.add(leftGlass);
      
      const rightGlass = new THREE.Mesh(glassGeometry, glassMaterial);
      rightGlass.position.set(paneWidth / 2 + frameWidth / 2, height / 2, 0);
      rightGlass.userData.partName = 'glass';
      rightGlass.renderOrder = 1;
      group.add(rightGlass);
      
    } else {
      // Standard centered window with sill
      const windowHeight = height * 0.55;
      const sillHeight = height * 0.3;
      const headerHeight = height - windowHeight - sillHeight;
      const windowY = sillHeight + windowHeight / 2;
      
      // Window sill (solid section below)
      const sillMaterial = new THREE.MeshStandardMaterial({
        color: 0xd0d0d0,
        metalness: 0.1,
        roughness: 0.7,
      });
      const sill = new THREE.Mesh(
        new THREE.BoxGeometry(width, sillHeight, frameThickness),
        sillMaterial
      );
      sill.position.y = sillHeight / 2;
      sill.userData.partName = 'sill';
      sill.castShadow = true;
      sill.receiveShadow = true;
      group.add(sill);
      
      // Header (solid section above)
      const header = new THREE.Mesh(
        new THREE.BoxGeometry(width, headerHeight, frameThickness),
        sillMaterial
      );
      header.position.y = height - headerHeight / 2;
      header.userData.partName = 'sill';
      header.castShadow = true;
      group.add(header);
      
      // Window frame
      const frameGeometry = new THREE.BoxGeometry(frameWidth, windowHeight, frameThickness);
      
      const leftFrame = new THREE.Mesh(frameGeometry.clone(), frameMaterial);
      leftFrame.position.set(-width / 2 + frameWidth / 2, windowY, 0);
      leftFrame.userData.partName = 'frame';
      group.add(leftFrame);
      
      const rightFrame = new THREE.Mesh(frameGeometry.clone(), frameMaterial);
      rightFrame.position.set(width / 2 - frameWidth / 2, windowY, 0);
      rightFrame.userData.partName = 'frame';
      group.add(rightFrame);
      
      // Top and bottom frame
      const hFrameGeometry = new THREE.BoxGeometry(width - frameWidth * 2, frameWidth, frameThickness);
      
      const topFrame = new THREE.Mesh(hFrameGeometry.clone(), frameMaterial);
      topFrame.position.set(0, windowY + windowHeight / 2 - frameWidth / 2, 0);
      topFrame.userData.partName = 'frame';
      group.add(topFrame);
      
      const bottomFrame = new THREE.Mesh(hFrameGeometry.clone(), frameMaterial);
      bottomFrame.position.set(0, windowY - windowHeight / 2 + frameWidth / 2, 0);
      bottomFrame.userData.partName = 'frame';
      group.add(bottomFrame);
      
      // Center dividers (cross pattern)
      const vDivider = new THREE.Mesh(
        new THREE.BoxGeometry(frameWidth * 0.6, windowHeight - frameWidth * 2, frameThickness * 0.8),
        frameMaterial
      );
      vDivider.position.y = windowY;
      vDivider.userData.partName = 'frame';
      group.add(vDivider);
      
      const hDivider = new THREE.Mesh(
        new THREE.BoxGeometry(width - frameWidth * 2, frameWidth * 0.6, frameThickness * 0.8),
        frameMaterial
      );
      hDivider.position.y = windowY;
      hDivider.userData.partName = 'frame';
      group.add(hDivider);
      
      // Glass panes (4 panes in cross pattern)
      const paneWidth = (width - frameWidth * 2 - frameWidth * 0.6) / 2;
      const paneHeight = (windowHeight - frameWidth * 2 - frameWidth * 0.6) / 2;
      const glassGeometry = new THREE.PlaneGeometry(paneWidth, paneHeight);
      
      const offsets = [
        { x: -paneWidth / 2 - frameWidth * 0.3, y: paneHeight / 2 + frameWidth * 0.3 },
        { x: paneWidth / 2 + frameWidth * 0.3, y: paneHeight / 2 + frameWidth * 0.3 },
        { x: -paneWidth / 2 - frameWidth * 0.3, y: -paneHeight / 2 - frameWidth * 0.3 },
        { x: paneWidth / 2 + frameWidth * 0.3, y: -paneHeight / 2 - frameWidth * 0.3 },
      ];
      
      offsets.forEach((offset) => {
        const glass = new THREE.Mesh(glassGeometry, glassMaterial);
        glass.position.set(offset.x, windowY + offset.y, 0);
        glass.userData.partName = 'glass';
        glass.renderOrder = 1;
        group.add(glass);
      });
    }
    
    // Mark as wall-mountable and track parts
    group.userData.isWindow = true;
    group.userData.wallMountable = true;
    group.userData.snapsToWalls = true;
    group.userData.replacesWallSection = true;
    group.userData.partNames = ['frame', 'glass', 'sill'];
    
    return group;
  }

  /**
   * Create a decoration mesh (trees, shrubs, planters, etc.)
   */
  private static createDecoration(asset: AssetMetadata): THREE.Object3D {
    const decorationType = (asset.metadata as { decorationType?: string })?.decorationType;
    
    switch (decorationType) {
      case 'tree_oak':
        return this.createOakTree(asset);
      case 'tree_pine':
        return this.createPineTree(asset);
      case 'tree_palm':
        return this.createPalmTree(asset);
      case 'shrub':
        return this.createShrub(asset);
      case 'planter':
        return this.createPlanter(asset);
      default:
        return this.createOakTree(asset); // Default to oak tree
    }
  }

  /**
   * Create an oak tree with natural foliage
   */
  private static createOakTree(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { height } = asset.dimensions;
    const scale = height / 4; // Base scale on 4-unit height
    
    // Trunk material - realistic bark
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4033, // Warm brown bark
      roughness: 0.9,
      metalness: 0.0,
    });
    
    // Foliage material - lush green
    const foliageMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d5a27, // Deep forest green
      roughness: 0.8,
      metalness: 0.0,
    });
    
    // Trunk - tapered cylinder
    const trunkGeometry = new THREE.CylinderGeometry(
      0.15 * scale, // Top radius
      0.25 * scale, // Bottom radius
      height * 0.4, // Height (40% of total)
      8
    );
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = height * 0.2;
    trunk.userData.partName = 'trunk';
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);
    
    // Foliage - multiple overlapping spheres for natural look
    const foliagePositions = [
      { x: 0, y: height * 0.65, z: 0, r: 0.8 * scale },
      { x: 0.3 * scale, y: height * 0.55, z: 0.2 * scale, r: 0.5 * scale },
      { x: -0.35 * scale, y: height * 0.6, z: -0.15 * scale, r: 0.55 * scale },
      { x: 0.1 * scale, y: height * 0.75, z: -0.25 * scale, r: 0.45 * scale },
      { x: -0.2 * scale, y: height * 0.7, z: 0.3 * scale, r: 0.5 * scale },
    ];
    
    foliagePositions.forEach((pos) => {
      const foliageGeometry = new THREE.IcosahedronGeometry(pos.r, 1);
      // Slightly deform for natural look
      const positions = foliageGeometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const x = positions.getX(j);
        const y = positions.getY(j);
        const z = positions.getZ(j);
        const noise = 0.85 + Math.random() * 0.3;
        positions.setXYZ(j, x * noise, y * noise, z * noise);
      }
      foliageGeometry.computeVertexNormals();
      
      const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
      foliage.position.set(pos.x, pos.y, pos.z);
      foliage.userData.partName = 'foliage';
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      group.add(foliage);
    });
    
    group.userData.isDecoration = true;
    group.userData.decorationType = 'tree_oak';
    group.userData.partNames = ['trunk', 'foliage'];
    
    return group;
  }

  /**
   * Create a pine/conifer tree
   */
  private static createPineTree(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { height } = asset.dimensions;
    const scale = height / 5;
    
    // Trunk material
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3728, // Dark brown
      roughness: 0.95,
      metalness: 0.0,
    });
    
    // Pine needle material
    const pineMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a4d2e, // Dark pine green
      roughness: 0.7,
      metalness: 0.0,
    });
    
    // Trunk
    const trunkGeometry = new THREE.CylinderGeometry(
      0.1 * scale,
      0.2 * scale,
      height * 0.3,
      6
    );
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.position.y = height * 0.15;
    trunk.userData.partName = 'trunk';
    trunk.castShadow = true;
    group.add(trunk);
    
    // Conical foliage layers
    const layers = [
      { y: height * 0.35, r: 0.8 * scale, h: height * 0.25 },
      { y: height * 0.55, r: 0.6 * scale, h: height * 0.22 },
      { y: height * 0.72, r: 0.4 * scale, h: height * 0.2 },
      { y: height * 0.88, r: 0.2 * scale, h: height * 0.15 },
    ];
    
    layers.forEach((layer) => {
      const coneGeometry = new THREE.ConeGeometry(layer.r, layer.h, 8);
      const cone = new THREE.Mesh(coneGeometry, pineMaterial);
      cone.position.y = layer.y;
      cone.userData.partName = 'foliage';
      cone.castShadow = true;
      group.add(cone);
    });
    
    group.userData.isDecoration = true;
    group.userData.decorationType = 'tree_pine';
    group.userData.partNames = ['trunk', 'foliage'];
    
    return group;
  }

  /**
   * Create a palm tree
   */
  private static createPalmTree(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { height } = asset.dimensions;
    const scale = height / 6;
    
    // Trunk material - palm bark texture
    const trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355, // Light tan bark
      roughness: 0.8,
      metalness: 0.0,
    });
    
    // Frond material
    const frondMaterial = new THREE.MeshStandardMaterial({
      color: 0x228b22, // Bright palm green
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    
    // Curved trunk using a path
    const trunkCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.1 * scale, height * 0.3, 0.05 * scale),
      new THREE.Vector3(0.05 * scale, height * 0.6, -0.05 * scale),
      new THREE.Vector3(0, height * 0.85, 0),
    ]);
    
    const trunkGeometry = new THREE.TubeGeometry(trunkCurve, 12, 0.15 * scale, 8, false);
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    trunk.userData.partName = 'trunk';
    trunk.castShadow = true;
    group.add(trunk);
    
    // Palm fronds - simplified as elongated shapes
    const frondCount = 7;
    const frondLength = 1.5 * scale;
    
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const tilt = Math.PI / 4 + Math.random() * 0.2;
      
      // Simple frond shape
      const frondShape = new THREE.Shape();
      frondShape.moveTo(0, 0);
      frondShape.quadraticCurveTo(frondLength * 0.3, 0.15 * scale, frondLength, 0);
      frondShape.quadraticCurveTo(frondLength * 0.3, -0.15 * scale, 0, 0);
      
      const frondGeometry = new THREE.ShapeGeometry(frondShape);
      const frond = new THREE.Mesh(frondGeometry, frondMaterial);
      
      frond.position.set(0, height * 0.85, 0);
      frond.rotation.y = angle;
      frond.rotation.z = -tilt;
      frond.userData.partName = 'frond';
      frond.castShadow = true;
      group.add(frond);
    }
    
    group.userData.isDecoration = true;
    group.userData.decorationType = 'tree_palm';
    group.userData.partNames = ['trunk', 'frond'];
    
    return group;
  }

  /**
   * Create a decorative shrub/bush
   */
  private static createShrub(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Shrub material
    const shrubMaterial = new THREE.MeshStandardMaterial({
      color: 0x355e3b, // Hunter green
      roughness: 0.85,
      metalness: 0.0,
    });
    
    // Multiple overlapping spheres for bush shape
    const sphereCount = 5 + Math.floor(Math.random() * 3);
    
    for (let i = 0; i < sphereCount; i++) {
      const radius = (0.3 + Math.random() * 0.2) * Math.min(width, depth) / 2;
      const x = (Math.random() - 0.5) * width * 0.5;
      const y = radius + Math.random() * (height - radius * 2) * 0.5;
      const z = (Math.random() - 0.5) * depth * 0.5;
      
      const sphereGeometry = new THREE.IcosahedronGeometry(radius, 1);
      // Add randomness
      const positions = sphereGeometry.attributes.position;
      for (let j = 0; j < positions.count; j++) {
        const px = positions.getX(j);
        const py = positions.getY(j);
        const pz = positions.getZ(j);
        const noise = 0.8 + Math.random() * 0.4;
        positions.setXYZ(j, px * noise, py * noise, pz * noise);
      }
      sphereGeometry.computeVertexNormals();
      
      const sphere = new THREE.Mesh(sphereGeometry, shrubMaterial);
      sphere.position.set(x, y, z);
      sphere.userData.partName = 'foliage';
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      group.add(sphere);
    }
    
    group.userData.isDecoration = true;
    group.userData.decorationType = 'shrub';
    group.userData.partNames = ['foliage'];
    
    return group;
  }

  /**
   * Create a decorative planter with plant
   */
  private static createPlanter(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height } = asset.dimensions;
    
    // Planter material - terracotta
    const planterMaterial = new THREE.MeshStandardMaterial({
      color: 0xc67b4e, // Terracotta
      roughness: 0.8,
      metalness: 0.1,
    });
    
    // Soil material
    const soilMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2817, // Dark soil
      roughness: 0.95,
      metalness: 0.0,
    });
    
    // Plant material
    const plantMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a7c4e, // Plant green
      roughness: 0.7,
      metalness: 0.0,
    });
    
    const potHeight = height * 0.4;
    
    // Planter pot (tapered box)
    const potGeometry = new THREE.CylinderGeometry(
      width / 2 * 0.9,
      width / 2 * 0.7,
      potHeight,
      8
    );
    const pot = new THREE.Mesh(potGeometry, planterMaterial);
    pot.position.y = potHeight / 2;
    pot.userData.partName = 'pot';
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);
    
    // Soil top
    const soilGeometry = new THREE.CylinderGeometry(
      width / 2 * 0.85,
      width / 2 * 0.85,
      0.1,
      8
    );
    const soil = new THREE.Mesh(soilGeometry, soilMaterial);
    soil.position.y = potHeight - 0.05;
    soil.userData.partName = 'soil';
    group.add(soil);
    
    // Simple plant foliage
    const foliageGeometry = new THREE.IcosahedronGeometry(width / 2 * 0.7, 1);
    const foliage = new THREE.Mesh(foliageGeometry, plantMaterial);
    foliage.position.y = potHeight + width / 2 * 0.5;
    foliage.userData.partName = 'foliage';
    foliage.castShadow = true;
    group.add(foliage);
    
    group.userData.isDecoration = true;
    group.userData.decorationType = 'planter';
    group.userData.partNames = ['pot', 'soil', 'foliage'];
    
    return group;
  }

  /**
   * Create a building preview mesh (rectangle outline for placement)
   */
  private static createBuildingPreview(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, depth } = asset.dimensions;
    const height = 0.1; // Just a thin indicator
    
    // Create a thin floor outline
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const material = new THREE.MeshStandardMaterial({
      color: 0x4466ff,
      transparent: true,
      opacity: 0.5,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = height / 2;
    group.add(mesh);
    
    // Add edge outline
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4466ff });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.y = height / 2;
    group.add(wireframe);
    
    return group;
  }

  /**
   * Create an interior wall mesh
   */
  private static createInteriorWall(asset: AssetMetadata): THREE.Object3D {
    const { width, height, depth } = asset.dimensions;
    
    // Interior walls are thinner than exterior
    const wallThickness = depth || 0.15;
    
    const geometry = new THREE.BoxGeometry(width, height, wallThickness);
    geometry.translate(0, height / 2, 0);
    
    // Warm off-white interior wall paint
    const material = new THREE.MeshStandardMaterial({
      color: 0xf5f0e8, // Warm cream white
      roughness: 0.85,
      metalness: 0.0,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isInteriorWall = true;
    mesh.userData.allowOverlap = true;
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    
    return mesh;
  }

  /**
   * Create a smart door with access control indicator
   */
  static createSmartDoor(asset: AssetMetadata, state: DeviceState): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Frame
    const frameThickness = 0.12;
    const frameMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d3748, 
      metalness: 0.5, 
      roughness: 0.4 
    });
    
    // Top frame
    const topGeometry = new THREE.BoxGeometry(width, frameThickness, depth);
    const topFrame = new THREE.Mesh(topGeometry, frameMaterial);
    topFrame.position.y = height;
    group.add(topFrame);
    
    // Side frames
    const sideGeometry = new THREE.BoxGeometry(frameThickness, height, depth);
    const leftFrame = new THREE.Mesh(sideGeometry, frameMaterial);
    leftFrame.position.set(-width / 2 + frameThickness / 2, height / 2, 0);
    group.add(leftFrame);
    
    const rightFrame = new THREE.Mesh(sideGeometry, frameMaterial);
    rightFrame.position.set(width / 2 - frameThickness / 2, height / 2, 0);
    group.add(rightFrame);
    
    // Door panel - color based on state
    let doorColor = 0x4a5568; // Default gray
    if (state === DeviceState.LOCKED) doorColor = 0x6b7280;
    if (state === DeviceState.UNLOCKED) doorColor = 0x10b981;
    if (state === DeviceState.ERROR) doorColor = 0xef4444;
    
    const doorGeometry = new THREE.BoxGeometry(
      width - frameThickness * 2,
      height - frameThickness,
      depth * 0.8
    );
    const doorMaterial = new THREE.MeshStandardMaterial({ 
      color: doorColor, 
      metalness: 0.3, 
      roughness: 0.7 
    });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.y = (height - frameThickness) / 2;
    door.castShadow = true;
    group.add(door);
    
    // Access control indicator light
    const indicatorGeometry = new THREE.BoxGeometry(0.1, 0.1, depth + 0.05);
    let indicatorColor = 0x777777;
    if (state === DeviceState.LOCKED) indicatorColor = 0xff0000;
    if (state === DeviceState.UNLOCKED) indicatorColor = 0x00ff00;
    
    const indicatorMaterial = new THREE.MeshStandardMaterial({
      color: indicatorColor,
      emissive: indicatorColor,
      emissiveIntensity: 0.5,
    });
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.set(width / 2 - frameThickness - 0.15, height * 0.7, 0);
    group.add(indicator);
    
    // Mark as smart
    group.userData.isSmart = true;
    group.userData.wallMountable = true;
    
    return group;
  }

  /**
   * Create a fence mesh (simple fallback primitive)
   */
  private static createFence(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height } = asset.dimensions;
    
    // Check if this is a chainlink fence
    const isChainlink = asset.id.includes('chainlink');
    
    // Posts - bright silver galvanized steel
    const postCount = Math.max(2, Math.ceil(width / 2) + 1);
    const postSpacing = width / (postCount - 1);
    const postGeometry = new THREE.BoxGeometry(0.08, height, 0.08);
    
    const postMaterial = isChainlink 
      ? new THREE.MeshStandardMaterial({ color: 0x8090a0, metalness: 0.4, roughness: 0.35 })
      : new THREE.MeshStandardMaterial({ color: 0x6b7280, metalness: 0.4, roughness: 0.4 });
    
    for (let i = 0; i < postCount; i++) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(-width / 2 + postSpacing * i, height / 2, 0);
      post.castShadow = true;
      post.userData.partName = 'posts';
      group.add(post);
    }
    
    // Two horizontal rails (top and middle)
    const railGeometry = new THREE.BoxGeometry(width, 0.04, 0.04);
    const railMaterial = isChainlink
      ? new THREE.MeshStandardMaterial({ color: 0x8a9aaa, metalness: 0.4, roughness: 0.4 })
      : new THREE.MeshStandardMaterial({ color: 0x737b85, metalness: 0.4, roughness: 0.45 });
    
    const topRail = new THREE.Mesh(railGeometry, railMaterial);
    topRail.position.y = height * 0.9;
    topRail.userData.partName = 'rails';
    group.add(topRail);
    
    const midRail = new THREE.Mesh(railGeometry, railMaterial);
    midRail.position.y = height * 0.45;
    midRail.userData.partName = 'rails';
    group.add(midRail);
    
    // For chainlink - add a mesh panel
    if (isChainlink) {
      const meshGeometry = new THREE.PlaneGeometry(width - 0.1, height * 0.85);
      const meshMaterial = new THREE.MeshStandardMaterial({
        color: 0xa0a8b0,
        metalness: 0.5,
        roughness: 0.5,
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        wireframe: true,
      });
      const meshPanel = new THREE.Mesh(meshGeometry, meshMaterial);
      meshPanel.position.y = height * 0.475;
      meshPanel.userData.partName = 'mesh';
      group.add(meshPanel);
      
      group.userData.partNames = ['posts', 'rails', 'mesh'];
    } else {
      group.userData.partNames = ['posts', 'rails'];
    }
    
    // Mark as wall type for stacking
    group.userData.isWall = true;
    group.userData.allowOverlap = true;
    
    return group;
  }

  /**
   * Create pavement/road (very short rectangle at ground level)
   */
  private static createPavement(asset: AssetMetadata): THREE.Object3D {
    const { width, depth } = asset.dimensions;
    const height = 0.05; // Very short - ground level
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, MATERIALS.outdoor.pavement.clone());
    mesh.receiveShadow = true;
    mesh.userData.allowOverlap = true; // Can place other assets on top
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create grass (very short rectangle at ground level, green)
   */
  private static createGrass(asset: AssetMetadata): THREE.Object3D {
    const { width, depth } = asset.dimensions;
    const height = 0.05; // Very short - ground level
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, MATERIALS.outdoor.grass.clone());
    mesh.receiveShadow = true;
    mesh.userData.allowOverlap = true; // Can place other assets on top
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create gravel (very short rectangle at ground level)
   */
  private static createGravel(asset: AssetMetadata): THREE.Object3D {
    const { width, depth } = asset.dimensions;
    const height = 0.05; // Very short - ground level
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geometry, MATERIALS.outdoor.gravel.clone());
    mesh.receiveShadow = true;
    mesh.userData.allowOverlap = true; // Can place other assets on top
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create ceiling (simple flat plane)
   */
  private static createCeiling(asset: AssetMetadata): THREE.Object3D {
    const { width, depth } = asset.dimensions;
    const height = 0.1;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const mesh = new THREE.Mesh(geometry, MATERIALS.structural.ceiling.clone());
    mesh.position.y = asset.dimensions.height || 3; // Position at top
    mesh.receiveShadow = true;
    mesh.userData.allowOverlap = true;
    mesh.userData.partName = 'surface';
    mesh.userData.partNames = ['surface'];
    return mesh;
  }

  /**
   * Create stairwell - fire-escape style enclosed stairwell with door
   */
  private static createStairwell(asset: AssetMetadata): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Materials
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xe5e5e0, // Off-white concrete/drywall
      metalness: 0.05, 
      roughness: 0.85 
    });
    
    const stepMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x9ca3af, // Warm gray concrete
      metalness: 0.1, 
      roughness: 0.75 
    });
    
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0xc0c8d0, // Brushed stainless steel
      metalness: 0.4,
      roughness: 0.25,
    });
    
    const doorMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a5568, // Dark gray fire door
      metalness: 0.3,
      roughness: 0.6,
    });
    
    const doorFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x374151, // Darker frame
      metalness: 0.4,
      roughness: 0.5,
    });
    
    const wallThickness = 0.12;
    const doorWidth = 0.9;
    const doorHeight = 2.2;
    
    // === ENCLOSURE WALLS ===
    
    // Back wall (full)
    const backWallGeometry = new THREE.BoxGeometry(width, height, wallThickness);
    const backWall = new THREE.Mesh(backWallGeometry, wallMaterial.clone());
    backWall.position.set(0, height / 2, -depth / 2 + wallThickness / 2);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    backWall.userData.partName = 'walls';
    group.add(backWall);
    
    // Left wall (full)
    const leftWallGeometry = new THREE.BoxGeometry(wallThickness, height, depth);
    const leftWall = new THREE.Mesh(leftWallGeometry, wallMaterial.clone());
    leftWall.position.set(-width / 2 + wallThickness / 2, height / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    leftWall.userData.partName = 'walls';
    group.add(leftWall);
    
    // Right wall (full)
    const rightWall = new THREE.Mesh(leftWallGeometry, wallMaterial.clone());
    rightWall.position.set(width / 2 - wallThickness / 2, height / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    rightWall.userData.partName = 'walls';
    group.add(rightWall);
    
    // Front wall with door opening (three parts: left, right, top)
    const frontDoorX = 0; // Door centered
    const sideWidth = (width - doorWidth) / 2 - wallThickness;
    
    // Front wall - left of door
    if (sideWidth > 0) {
      const frontLeftGeometry = new THREE.BoxGeometry(sideWidth, height, wallThickness);
      const frontLeft = new THREE.Mesh(frontLeftGeometry, wallMaterial.clone());
      frontLeft.position.set(-width / 2 + wallThickness + sideWidth / 2, height / 2, depth / 2 - wallThickness / 2);
      frontLeft.castShadow = true;
      frontLeft.userData.partName = 'walls';
      group.add(frontLeft);
    }
    
    // Front wall - right of door
    if (sideWidth > 0) {
      const frontRightGeometry = new THREE.BoxGeometry(sideWidth, height, wallThickness);
      const frontRight = new THREE.Mesh(frontRightGeometry, wallMaterial.clone());
      frontRight.position.set(width / 2 - wallThickness - sideWidth / 2, height / 2, depth / 2 - wallThickness / 2);
      frontRight.castShadow = true;
      frontRight.userData.partName = 'walls';
      group.add(frontRight);
    }
    
    // Front wall - above door
    const aboveDoorHeight = height - doorHeight;
    if (aboveDoorHeight > 0) {
      const aboveDoorGeometry = new THREE.BoxGeometry(doorWidth + 0.1, aboveDoorHeight, wallThickness);
      const aboveDoor = new THREE.Mesh(aboveDoorGeometry, wallMaterial.clone());
      aboveDoor.position.set(frontDoorX, doorHeight + aboveDoorHeight / 2, depth / 2 - wallThickness / 2);
      aboveDoor.castShadow = true;
      aboveDoor.userData.partName = 'walls';
      group.add(aboveDoor);
    }
    
    // === FIRE DOOR ===
    
    // Door frame
    const frameThickness = 0.06;
    
    // Frame top
    const frameTopGeometry = new THREE.BoxGeometry(doorWidth + frameThickness * 2, frameThickness, wallThickness + 0.02);
    const frameTop = new THREE.Mesh(frameTopGeometry, doorFrameMaterial.clone());
    frameTop.position.set(frontDoorX, doorHeight + frameThickness / 2, depth / 2 - wallThickness / 2);
    frameTop.userData.partName = 'door';
    group.add(frameTop);
    
    // Frame sides
    const frameSideGeometry = new THREE.BoxGeometry(frameThickness, doorHeight, wallThickness + 0.02);
    const frameLeft = new THREE.Mesh(frameSideGeometry, doorFrameMaterial.clone());
    frameLeft.position.set(frontDoorX - doorWidth / 2 - frameThickness / 2, doorHeight / 2, depth / 2 - wallThickness / 2);
    frameLeft.userData.partName = 'door';
    group.add(frameLeft);
    
    const frameRight = new THREE.Mesh(frameSideGeometry, doorFrameMaterial.clone());
    frameRight.position.set(frontDoorX + doorWidth / 2 + frameThickness / 2, doorHeight / 2, depth / 2 - wallThickness / 2);
    frameRight.userData.partName = 'door';
    group.add(frameRight);
    
    // Door panel
    const doorGeometry = new THREE.BoxGeometry(doorWidth - 0.04, doorHeight - 0.04, 0.05);
    const door = new THREE.Mesh(doorGeometry, doorMaterial.clone());
    door.position.set(frontDoorX, doorHeight / 2, depth / 2 - wallThickness / 2 + 0.02);
    door.castShadow = true;
    door.userData.partName = 'door';
    group.add(door);
    
    // Door handle (panic bar)
    const handleGeometry = new THREE.BoxGeometry(doorWidth * 0.6, 0.08, 0.06);
    const handle = new THREE.Mesh(handleGeometry, railMaterial.clone());
    handle.position.set(frontDoorX, doorHeight * 0.45, depth / 2 - wallThickness / 2 + 0.06);
    handle.userData.partName = 'door';
    group.add(handle);
    
    // "EXIT" sign above door
    const signGeometry = new THREE.BoxGeometry(0.4, 0.15, 0.05);
    const signMaterial = new THREE.MeshStandardMaterial({
      color: 0x22c55e, // Green
      emissive: 0x22c55e,
      emissiveIntensity: 0.5,
      metalness: 0.1,
      roughness: 0.8,
    });
    const exitSign = new THREE.Mesh(signGeometry, signMaterial);
    exitSign.position.set(frontDoorX, doorHeight + 0.3, depth / 2 - wallThickness / 2 + 0.06);
    exitSign.userData.partName = 'sign';
    group.add(exitSign);
    
    // === STAIRS ===
    const stairWidth = width - wallThickness * 2 - 0.3; // Leave gap from walls
    const stairDepth = depth - wallThickness * 2;
    const stepCount = Math.max(8, Math.floor(height / 0.18)); // ~18cm per step (code compliant)
    const stepHeight = height / stepCount;
    const stepDepthEach = stairDepth / stepCount;
    
    // Create steps going back (away from door)
    for (let i = 0; i < stepCount; i++) {
      const treadGeometry = new THREE.BoxGeometry(stairWidth, 0.05, stepDepthEach * 0.9);
      const tread = new THREE.Mesh(treadGeometry, stepMaterial.clone());
      const y = stepHeight * (i + 0.5);
      const z = depth / 2 - wallThickness - 0.8 - stepDepthEach * i;
      tread.position.set(0, y, z);
      tread.castShadow = true;
      tread.receiveShadow = true;
      tread.userData.partName = 'steps';
      group.add(tread);
    }
    
    // Landing at top (bottom floor) - entry area
    const landingDepth = 0.8;
    const landingGeometry = new THREE.BoxGeometry(stairWidth, 0.1, landingDepth);
    const landing = new THREE.Mesh(landingGeometry, stepMaterial.clone());
    landing.position.set(0, 0.05, depth / 2 - wallThickness - landingDepth / 2);
    landing.receiveShadow = true;
    landing.userData.partName = 'steps';
    group.add(landing);
    
    // === RAILINGS ===
    const railHeight = 0.95;
    const railRadius = 0.025;
    
    // Create handrails along stairs
    const stringerAngle = Math.atan2(height, stairDepth);
    const stringerLength = Math.sqrt(height * height + stairDepth * stairDepth);
    
    // Left handrail
    const leftRailGeometry = new THREE.CylinderGeometry(railRadius, railRadius, stringerLength, 8);
    leftRailGeometry.rotateZ(Math.PI / 2);
    leftRailGeometry.rotateY(Math.PI / 2);
    const leftRail = new THREE.Mesh(leftRailGeometry, railMaterial.clone());
    leftRail.position.set(-stairWidth / 2 + 0.1, height / 2 + railHeight * 0.5, -stairDepth / 4);
    leftRail.rotation.x = stringerAngle;
    leftRail.userData.partName = 'railings';
    group.add(leftRail);
    
    // Right handrail
    const rightRail = new THREE.Mesh(leftRailGeometry.clone(), railMaterial.clone());
    rightRail.position.set(stairWidth / 2 - 0.1, height / 2 + railHeight * 0.5, -stairDepth / 4);
    rightRail.rotation.x = stringerAngle;
    rightRail.userData.partName = 'railings';
    group.add(rightRail);
    
    // Railing posts (vertical supports)
    const postGeometry = new THREE.CylinderGeometry(railRadius * 0.8, railRadius * 0.8, railHeight, 6);
    const postCount = 5;
    for (let i = 0; i < postCount; i++) {
      const t = i / (postCount - 1);
      const postY = t * height + railHeight / 2;
      const postZ = depth / 2 - wallThickness - landingDepth - t * stairDepth;
      
      // Left posts
      const leftPost = new THREE.Mesh(postGeometry.clone(), railMaterial.clone());
      leftPost.position.set(-stairWidth / 2 + 0.1, postY, postZ);
      leftPost.userData.partName = 'railings';
      group.add(leftPost);
      
      // Right posts
      const rightPost = new THREE.Mesh(postGeometry.clone(), railMaterial.clone());
      rightPost.position.set(stairWidth / 2 - 0.1, postY, postZ);
      rightPost.userData.partName = 'railings';
      group.add(rightPost);
    }
    
    // Track part names
    group.userData.partNames = ['walls', 'steps', 'railings', 'door', 'sign'];
    group.userData.isStairwell = true;
    
    return group;
  }

  /**
   * Create access control (simple box with indicator)
   */
  private static createAccessControl(
    asset: AssetMetadata,
    state: DeviceState
  ): THREE.Object3D {
    const group = new THREE.Group();
    const { width, height, depth } = asset.dimensions;
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d3748, 
      metalness: 0.5, 
      roughness: 0.4 
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = height / 2;
    body.castShadow = true;
    group.add(body);
    
    // Status indicator
    const indicatorGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const indicatorMaterial = this.getIndicatorMaterial(state);
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.set(0, height * 0.7, depth / 2 + 0.05);
    group.add(indicator);
    
    return group;
  }

  /**
   * Create marker (small simple box)
   */
  private static createMarker(asset: AssetMetadata): THREE.Object3D {
    const { width, height, depth } = asset.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xffd700, // Gold/yellow for visibility
      metalness: 0.3, 
      roughness: 0.7,
      emissive: 0xffd700,
      emissiveIntensity: 0.3
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.allowOverlap = true;
    return mesh;
  }

  /**
   * Create label (invisible placeholder, will be rendered as HTML overlay)
   */
  private static createLabel(_asset: AssetMetadata): THREE.Object3D {
    // Labels are rendered as HTML overlays, so create an invisible marker
    const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const material = new THREE.MeshBasicMaterial({ 
      visible: false,
      transparent: true,
      opacity: 0
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.isLabel = true;
    mesh.userData.allowOverlap = true;
    return mesh;
  }

  /**
   * Create a generic box for unknown asset types
   */
  private static createGenericBox(asset: AssetMetadata): THREE.Object3D {
    const { width, height, depth } = asset.dimensions;
    const geometry = new THREE.BoxGeometry(width, height, depth);
    // Translate geometry so origin is at bottom-center
    geometry.translate(0, height / 2, 0);
    const material = new THREE.MeshStandardMaterial({ 
      color: 0x718096, 
      metalness: 0.2, 
      roughness: 0.8 
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Get material based on device state
   * IMPORTANT: Always returns a CLONE to prevent material sharing between assets
   */
  private static getMaterialForState(state: DeviceState): THREE.MeshStandardMaterial {
    switch (state) {
      case DeviceState.LOCKED:
        return MATERIALS.storageUnit.locked.clone();
      case DeviceState.UNLOCKED:
        return MATERIALS.storageUnit.unlocked.clone();
      case DeviceState.ERROR:
        return MATERIALS.storageUnit.error.clone();
      case DeviceState.MAINTENANCE:
        return MATERIALS.storageUnit.maintenance.clone();
      case DeviceState.OFFLINE:
        return MATERIALS.storageUnit.offline.clone();
      default:
        return MATERIALS.storageUnit.locked.clone();
    }
  }

  /**
   * Get indicator light material based on state
   */
  private static getIndicatorMaterial(state: DeviceState): THREE.MeshStandardMaterial {
    const colors: Record<DeviceState, number> = {
      [DeviceState.UNKNOWN]: 0x718096,
      [DeviceState.LOCKED]: 0x48bb78,
      [DeviceState.UNLOCKED]: 0xecc94b,
      [DeviceState.ERROR]: 0xf56565,
      [DeviceState.MAINTENANCE]: 0xed8936,
      [DeviceState.OFFLINE]: 0x4a5568,
    };
    
    return new THREE.MeshStandardMaterial({
      color: colors[state],
      emissive: colors[state],
      emissiveIntensity: 0.5,
    });
  }

  /**
   * Apply material overrides to an asset mesh based on part names
   */
  static applyMaterials(
    object: THREE.Object3D,
    partMaterials: Record<string, { color: string; metalness: number; roughness: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number }>
  ): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.userData.partName) {
        const partName = child.userData.partName as string;
        const materialConfig = partMaterials[partName];
        
        if (materialConfig) {
          // Clone the material to avoid affecting other instances
          const newMaterial = (child.material as THREE.MeshStandardMaterial).clone();
          newMaterial.color.set(materialConfig.color);
          newMaterial.metalness = materialConfig.metalness;
          newMaterial.roughness = materialConfig.roughness;
          
          if (materialConfig.emissive) {
            newMaterial.emissive.set(materialConfig.emissive);
            newMaterial.emissiveIntensity = materialConfig.emissiveIntensity ?? 0;
          }
          
          if (materialConfig.transparent !== undefined) {
            newMaterial.transparent = materialConfig.transparent;
            newMaterial.opacity = materialConfig.opacity ?? 1.0;
          }
          
          child.material = newMaterial;
        }
      }
    });
  }

  /**
   * Update asset state (for smart assets)
   */
  static updateAssetState(
    object: THREE.Object3D,
    state: DeviceState
  ): void {
    // Update materials based on new state
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Check if this is a state-dependent material
        if (child.userData.stateDependent) {
          // Dispose old material and set new one (getMaterialForState returns a clone)
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
          child.material = this.getMaterialForState(state);
        }
        // Check if this is an indicator light
        if (child.userData.isIndicator) {
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
          child.material = this.getIndicatorMaterial(state);
        }
      }
    });
  }

  /**
   * Create a ghost mesh for placement preview
   * Semi-transparent version of the asset
   */
  static createGhostMesh(asset: AssetMetadata): THREE.Object3D {
    // Create the base mesh
    const baseMesh = AssetFactory.createAssetMesh(asset);
    
    // Make all materials semi-transparent
    baseMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Clone the material to avoid affecting the original
        if (Array.isArray(child.material)) {
          child.material = child.material.map((mat) => {
            const ghostMat = mat.clone();
            ghostMat.transparent = true;
            ghostMat.opacity = 0.5;
            ghostMat.depthWrite = false;
            return ghostMat;
          });
        } else {
          const ghostMat = child.material.clone();
          ghostMat.transparent = true;
          ghostMat.opacity = 0.5;
          ghostMat.depthWrite = false;
          child.material = ghostMat;
        }
      }
    });
    
    return baseMesh;
  }

  /**
   * Dispose of asset materials and geometries
   */
  static disposeAsset(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => mat.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
  }
}

