/**
 * Locker Preview 3D
 * 
 * Interactive 3D preview component for the Storage Locker Wizard.
 * Features:
 * - Real-time geometry updates as dimensions change
 * - Orbit controls for rotation and zoom
 * - Grid overlay showing footprint
 * - Uses default skin from ThemeManager
 */

import React, { useRef, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTheme } from '@/contexts/ThemeContext';
import { AssetFactory, LockerSpec } from '../../assets/AssetFactory';
import { AssetDimensions, GRID_UNIT_METERS, DeviceState } from '../../core/types';

interface LockerPreview3DProps {
  dimensions: AssetDimensions;
  lockerSpec: LockerSpec;
  gridUnits: { x: number; z: number };
}

export const LockerPreview3D: React.FC<LockerPreview3DProps> = ({
  dimensions,
  lockerSpec,
  gridUnits,
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
  
  // Update locker mesh when dimensions or spec changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    
    // Remove old mesh
    if (lockerMeshRef.current) {
      scene.remove(lockerMeshRef.current);
      lockerMeshRef.current = null;
    }
    
    // Create new mesh
    const lockerMesh = AssetFactory.createCustomStorageUnit(
      dimensions,
      lockerSpec,
      DeviceState.LOCKED
    );
    lockerMesh.castShadow = true;
    lockerMesh.receiveShadow = true;
    
    // Enable shadows on all children
    lockerMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    
    scene.add(lockerMesh);
    lockerMeshRef.current = lockerMesh;
  }, [dimensions, lockerSpec]);
  
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
    const maxSize = Math.max(gridSizeX, gridSizeZ);
    const divisions = Math.max(gridUnits.x, gridUnits.z);
    
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

