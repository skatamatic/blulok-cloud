/**
 * Rotate Gizmo
 * 
 * A Y-axis rotation gizmo for rotating selected objects.
 * Ring-shaped handle with visual feedback showing rotation angle.
 */

import * as THREE from 'three';
import type { GridSystem } from './GridSystem';

/** Local indicator angle vs working-grid yaw (same convention as translate gizmo). */
function relativeYawForIndicator(worldYawRad: number, gridYawRad: number): number {
  return ((worldYawRad - gridYawRad + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
}

export interface RotateGizmoCallbacks {
  onDragStart: () => void;
  onDrag: (deltaAngle: number, totalAngle: number) => void;
  onDragEnd: (totalAngle: number) => void;
  /** Called when gizmo hover state changes (to disable other interactions) */
  onHoverChange?: (isHovered: boolean) => void;
}

export class RotateGizmo {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private container: HTMLElement;
  private gridSystem: GridSystem;
  private callbacks: RotateGizmoCallbacks;
  
  // Gizmo components
  private gizmoGroup: THREE.Group | null = null;
  private rotationRing: THREE.Mesh | null = null;
  private hitAreaRing: THREE.Mesh | null = null; // Invisible but larger for easier clicking
  private angleIndicator: THREE.Line | null = null;
  
  // State
  private isVisible: boolean = false;
  private isDragging: boolean = false;
  private dragStartAngle: number = 0;
  private currentAngle: number = 0;
  private totalRotation: number = 0;
  
  // Raycasting
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  
  // Appearance - larger and easier to interact with
  private readonly ringRadius = 4.5;       // Larger ring (was 3.0)
  private readonly ringTubeRadius = 0.25;  // Thicker tube (was 0.15)
  private readonly hitAreaTubeRadius = 0.6; // Invisible hit area for easier clicking
  private readonly hoverScale = 1.1;
  
  // Colors
  private readonly ringColor = new THREE.Color(0x33aaff); // Light blue
  private readonly hoverColor = new THREE.Color(0xffffff); // White
  private readonly activeColor = new THREE.Color(0x00ff88); // Green when dragging
  
  // Hover state
  private isHovered: boolean = false;
  
  // Event handlers
  private handleMouseMove: (e: MouseEvent) => void;
  private handleMouseDown: (e: MouseEvent) => void;
  private handleMouseUp: (e: MouseEvent) => void;

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    container: HTMLElement,
    gridSystem: GridSystem,
    callbacks: RotateGizmoCallbacks
  ) {
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.gridSystem = gridSystem;
    this.callbacks = callbacks;
    
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    
    // Bind event handlers
    this.handleMouseMove = this.onMouseMove.bind(this);
    this.handleMouseDown = this.onMouseDown.bind(this);
    this.handleMouseUp = this.onMouseUp.bind(this);
    
    this.createGizmo();
  }

  /**
   * Create the gizmo meshes
   */
  private createGizmo(): void {
    this.gizmoGroup = new THREE.Group();
    this.gizmoGroup.userData.isGizmo = true;
    this.gizmoGroup.userData.selectable = false;
    this.gizmoGroup.renderOrder = 9999;
    
    // Create invisible hit area ring (larger tube for easier clicking)
    const hitAreaGeometry = new THREE.TorusGeometry(
      this.ringRadius,
      this.hitAreaTubeRadius,
      8,
      32
    );
    hitAreaGeometry.rotateX(Math.PI / 2);
    
    const hitAreaMaterial = new THREE.MeshBasicMaterial({
      visible: false, // Invisible but still raycastable
      depthTest: false,
    });
    
    this.hitAreaRing = new THREE.Mesh(hitAreaGeometry, hitAreaMaterial);
    this.hitAreaRing.renderOrder = 9998;
    this.hitAreaRing.userData.isRotateRing = true;
    this.gizmoGroup.add(this.hitAreaRing);
    
    // Create visible rotation ring (torus)
    const ringGeometry = new THREE.TorusGeometry(
      this.ringRadius,
      this.ringTubeRadius,
      16,
      64
    );
    // Rotate to lie flat on XZ plane
    ringGeometry.rotateX(Math.PI / 2);
    
    const ringMaterial = new THREE.MeshStandardMaterial({
      color: this.ringColor,
      metalness: 0.5,
      roughness: 0.3,
      depthTest: false,
      depthWrite: false,
    });
    
    this.rotationRing = new THREE.Mesh(ringGeometry, ringMaterial);
    this.rotationRing.renderOrder = 9999;
    this.rotationRing.userData.isRotateRing = true;
    // Ensure all child meshes also render on top
    this.rotationRing.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.renderOrder = 9999;
        if (child.material instanceof THREE.MeshStandardMaterial) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
        }
      }
    });
    this.gizmoGroup.add(this.rotationRing);
    
    // Create angle indicator line (shows current rotation direction)
    const indicatorGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(this.ringRadius, 0.1, 0)
    ]);
    const indicatorMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
    this.angleIndicator = new THREE.Line(indicatorGeometry, indicatorMaterial);
    this.angleIndicator.renderOrder = 10000;
    this.gizmoGroup.add(this.angleIndicator);
    
    this.gizmoGroup.visible = false;
    this.scene.add(this.gizmoGroup);
  }

  /**
   * Show gizmo at a world position (X/Z) at the given floor Y level
   */
  show(worldPosition: { x: number; z: number }, floorY: number, initialRotation: number = 0): void {
    if (!this.gizmoGroup) return;
    
    this.gizmoGroup.position.set(
      worldPosition.x,
      floorY + 0.1, // Slightly above floor
      worldPosition.z
    );

    const align = this.gridSystem.getGridAlignment();
    const yaw = align?.yaw ?? 0;
    this.gizmoGroup.rotation.set(0, yaw, 0);
    this.currentAngle = align ? relativeYawForIndicator(initialRotation, yaw) : initialRotation;
    
    // Ensure all children render on top
    this.ensureRenderOnTop(this.gizmoGroup);
    
    this.updateIndicator();
    
    this.gizmoGroup.visible = true;
    this.isVisible = true;
    
    // Add event listeners
    this.container.addEventListener('mousemove', this.handleMouseMove, { capture: true });
    this.container.addEventListener('mousedown', this.handleMouseDown, { capture: true });
    this.container.addEventListener('mouseup', this.handleMouseUp, { capture: true });
  }
  
  /**
   * Recursively ensure all gizmo children render on top
   */
  private ensureRenderOnTop(obj: THREE.Object3D): void {
    obj.renderOrder = 9999;
    obj.traverse((child) => {
      child.renderOrder = 9999;
      if (child instanceof THREE.Mesh) {
        if (child.material instanceof THREE.MeshStandardMaterial || 
            child.material instanceof THREE.MeshBasicMaterial) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
        }
      } else if (child instanceof THREE.Line) {
        if (child.material instanceof THREE.LineBasicMaterial) {
          child.material.depthTest = false;
          child.material.depthWrite = false;
        }
      }
    });
  }

  /**
   * Hide gizmo
   */
  hide(): void {
    if (!this.gizmoGroup) return;
    
    this.gizmoGroup.visible = false;
    this.isVisible = false;
    this.isHovered = false;
    
    // Remove event listeners
    this.container.removeEventListener('mousemove', this.handleMouseMove, { capture: true });
    this.container.removeEventListener('mousedown', this.handleMouseDown, { capture: true });
    this.container.removeEventListener('mouseup', this.handleMouseUp, { capture: true });
  }

  /**
   * Update gizmo position (X/Z) and floor Y level
   */
  setPosition(
    worldPosition: { x: number; z: number },
    floorY: number,
    objectWorldRotationRad?: number
  ): void {
    if (!this.gizmoGroup || !this.isVisible) return;
    
    this.gizmoGroup.position.set(
      worldPosition.x,
      floorY + 0.1, // Slightly above floor
      worldPosition.z
    );

    const align = this.gridSystem.getGridAlignment();
    const gridYaw = align?.yaw ?? 0;
    this.gizmoGroup.rotation.set(0, gridYaw, 0);
    if (objectWorldRotationRad !== undefined) {
      this.currentAngle = align
        ? relativeYawForIndicator(objectWorldRotationRad, gridYaw)
        : objectWorldRotationRad;
      this.updateIndicator();
    }
  }

  /**
   * Update the angle indicator to show current rotation
   */
  private updateIndicator(): void {
    if (!this.angleIndicator) return;
    
    // Rotate indicator to show current angle
    this.angleIndicator.rotation.y = this.currentAngle;
  }

  /**
   * Check if gizmo is visible
   */
  isShown(): boolean {
    return this.isVisible;
  }

  /**
   * Check if gizmo is currently being dragged
   */
  isDraggingGizmo(): boolean {
    return this.isDragging;
  }

  /**
   * Check if gizmo is currently hovered
   */
  isGizmoHovered(): boolean {
    return this.isHovered;
  }

  /**
   * Handle mouse move - check for hover and drag
   */
  private onMouseMove(event: MouseEvent): void {
    if (!this.isVisible || !this.gizmoGroup) return;
    
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    if (this.isDragging) {
      event.stopPropagation();
      event.preventDefault();
      this.handleDrag();
    } else {
      this.updateHoverState();
      if (this.isHovered) {
        event.stopPropagation();
      }
    }
  }

  /**
   * Handle mouse down - start drag
   */
  private onMouseDown(event: MouseEvent): void {
    if (!this.isVisible || event.button !== 0) return;
    
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    if (this.gizmoGroup && this.hitAreaRing) {
      // Use hit area ring for intersection (larger and easier to click)
      const intersects = this.raycaster.intersectObject(this.hitAreaRing, true);
      
      if (intersects.length > 0) {
        event.stopPropagation();
        event.preventDefault();
        
        // Start drag
        this.isDragging = true;
        this.totalRotation = 0;
        
        // Calculate start angle from mouse position relative to gizmo center
        const gizmoCenter = this.gizmoGroup.position.clone();
        const intersectPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(
          new THREE.Plane(new THREE.Vector3(0, 1, 0), -gizmoCenter.y),
          intersectPoint
        );
        
        this.dragStartAngle = Math.atan2(
          intersectPoint.x - gizmoCenter.x,
          intersectPoint.z - gizmoCenter.z
        );
        
        // Update ring color
        if (this.rotationRing?.material instanceof THREE.MeshStandardMaterial) {
          this.rotationRing.material.color.copy(this.activeColor);
        }
        
        this.callbacks.onDragStart();
      }
    }
  }

  /**
   * Handle mouse up - end drag
   */
  private onMouseUp(event: MouseEvent): void {
    if (!this.isDragging) return;
    
    event.stopPropagation();
    event.preventDefault();
    
    this.isDragging = false;
    
    // Reset ring color
    if (this.rotationRing?.material instanceof THREE.MeshStandardMaterial) {
      this.rotationRing.material.color.copy(this.isHovered ? this.hoverColor : this.ringColor);
    }
    
    this.callbacks.onDragEnd(this.totalRotation);
  }

  /**
   * Handle drag - calculate rotation
   */
  private handleDrag(): void {
    if (!this.gizmoGroup) return;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Calculate current angle from mouse position
    const gizmoCenter = this.gizmoGroup.position.clone();
    const intersectPoint = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -gizmoCenter.y),
      intersectPoint
    );
    
    const currentMouseAngle = Math.atan2(
      intersectPoint.x - gizmoCenter.x,
      intersectPoint.z - gizmoCenter.z
    );
    
    // Calculate delta angle
    let deltaAngle = currentMouseAngle - this.dragStartAngle;
    
    // Normalize to -PI to PI
    while (deltaAngle > Math.PI) deltaAngle -= 2 * Math.PI;
    while (deltaAngle < -Math.PI) deltaAngle += 2 * Math.PI;
    
    // Update cumulative rotation
    this.totalRotation += deltaAngle;
    this.currentAngle += deltaAngle;
    
    // Normalize current angle
    while (this.currentAngle > Math.PI) this.currentAngle -= 2 * Math.PI;
    while (this.currentAngle < -Math.PI) this.currentAngle += 2 * Math.PI;
    
    // Update start angle for next frame
    this.dragStartAngle = currentMouseAngle;
    
    // Update visual indicator
    this.updateIndicator();
    
    this.callbacks.onDrag(deltaAngle, this.totalRotation);
  }

  /**
   * Update hover state
   */
  private updateHoverState(): void {
    if (!this.gizmoGroup || !this.hitAreaRing || !this.rotationRing) return;
    
    this.raycaster.setFromCamera(this.mouse, this.camera);
    // Use hit area ring for intersection (larger and easier to hover)
    const intersects = this.raycaster.intersectObject(this.hitAreaRing, true);
    
    const wasHovered = this.isHovered;
    this.isHovered = intersects.length > 0;
    
    // Update visual on the visible ring
    if (this.rotationRing.material instanceof THREE.MeshStandardMaterial) {
      // Ensure depth settings are maintained
      this.rotationRing.material.depthTest = false;
      this.rotationRing.material.depthWrite = false;
      this.rotationRing.renderOrder = 9999;
      
      if (this.isHovered && !this.isDragging) {
        this.rotationRing.material.color.copy(this.hoverColor);
        this.rotationRing.scale.setScalar(this.hoverScale);
      } else if (!this.isDragging) {
        this.rotationRing.material.color.copy(this.ringColor);
        this.rotationRing.scale.setScalar(1);
      }
    }
    
    // Notify callback of hover change
    if (wasHovered !== this.isHovered && this.callbacks.onHoverChange) {
      this.callbacks.onHoverChange(this.isHovered);
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.hide();
    
    if (this.gizmoGroup) {
      this.scene.remove(this.gizmoGroup);
      
      this.gizmoGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      
      this.gizmoGroup = null;
    }
    
    this.rotationRing = null;
    this.hitAreaRing = null;
    this.angleIndicator = null;
  }
}
