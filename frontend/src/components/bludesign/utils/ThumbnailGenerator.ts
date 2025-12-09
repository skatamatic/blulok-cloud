/**
 * Thumbnail Generator
 * 
 * Generates 3D asset thumbnails using offscreen rendering.
 * Caches results in localStorage for performance.
 * Uses bounding box calculation for optimal camera placement.
 */

import * as THREE from 'three';
import { AssetMetadata } from '../core/types';
import { AssetFactory } from '../assets/AssetFactory';

const DEFAULT_THUMBNAIL_SIZE = 128;
const CACHE_PREFIX = 'bludesign_thumbnail_';

export interface ThumbnailOptions {
  size?: number;
  padding?: number;  // Extra padding around object (0.1 = 10%)
  angle?: 'isometric' | 'front' | 'top';
  backgroundColor?: string;
}

export class ThumbnailGenerator {
  private static instance: ThumbnailGenerator | null = null;
  
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private light: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;

  constructor() {
    // Create offscreen renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(DEFAULT_THUMBNAIL_SIZE, DEFAULT_THUMBNAIL_SIZE);
    this.renderer.setClearColor(0x000000, 0); // Transparent background

    // Create scene
    this.scene = new THREE.Scene();

    // Setup lighting - 3-point lighting for better depth
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    // Key light
    this.light = new THREE.DirectionalLight(0xffffff, 0.7);
    this.light.position.set(5, 10, 7);
    this.scene.add(this.light);

    // Fill light (softer, from other side)
    this.fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    this.fillLight.position.set(-5, 5, -3);
    this.scene.add(this.fillLight);

    // Setup camera (perspective for better 3D feel)
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    
    // Position camera at isometric-like angle
    this.camera.position.set(5, 5, 5);
    this.camera.lookAt(0, 0, 0);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ThumbnailGenerator {
    if (!this.instance) {
      this.instance = new ThumbnailGenerator();
    }
    return this.instance;
  }

  /**
   * Generate thumbnail for an asset (static convenience method)
   */
  static async generate(
    mesh: THREE.Object3D, 
    options: ThumbnailOptions = {}
  ): Promise<string> {
    return this.getInstance().generateFromMesh(mesh, options);
  }

  /**
   * Generate thumbnail for an asset from metadata
   */
  async generateFromMetadata(
    assetMetadata: AssetMetadata, 
    options: ThumbnailOptions = {}
  ): Promise<string> {
    // Check cache first
    const cacheKey = this.getCacheKey(assetMetadata.id, options);
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    try {
      // Create mesh from metadata
      const mesh = AssetFactory.createAssetMesh(assetMetadata);
      const dataUrl = await this.generateFromMesh(mesh, options);

      // Cache it
      this.setCached(cacheKey, dataUrl);

      // Cleanup
      AssetFactory.disposeAsset(mesh);

      return dataUrl;
    } catch (error) {
      console.error('Failed to generate thumbnail for', assetMetadata.id, error);
      return this.getPlaceholder();
    }
  }

  /**
   * Generate thumbnail from an existing mesh
   */
  async generateFromMesh(
    mesh: THREE.Object3D, 
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      size = DEFAULT_THUMBNAIL_SIZE,
      padding = 0.2,
      angle = 'isometric',
    } = options;

    try {
      // Resize renderer if needed
      if (this.renderer.domElement.width !== size) {
        this.renderer.setSize(size, size);
      }

      // Clone mesh to avoid modifying original
      const meshClone = mesh.clone(true);
      this.scene.add(meshClone);

      // Calculate bounding box
      const box = new THREE.Box3().setFromObject(meshClone);
      const center = box.getCenter(new THREE.Vector3());
      const size3 = box.getSize(new THREE.Vector3());
      
      // Center the mesh
      meshClone.position.sub(center);

      // Calculate camera distance to fit object
      const maxDim = Math.max(size3.x, size3.y, size3.z);
      const paddedSize = maxDim * (1 + padding);
      
      // Calculate distance based on FOV (50°) to fit the object
      const fov = 50 * (Math.PI / 180);
      const distance = paddedSize / (2 * Math.tan(fov / 2)) * 1.2;

      // Position camera based on angle
      switch (angle) {
        case 'front':
          this.camera.position.set(0, size3.y / 2, distance);
          break;
        case 'top':
          this.camera.position.set(0, distance, 0.01);
          break;
        case 'isometric':
        default:
          // True isometric angle (atan(1/sqrt(2)) ≈ 35.264°)
          const iso = distance / Math.sqrt(3);
          this.camera.position.set(iso, iso * 1.2, iso); // Slightly higher for better view
          break;
      }
      
      this.camera.lookAt(0, size3.y * 0.3, 0); // Look slightly above center for better composition
      this.camera.updateProjectionMatrix();

      // Adjust light positions based on camera
      this.light.position.copy(this.camera.position);
      this.light.position.y += 5;
      this.light.position.x += 3;

      // Render
      this.renderer.render(this.scene, this.camera);

      // Get data URL
      const dataUrl = this.renderer.domElement.toDataURL('image/png');

      // Cleanup
      this.scene.remove(meshClone);
      this.disposeObject(meshClone);

      return dataUrl;
    } catch (error) {
      console.error('Failed to generate thumbnail:', error);
      return this.getPlaceholder();
    }
  }

  /**
   * Generate thumbnail for a facility (multiple objects)
   */
  async generateFacilityThumbnail(
    objects: THREE.Object3D[], 
    options: ThumbnailOptions = {}
  ): Promise<string> {
    const {
      size = DEFAULT_THUMBNAIL_SIZE * 2, // Larger for facilities
      padding = 0.3,
    } = options;

    try {
      // Resize renderer
      this.renderer.setSize(size, size);

      // Create a group with all objects
      const group = new THREE.Group();
      objects.forEach(obj => {
        const clone = obj.clone(true);
        group.add(clone);
      });
      this.scene.add(group);

      // Calculate bounding box of all objects
      const box = new THREE.Box3().setFromObject(group);
      const center = box.getCenter(new THREE.Vector3());
      const size3 = box.getSize(new THREE.Vector3());

      // Center the group
      group.position.sub(center);

      // Calculate camera distance
      const maxDim = Math.max(size3.x, size3.y, size3.z);
      const paddedSize = maxDim * (1 + padding);
      const fov = 50 * (Math.PI / 180);
      const distance = paddedSize / (2 * Math.tan(fov / 2)) * 1.3;

      // Position camera for facility overview
      const iso = distance / Math.sqrt(3);
      this.camera.position.set(iso, iso * 0.8, iso);
      this.camera.lookAt(0, 0, 0);
      this.camera.updateProjectionMatrix();

      // Render
      this.renderer.render(this.scene, this.camera);

      // Get data URL
      const dataUrl = this.renderer.domElement.toDataURL('image/png');

      // Cleanup
      this.scene.remove(group);
      this.disposeObject(group);

      // Reset renderer size
      this.renderer.setSize(DEFAULT_THUMBNAIL_SIZE, DEFAULT_THUMBNAIL_SIZE);

      return dataUrl;
    } catch (error) {
      console.error('Failed to generate facility thumbnail:', error);
      return this.getPlaceholder();
    }
  }

  /**
   * Get cache key for options
   */
  private getCacheKey(assetId: string, options: ThumbnailOptions): string {
    const optionsSuffix = options.size !== DEFAULT_THUMBNAIL_SIZE ? `_${options.size}` : '';
    const angleSuffix = options.angle && options.angle !== 'isometric' ? `_${options.angle}` : '';
    return assetId + optionsSuffix + angleSuffix;
  }

  /**
   * Get placeholder image
   */
  private getPlaceholder(): string {
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }

  /**
   * Dispose of a Three.js object and its children
   */
  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).geometry) {
        (child as THREE.Mesh).geometry.dispose();
      }
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material;
        if (Array.isArray(mat)) {
          mat.forEach(m => m.dispose());
        } else {
          mat.dispose();
        }
      }
    });
  }

  /**
   * Generate thumbnail for an asset (backward compatibility)
   */
  async generate(assetMetadata: AssetMetadata): Promise<string> {
    return this.generateFromMetadata(assetMetadata);
  }

  /**
   * Get cached thumbnail
   */
  private getCached(assetId: string): string | null {
    try {
      return localStorage.getItem(CACHE_PREFIX + assetId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Set cached thumbnail
   */
  private setCached(assetId: string, dataUrl: string): void {
    try {
      localStorage.setItem(CACHE_PREFIX + assetId, dataUrl);
    } catch (error) {
      console.warn('Failed to cache thumbnail:', assetId, error);
    }
  }

  /**
   * Clear cache for a specific asset
   */
  clearCache(assetId: string): void {
    try {
      localStorage.removeItem(CACHE_PREFIX + assetId);
    } catch (error) {
      console.warn('Failed to clear thumbnail cache:', assetId, error);
    }
  }

  /**
   * Clear all thumbnail caches
   */
  clearAllCaches(): void {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith(CACHE_PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear all thumbnail caches:', error);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.renderer.dispose();
  }
}

