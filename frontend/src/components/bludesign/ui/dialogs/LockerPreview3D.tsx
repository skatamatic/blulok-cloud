/**
 * Locker Preview 3D
 * 
 * Interactive 3D preview component for the Storage Locker Wizard.
 * Features:
 * - Real-time geometry updates as dimensions change
 * - Orbit controls for rotation and zoom
 * - Grid overlay showing footprint
 * - Uses default skin from ThemeManager
 * - Component highlighting for smart component selection
 */

import React, { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetFactory, LockerSpec } from '../../assets/AssetFactory';
import { AssetDimensions, GRID_UNIT_METERS, DeviceState } from '../../core/types';

// Model hierarchy node type (matches wizard)
interface ModelNode {
  name: string;
  path: string;
  type: 'group' | 'mesh';
  children: ModelNode[];
}

// Model loaded callback data
interface ModelLoadedData {
  dimensions: { width: number; height: number; depth: number };
  hierarchy: ModelNode[];
}

interface LockerPreview3DProps {
  dimensions: AssetDimensions;
  lockerSpec: LockerSpec;
  gridUnits: { x: number; z: number };
  uploadedFile?: File;
  offset?: { x: number; y: number; z: number };
  scaleMode?: 'uniform' | 'dimensions';
  highlightedPath?: string | null;
  onModelLoaded?: (data: ModelLoadedData) => void;
}

export const LockerPreview3D: React.FC<LockerPreview3DProps> = ({
  dimensions,
  lockerSpec,
  gridUnits,
  uploadedFile,
  offset,
  scaleMode = 'uniform',
  highlightedPath,
  onModelLoaded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const lockerMeshRef = useRef<THREE.Object3D | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const animationFrameRef = useRef<number>(0);
  
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;
    
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(isDark ? 0x1a1a2e : 0xf0f0f0);
    sceneRef.current = scene;
    
    // Camera
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(5, 4, 5);
    camera.lookAt(0, 1, 0);
    cameraRef.current = camera;
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    
    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 2;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.target.set(0, 1, 0);
    controls.update();
    controlsRef.current = controls;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);
    
    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: isDark ? 0x2a2a3e : 0xcccccc,
      roughness: 0.8,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);
    
    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    
    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };
    
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [isDark]);
  
  // Track the uploaded file URL to avoid reloading the same file
  const uploadedFileUrlRef = useRef<string | null>(null);
  const lastUploadedFileRef = useRef<File | null>(null);
  
  // Store original model size for scaling calculations (for uploaded models)
  const originalModelSizeRef = useRef<THREE.Vector3 | null>(null);
  const originalModelCenterRef = useRef<THREE.Vector3 | null>(null);
  
  // Store reference to loaded model for hierarchy traversal
  const loadedModelRef = useRef<THREE.Object3D | null>(null);
  
  // Extract hierarchy from THREE object
  const extractHierarchy = useCallback((object: THREE.Object3D, parentPath: string = ''): ModelNode[] => {
    const nodes: ModelNode[] = [];
    
    object.children.forEach((child, index) => {
      const name = child.name || `Object_${index}`;
      const path = parentPath ? `${parentPath}/${name}` : name;
      const type = child.type === 'Mesh' ? 'mesh' : 'group';
      
      nodes.push({
        name,
        path,
        type: type as 'mesh' | 'group',
        children: extractHierarchy(child, path),
      });
    });
    
    return nodes;
  }, []);
  
  // Load uploaded model ONLY when file changes - not dimensions!
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    // Only handle uploaded file changes here
    if (!uploadedFile) {
      // Clear uploaded file refs when no file
      lastUploadedFileRef.current = null;
      originalModelSizeRef.current = null;
      originalModelCenterRef.current = null;
      loadedModelRef.current = null;
      return;
    }
    
    // Skip if the uploaded file hasn't actually changed (same File object)
    if (uploadedFile === lastUploadedFileRef.current && lockerMeshRef.current) {
      return;
    }
    
    // Remove old mesh
    if (lockerMeshRef.current) {
      scene.remove(lockerMeshRef.current);
      lockerMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      lockerMeshRef.current = null;
    }
    
    // Clean up old URL
    if (uploadedFileUrlRef.current) {
      URL.revokeObjectURL(uploadedFileUrlRef.current);
      uploadedFileUrlRef.current = null;
    }
    
    lastUploadedFileRef.current = uploadedFile;
    
    const loadModel = async () => {
      try {
        const extension = uploadedFile.name.toLowerCase().split('.').pop();
        const url = URL.createObjectURL(uploadedFile);
        uploadedFileUrlRef.current = url;
        
        let model: THREE.Object3D;
        
        if (extension === 'glb' || extension === 'gltf') {
          const loader = new GLTFLoader();
          const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          model = gltf.scene.clone();
        } else if (extension === 'fbx') {
          const loader = new FBXLoader();
          model = await new Promise<THREE.Object3D>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          model = model.clone();
        } else {
          throw new Error(`Unsupported format: .${extension}`);
        }
        
        // Store reference to loaded model (before transforms)
        loadedModelRef.current = model;
        
        // Calculate and store original bounding box info BEFORE any transforms
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        originalModelSizeRef.current = size.clone();
        originalModelCenterRef.current = center.clone();
        
        // Extract hierarchy and notify parent
        const hierarchy = extractHierarchy(model);
        if (onModelLoaded) {
          onModelLoaded({
            dimensions: { width: size.x, height: size.y, depth: size.z },
            hierarchy,
          });
        }
        
        // Apply initial scale - use uniform scaling initially
        const scale = 1.0; // Natural size
        model.scale.set(scale, scale, scale);
        model.position.sub(center.clone().multiplyScalar(scale));
        model.position.y = 0;
        
        basePositionRef.current.copy(model.position);
        
        model.castShadow = true;
        model.receiveShadow = true;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        
        scene.add(model);
        lockerMeshRef.current = model;
      } catch (error) {
        console.error('Failed to load uploaded model:', error);
        originalModelSizeRef.current = null;
        originalModelCenterRef.current = null;
        loadedModelRef.current = null;
      }
    };
    
    loadModel();
    
    return () => {
      if (uploadedFileUrlRef.current) {
        URL.revokeObjectURL(uploadedFileUrlRef.current);
        uploadedFileUrlRef.current = null;
      }
    };
  }, [uploadedFile, onModelLoaded, extractHierarchy]); // ONLY uploadedFile - dimensions handled separately!
  
  // Update scale/position for uploaded models when dimensions change (cheap operation!)
  useEffect(() => {
    if (!uploadedFile || !lockerMeshRef.current || !originalModelSizeRef.current || !originalModelCenterRef.current) {
      return;
    }
    
    const model = lockerMeshRef.current;
    const size = originalModelSizeRef.current;
    
    let scaleX: number, scaleY: number, scaleZ: number;
    
    if (scaleMode === 'dimensions') {
      // Non-uniform scaling - stretch to exact dimensions
      scaleX = dimensions.width / size.x;
      scaleY = dimensions.height / size.y;
      scaleZ = dimensions.depth / size.z;
    } else {
      // Uniform scaling - maintain proportions (use width as reference)
      const uniformScale = dimensions.width / size.x;
      scaleX = uniformScale;
      scaleY = uniformScale;
      scaleZ = uniformScale;
    }
    
    // Apply scale first
    model.scale.set(scaleX, scaleY, scaleZ);
    
    // Reset position to calculate proper grounding
    model.position.set(0, 0, 0);
    
    // Recalculate bounding box after scaling to properly ground the model
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
    const scaledMin = scaledBox.min;
    
    // Position model so its center XZ is at origin, and bottom Y sits at ground (y=0)
    model.position.x = -scaledCenter.x;
    model.position.y = -scaledMin.y; // This places the bottom of the model at y=0
    model.position.z = -scaledCenter.z;
    
    // Update base position for offset calculations
    basePositionRef.current.copy(model.position);
    
    // Re-apply offset if any (this matches how CustomAssetLoader applies positionOffset)
    if (offset) {
      model.position.x += offset.x;
      model.position.y += offset.y;
      model.position.z += offset.z;
    }
  }, [uploadedFile, dimensions.width, dimensions.height, dimensions.depth, offset?.x, offset?.y, offset?.z, scaleMode]);
  
  // Store original materials for highlighting
  const originalMaterialsRef = useRef<Map<THREE.Mesh, THREE.Material | THREE.Material[]>>(new Map());
  const highlightMaterial = useRef<THREE.MeshStandardMaterial>(
    new THREE.MeshStandardMaterial({ 
      color: 0x147FD4, 
      emissive: 0x147FD4, 
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.9,
    })
  );
  
  // Find object by path in the model
  const findObjectByPath = useCallback((model: THREE.Object3D, path: string): THREE.Object3D | null => {
    const parts = path.split('/');
    let current: THREE.Object3D = model;
    
    for (const part of parts) {
      const child = current.children.find(c => (c.name || `Object_${current.children.indexOf(c)}`) === part);
      if (!child) return null;
      current = child;
    }
    
    return current;
  }, []);
  
  // Handle component highlighting
  useEffect(() => {
    if (!lockerMeshRef.current) return;
    
    const model = lockerMeshRef.current;
    
    // Restore all original materials first
    originalMaterialsRef.current.forEach((originalMaterial, mesh) => {
      mesh.material = originalMaterial;
    });
    originalMaterialsRef.current.clear();
    
    // Apply highlight if path is specified
    if (highlightedPath) {
      const targetObject = findObjectByPath(model, highlightedPath);
      if (targetObject) {
        targetObject.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Store original material
            originalMaterialsRef.current.set(child, child.material);
            // Apply highlight material
            child.material = highlightMaterial.current;
          }
        });
      }
    }
  }, [highlightedPath, findObjectByPath]);
  
  // Handle primitive (generated) mesh - only when no uploaded file
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || uploadedFile) return; // Skip if there's an uploaded file
    
    // Remove old mesh
    if (lockerMeshRef.current) {
      scene.remove(lockerMeshRef.current);
      lockerMeshRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      lockerMeshRef.current = null;
    }
    
    // Create generated mesh
    const lockerMesh = AssetFactory.createCustomStorageUnit(
      dimensions,
      lockerSpec,
      DeviceState.LOCKED
    );
    lockerMesh.castShadow = true;
    lockerMesh.receiveShadow = true;
    
    lockerMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    basePositionRef.current.copy(lockerMesh.position);
    
    scene.add(lockerMesh);
    lockerMeshRef.current = lockerMesh;
  }, [dimensions, lockerSpec, uploadedFile]);
  
  // Store base position for offset calculations
  const basePositionRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
  
  // Update grid helper when grid units change
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    // Remove old grid
    if (gridHelperRef.current) {
      scene.remove(gridHelperRef.current);
      gridHelperRef.current = null;
    }
    
    // Create grid helper showing the footprint
    const gridSizeX = gridUnits.x * GRID_UNIT_METERS;
    const gridSizeZ = gridUnits.z * GRID_UNIT_METERS;
    // Grid size calculated from units
    
    // Use a group to create a custom grid
    const gridGroup = new THREE.Group();
    
    // Footprint outline
    const outlinePoints = [
      new THREE.Vector3(-gridSizeX / 2, 0.01, -gridSizeZ / 2),
      new THREE.Vector3(gridSizeX / 2, 0.01, -gridSizeZ / 2),
      new THREE.Vector3(gridSizeX / 2, 0.01, gridSizeZ / 2),
      new THREE.Vector3(-gridSizeX / 2, 0.01, gridSizeZ / 2),
      new THREE.Vector3(-gridSizeX / 2, 0.01, -gridSizeZ / 2),
    ];
    
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
    const outlineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x147FD4, 
      linewidth: 2 
    });
    const outlineLine = new THREE.Line(outlineGeometry, outlineMaterial);
    gridGroup.add(outlineLine);
    
    // Grid lines inside footprint
    const gridLineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x147FD4, 
      opacity: 0.3, 
      transparent: true 
    });
    
    // Vertical lines
    for (let i = 1; i < gridUnits.x; i++) {
      const x = -gridSizeX / 2 + i * GRID_UNIT_METERS;
      const linePoints = [
        new THREE.Vector3(x, 0.01, -gridSizeZ / 2),
        new THREE.Vector3(x, 0.01, gridSizeZ / 2),
      ];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const line = new THREE.Line(lineGeometry, gridLineMaterial);
      gridGroup.add(line);
    }
    
    // Horizontal lines
    for (let i = 1; i < gridUnits.z; i++) {
      const z = -gridSizeZ / 2 + i * GRID_UNIT_METERS;
      const linePoints = [
        new THREE.Vector3(-gridSizeX / 2, 0.01, z),
        new THREE.Vector3(gridSizeX / 2, 0.01, z),
      ];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const line = new THREE.Line(lineGeometry, gridLineMaterial);
      gridGroup.add(line);
    }
    
    scene.add(gridGroup);
    gridHelperRef.current = gridGroup as unknown as THREE.GridHelper;
  }, [gridUnits]);
  
  return (
    <div className="relative h-full rounded-lg overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Overlay info */}
      <div className="absolute top-3 left-3 flex gap-2">
        <div className={`
          px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm
          ${isDark ? 'bg-black/40 text-white' : 'bg-white/80 text-gray-900'}
        `}>
          Drag to rotate
        </div>
        <div className={`
          px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm
          ${isDark ? 'bg-black/40 text-white' : 'bg-white/80 text-gray-900'}
        `}>
          Scroll to zoom
        </div>
      </div>
      
      {/* Grid info */}
      <div className={`
        absolute bottom-3 left-3 px-3 py-2 rounded-lg backdrop-blur-sm
        ${isDark ? 'bg-black/40 text-white' : 'bg-white/80 text-gray-900'}
      `}>
        <p className="text-xs font-medium">
          Grid: {gridUnits.x} × {gridUnits.z} tiles
        </p>
        <p className="text-xs opacity-70">
          {(gridUnits.x * GRID_UNIT_METERS).toFixed(2)}m × {(gridUnits.z * GRID_UNIT_METERS).toFixed(2)}m
        </p>
      </div>
    </div>
  );
};

export default LockerPreview3D;

