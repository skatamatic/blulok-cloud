/**
 * Scene Manager
 * 
 * Manages scene setup, lighting, environment, and scene-level operations.
 */

import * as THREE from 'three';
import {
  LightingConfig,
  DEFAULT_LIGHTING_CONFIG,
  PlacedObject,
} from './types';

export class SceneManager {
  private scene: THREE.Scene;
  private lights: {
    ambient: THREE.AmbientLight | null;
    directional: THREE.DirectionalLight | null;
    hemisphere: THREE.HemisphereLight | null;
  } = {
    ambient: null,
    directional: null,
    hemisphere: null,
  };
  
  // Object management
  private objects: Map<string, THREE.Object3D> = new Map();
  private objectData: Map<string, PlacedObject> = new Map();
  
  // Environment map for metallic reflections
  private envMap: THREE.CubeTexture | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Create a procedural environment map for metallic materials.
   * This gives metallic surfaces something to reflect without needing an HDR image.
   */
  setupEnvironmentMap(renderer: THREE.WebGLRenderer): void {
    // Create a simple procedural environment using a cube camera
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    
    // Create a simple gradient environment scene
    const envScene = new THREE.Scene();
    
    // Sky gradient - top is light blue, horizon is white-ish, bottom is darker
    const skyGeo = new THREE.SphereGeometry(500, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x87ceeb) },    // Light sky blue
        horizonColor: { value: new THREE.Color(0xe8eef5) }, // Soft white-blue
        bottomColor: { value: new THREE.Color(0x707080) },  // Neutral gray
        offset: { value: 0 },
        exponent: { value: 0.6 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          vec3 color;
          if (h > 0.0) {
            color = mix(horizonColor, topColor, pow(h, exponent));
          } else {
            color = mix(horizonColor, bottomColor, pow(-h, exponent * 0.5));
          }
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      side: THREE.BackSide,
    });
    
    const sky = new THREE.Mesh(skyGeo, skyMat);
    envScene.add(sky);
    
    // Add some bright spots to simulate studio lighting for better metallic reflections
    const spotGeo = new THREE.SphereGeometry(20, 8, 8);
    const spotMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    // Key light spot (front-right-top)
    const spot1 = new THREE.Mesh(spotGeo, spotMat);
    spot1.position.set(200, 150, 200);
    envScene.add(spot1);
    
    // Fill light spot (left)
    const spot2 = new THREE.Mesh(spotGeo, spotMat.clone());
    (spot2.material as THREE.MeshBasicMaterial).color.setHex(0xccccff);
    spot2.position.set(-200, 100, 0);
    envScene.add(spot2);
    
    // Rim light spot (back)
    const spot3 = new THREE.Mesh(spotGeo, spotMat.clone());
    (spot3.material as THREE.MeshBasicMaterial).color.setHex(0xffffcc);
    spot3.position.set(0, 120, -200);
    envScene.add(spot3);
    
    // Create cube camera and render environment
    const cubeCamera = new THREE.CubeCamera(1, 1000, cubeRenderTarget);
    cubeCamera.position.set(0, 0, 0);
    cubeCamera.update(renderer, envScene);
    
    // Set as scene environment for PBR materials
    this.scene.environment = cubeRenderTarget.texture;
    this.envMap = cubeRenderTarget.texture;
    
    // Cleanup env scene
    skyGeo.dispose();
    skyMat.dispose();
    spotGeo.dispose();
    spotMat.dispose();
    
    console.log('[SceneManager] Procedural environment map created for metallic reflections');
  }

  /**
   * Get the environment map
   */
  getEnvironmentMap(): THREE.CubeTexture | null {
    return this.envMap;
  }

  /**
   * Setup scene lighting
   */
  setupLighting(config: LightingConfig = DEFAULT_LIGHTING_CONFIG): void {
    // Remove existing lights
    if (this.lights.ambient) {
      this.scene.remove(this.lights.ambient);
      this.lights.ambient.dispose();
    }
    if (this.lights.directional) {
      this.scene.remove(this.lights.directional);
      this.lights.directional.dispose();
    }
    
    // Ambient light
    this.lights.ambient = new THREE.AmbientLight(
      config.ambient.color,
      config.ambient.intensity
    );
    this.scene.add(this.lights.ambient);
    
    // Directional light (sun)
    this.lights.directional = new THREE.DirectionalLight(
      config.directional.color,
      config.directional.intensity
    );
    this.lights.directional.position.set(...config.directional.position);
    this.lights.directional.castShadow = config.directional.castShadow;
    
    if (config.directional.castShadow) {
      const shadowSize = 100;
      this.lights.directional.shadow.mapSize.width = config.directional.shadowMapSize;
      this.lights.directional.shadow.mapSize.height = config.directional.shadowMapSize;
      this.lights.directional.shadow.camera.near = 0.5;
      this.lights.directional.shadow.camera.far = 500;
      this.lights.directional.shadow.camera.left = -shadowSize;
      this.lights.directional.shadow.camera.right = shadowSize;
      this.lights.directional.shadow.camera.top = shadowSize;
      this.lights.directional.shadow.camera.bottom = -shadowSize;
      this.lights.directional.shadow.bias = -0.0001;
    }
    
    this.scene.add(this.lights.directional);
    
    // Add hemisphere light for more natural outdoor lighting
    if (this.lights.hemisphere) {
      this.scene.remove(this.lights.hemisphere);
      this.lights.hemisphere.dispose();
    }
    this.lights.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x333333, 0.4);
    this.scene.add(this.lights.hemisphere);
  }

  /**
   * Set ambient light intensity
   */
  setAmbientIntensity(intensity: number): void {
    if (this.lights.ambient) {
      this.lights.ambient.intensity = intensity;
    }
  }

  /**
   * Set directional light intensity
   */
  setDirectionalIntensity(intensity: number): void {
    if (this.lights.directional) {
      this.lights.directional.intensity = intensity;
    }
  }
  
  /**
   * Get directional light (for shadow settings)
   */
  getDirectionalLight(): THREE.DirectionalLight | null {
    return this.lights.directional;
  }
  
  /**
   * Set scene background color
   */
  setBackgroundColor(color: string): void {
    this.scene.background = new THREE.Color(color);
  }

  /**
   * Add an object to the scene
   */
  addObject(id: string, object: THREE.Object3D, data?: PlacedObject): void {
    object.userData.id = id;
    object.userData.selectable = true;
    
    this.objects.set(id, object);
    if (data) {
      this.objectData.set(id, data);
    }
    
    this.scene.add(object);
  }

  /**
   * Remove an object from the scene
   */
  removeObject(id: string): void {
    const object = this.objects.get(id);
    if (object) {
      this.scene.remove(object);
      this.disposeObject(object);
      this.objects.delete(id);
      this.objectData.delete(id);
    }
  }

  /**
   * Get an object by ID
   */
  getObject(id: string): THREE.Object3D | undefined {
    return this.objects.get(id);
  }

  /**
   * Get object data by ID
   */
  getObjectData(id: string): PlacedObject | undefined {
    return this.objectData.get(id);
  }

  /**
   * Get all placed objects
   */
  getAllPlacedObjects(): PlacedObject[] {
    return Array.from(this.objectData.values());
  }

  /**
   * Get all selectable objects
   */
  getSelectableObjects(): THREE.Object3D[] {
    const selectables: THREE.Object3D[] = [];
    this.scene.traverse((object) => {
      if (object.userData.selectable) {
        selectables.push(object);
      }
    });
    return selectables;
  }

  /**
   * Get all objects map (id -> mesh)
   * Includes placed objects tracked by SceneManager
   */
  getAllObjects(): Map<string, THREE.Object3D> {
    return new Map(this.objects);
  }

  /**
   * Get all selectable objects in the scene (including building elements)
   * This traverses the entire scene to find all selectable objects
   */
  getAllSelectableObjectsMap(): Map<string, THREE.Object3D> {
    const result = new Map<string, THREE.Object3D>();
    
    this.scene.traverse((object) => {
      if (object.userData.selectable === true && object.userData.id) {
        result.set(object.userData.id, object);
      }
    });
    
    return result;
  }

  /**
   * Check if an object exists
   */
  hasObject(id: string): boolean {
    return this.objects.has(id);
  }

  /**
   * Get count of placed objects
   */
  getObjectCount(): number {
    return this.objects.size;
  }

  /**
   * Update object position
   */
  updateObjectPosition(id: string, x: number, y: number, z: number): void {
    const object = this.objects.get(id);
    if (object) {
      object.position.set(x, y, z);
    }
  }

  /**
   * Update object rotation (Y-axis only for our grid system)
   */
  updateObjectRotation(id: string, rotationY: number): void {
    const object = this.objects.get(id);
    if (object) {
      object.rotation.y = THREE.MathUtils.degToRad(rotationY);
    }
  }

  /**
   * Highlight an object (for hover/selection)
   */
  highlightObject(id: string, highlight: boolean, color: number = 0x147FD4): void {
    const object = this.objects.get(id);
    if (!object) return;
    
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial) {
            if (highlight) {
              mat.emissive.setHex(color);
              mat.emissiveIntensity = 0.3;
            } else {
              mat.emissive.setHex(0x000000);
              mat.emissiveIntensity = 0;
            }
          }
        });
      }
    });
  }

  /**
   * Dispose of an object and its resources
   */
  private disposeObject(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => mat.dispose());
      }
    });
  }

  /**
   * Clear all objects from the scene
   */
  clearObjects(): void {
    this.objects.forEach((_, id) => {
      this.removeObject(id);
    });
  }

  /**
   * Apply floor-based ghosting to all objects
   * DEPRECATED: Use FloorManager.applyGhosting() instead
   * This method is kept for backwards compatibility but does nothing
   */
  applyFloorGhosting(_currentFloor: number, _isFullBuildingView: boolean = false): void {
    // No-op: FloorManager handles all ghosting now
  }

  /**
   * Clear all ghosting (set all objects to full opacity)
   * DEPRECATED: Use FloorManager.clearGhosting() instead
   */
  clearGhosting(): void {
    // No-op: FloorManager handles all ghosting now
  }

  /**
   * Get all objects on a specific floor
   */
  getObjectsOnFloor(floor: number): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    this.objects.forEach((object) => {
      if (object.userData.floor === floor) {
        result.push(object);
      }
    });
    return result;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearObjects();
    
    if (this.lights.ambient) {
      this.scene.remove(this.lights.ambient);
      this.lights.ambient.dispose();
    }
    if (this.lights.directional) {
      this.scene.remove(this.lights.directional);
      this.lights.directional.dispose();
    }
  }
}

