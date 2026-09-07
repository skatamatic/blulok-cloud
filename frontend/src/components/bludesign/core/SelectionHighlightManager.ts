/**
 * Selection Highlight Manager
 * 
 * Creates Unity-style 3D selection highlights that conform to object geometry.
 * Uses EdgesGeometry to render animated, glowing outlines around selected objects.
 */

import * as THREE from 'three';

// Custom shader for animated selection outline
const OUTLINE_VERTEX_SHADER = `
  varying vec3 vPosition;
  
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const OUTLINE_FRAGMENT_SHADER = `
  uniform float time;
  uniform vec3 color;
  uniform float dashSize;
  uniform float gapSize;
  uniform float glowIntensity;
  
  varying vec3 vPosition;
  
  void main() {
    // Calculate position along the edge for dash pattern
    float dist = length(vPosition);
    float dashPattern = mod(dist * 10.0 + time * 3.0, dashSize + gapSize);
    
    // Create dashed effect
    float alpha = step(dashPattern, dashSize);
    
    // Add glow falloff
    float glow = glowIntensity;
    
    gl_FragColor = vec4(color, alpha * glow);
  }
`;

export interface SelectionHighlight {
  id: string;
  outlineMesh: THREE.LineSegments;
  targetObject: THREE.Object3D;
}

export class SelectionHighlightManager {
  private scene: THREE.Scene;
  private highlights: Map<string, SelectionHighlight> = new Map();
  private clock: THREE.Clock;
  
  // Highlight appearance settings
  private highlightColor: THREE.Color = new THREE.Color(0xFFB800); // Yellow/orange like Unity
  private lineWidth: number = 5; // 2.5x thicker (from 2 to 5)
  private dashSize: number = 0.5;
  private gapSize: number = 0.25;
  private glowIntensity: number = 1.0;
  private animationSpeed: number = 2.0;
  private outlineScale: number = 1.015; // Slight scale increase to create thicker visual effect
  
  // Shared material for all highlights (more performant)
  private outlineMaterial: THREE.ShaderMaterial;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.clock = new THREE.Clock();
    
    // Create shared shader material for animated outlines
    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color: { value: this.highlightColor },
        dashSize: { value: this.dashSize },
        gapSize: { value: this.gapSize },
        glowIntensity: { value: this.glowIntensity },
      },
      vertexShader: OUTLINE_VERTEX_SHADER,
      fragmentShader: OUTLINE_FRAGMENT_SHADER,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Update highlights (call in render loop)
   */
  update(): void {
    // Update animation time
    const time = this.clock.getElapsedTime() * this.animationSpeed;
    this.outlineMaterial.uniforms.time.value = time;
    
    // Update highlight positions to follow their target objects
    this.highlights.forEach((highlight) => {
      if (highlight.targetObject) {
        // Copy world transform from target with scale factor for thicker appearance
        highlight.outlineMesh.position.copy(highlight.targetObject.position);
        highlight.outlineMesh.rotation.copy(highlight.targetObject.rotation);
        highlight.outlineMesh.scale.copy(highlight.targetObject.scale).multiplyScalar(this.outlineScale);
        highlight.outlineMesh.updateMatrix();
      }
    });
  }

  /**
   * Add selection highlight to an object
   */
  addHighlight(id: string, object: THREE.Object3D): void {
    // Remove existing highlight if present
    if (this.highlights.has(id)) {
      this.removeHighlight(id);
    }
    
    // Create edges geometry from the object
    const outlineMesh = this.createOutlineMesh(object);
    if (!outlineMesh) return;
    
    outlineMesh.userData.isSelectionHighlight = true;
    outlineMesh.userData.selectable = false;
    outlineMesh.renderOrder = 999; // Render on top
    
    this.scene.add(outlineMesh);
    
    this.highlights.set(id, {
      id,
      outlineMesh,
      targetObject: object,
    });
  }

  /**
   * Remove selection highlight from an object
   */
  removeHighlight(id: string): void {
    const highlight = this.highlights.get(id);
    if (highlight) {
      this.scene.remove(highlight.outlineMesh);
      highlight.outlineMesh.geometry.dispose();
      this.highlights.delete(id);
    }
  }

  /**
   * Clear all highlights
   */
  clearAllHighlights(): void {
    this.highlights.forEach((highlight) => {
      this.scene.remove(highlight.outlineMesh);
      highlight.outlineMesh.geometry.dispose();
    });
    this.highlights.clear();
  }

  /**
   * Update highlights based on selection state
   */
  updateSelection(selectedIds: string[], objectMap: Map<string, THREE.Object3D>): void {
    const currentHighlightIds = new Set(this.highlights.keys());
    const newSelectionIds = new Set(selectedIds);
    
    // Remove highlights for deselected objects
    currentHighlightIds.forEach((id) => {
      if (!newSelectionIds.has(id)) {
        this.removeHighlight(id);
      }
    });
    
    // Add highlights for newly selected objects
    selectedIds.forEach((id) => {
      if (!this.highlights.has(id)) {
        const object = objectMap.get(id);
        if (object) {
          this.addHighlight(id, object);
        }
      }
    });
  }

  /**
   * Update highlight positions to match their target objects immediately
   * Called when objects are moved visually (e.g., during smooth movement)
   * @param ids - Array of object IDs to update
   * @param getMesh - Function to get the mesh for an ID
   */
  updatePositions(ids: string[], getMesh: (id: string) => THREE.Object3D | null): void {
    for (const id of ids) {
      const highlight = this.highlights.get(id);
      if (highlight) {
        const mesh = getMesh(id);
        if (mesh) {
          // Update target object reference in case it changed
          highlight.targetObject = mesh;
          
          // Immediately sync position
          highlight.outlineMesh.position.copy(mesh.position);
          highlight.outlineMesh.rotation.copy(mesh.rotation);
          highlight.outlineMesh.scale.copy(mesh.scale).multiplyScalar(this.outlineScale);
          highlight.outlineMesh.updateMatrix();
        }
      }
    }
  }

  /**
   * Create outline mesh from object geometry
   */
  private createOutlineMesh(object: THREE.Object3D): THREE.LineSegments | null {
    // Collect all geometries from the object and its children
    const geometries: THREE.BufferGeometry[] = [];
    const transforms: THREE.Matrix4[] = [];
    
    object.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometries.push(child.geometry);
        
        // Get world transform relative to parent object
        const matrix = new THREE.Matrix4();
        matrix.copy(child.matrixWorld);
        
        // If the object has a world matrix, make the child transform relative
        const parentInverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
        matrix.premultiply(parentInverse);
        
        transforms.push(matrix);
      }
    });
    
    if (geometries.length === 0) return null;
    
    // Create merged edges geometry
    const mergedEdgesPoints: number[] = [];
    
    geometries.forEach((geometry, index) => {
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 30); // 30 degree threshold
      const positions = edgesGeometry.getAttribute('position');
      const transform = transforms[index];
      
      for (let i = 0; i < positions.count; i++) {
        const vertex = new THREE.Vector3(
          positions.getX(i),
          positions.getY(i),
          positions.getZ(i)
        );
        
        // Apply local transform
        vertex.applyMatrix4(transform);
        
        mergedEdgesPoints.push(vertex.x, vertex.y, vertex.z);
      }
      
      edgesGeometry.dispose();
    });
    
    // Create final geometry
    const finalGeometry = new THREE.BufferGeometry();
    finalGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(mergedEdgesPoints, 3)
    );
    
    // Create line material with animation (fallback for simple rendering)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: this.highlightColor,
      linewidth: this.lineWidth,
      transparent: true,
      opacity: 1.0,
      depthTest: true,
      depthWrite: false,
    });
    
    const outlineMesh = new THREE.LineSegments(finalGeometry, lineMaterial);
    
    // Copy initial transform with slight scale increase for thicker appearance
    outlineMesh.position.copy(object.position);
    outlineMesh.rotation.copy(object.rotation);
    outlineMesh.scale.copy(object.scale).multiplyScalar(this.outlineScale);
    
    return outlineMesh;
  }

  /**
   * Set highlight color
   */
  setColor(color: THREE.Color | number | string): void {
    this.highlightColor = new THREE.Color(color);
    this.outlineMaterial.uniforms.color.value = this.highlightColor;
    
    // Update existing highlights
    this.highlights.forEach((highlight) => {
      const material = highlight.outlineMesh.material as THREE.LineBasicMaterial;
      material.color = this.highlightColor;
    });
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.clearAllHighlights();
    this.outlineMaterial.dispose();
  }
}

