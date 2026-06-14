/**
 * Camera Controller
 * 
 * Manages camera modes (free orbit and isometric), smooth transitions,
 * and user input for camera manipulation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CameraMode,
  CameraState,
  IsometricAngle,
  SerializedCameraState,
} from './types';

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private orthographicCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.Camera;
  
  private controls: OrbitControls;
  private container: HTMLElement;
  
  // State
  private mode: CameraMode;
  private isometricAngle: IsometricAngle;
  private isTransitioning: boolean = false;
  private transitionProgress: number = 0;
  private transitionDuration: number = 0.35; // seconds - faster feels more responsive
  private isArcTransition: boolean = false; // Use arc interpolation for rotations
  private transitionStart: {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null = null;
  private transitionEnd: {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null = null;
  
  // Isometric settings
  private isometricDistance: number = 100;
  private isometricHeight: number = 35; // Shallower angle - closer to ground
  private baseIsometricDistance: number = 100;
  private baseIsometricHeight: number = 35;
  private static readonly BASE_ORTHO_FRUSTUM = 35;
  
  // Ground clamp — prevent orbiting/zooming through the floor when no basement exists
  private groundClampEnabled = false;
  private minGroundY = 0;
  private groundClearance = 1.5;

  // WASD walk — move camera + orbit target on the XZ plane
  private walkEnabled = true;
  private walkKeys = {
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
  };
  private readonly walkForward = new THREE.Vector3();
  private readonly walkRight = new THREE.Vector3();
  private readonly walkMove = new THREE.Vector3();
  private readonly walkWorldUp = new THREE.Vector3(0, 1, 0);
  private boundClearWalkKeys: () => void;

  // Callbacks
  private onStateChange: (state: CameraState) => void;

  constructor(
    container: HTMLElement,
    initialState: CameraState,
    onStateChange: (state: CameraState) => void
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.mode = initialState.mode;
    this.isometricAngle = initialState.isometricAngle;
    
    const aspect = container.clientWidth / container.clientHeight;
    
    // Create perspective camera (for free mode)
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 2000);
    this.camera.position.copy(initialState.position);
    
    // Create orthographic camera (for isometric mode)
    // Use a smaller frustum size for tighter initial framing
    const frustumSize = 35;
    this.orthographicCamera = new THREE.OrthographicCamera(
      -frustumSize * aspect,
      frustumSize * aspect,
      frustumSize,
      -frustumSize,
      0.1,
      2000
    );
    
    // Set active camera based on mode
    this.activeCamera = this.mode === CameraMode.FREE ? this.camera : this.orthographicCamera;
    
    // Create orbit controls
    this.controls = new OrbitControls(this.camera, container);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // Don't go below ground
    this.controls.target.copy(initialState.target);
    
    // Default mouse buttons (for SELECT mode):
    // LEFT = rotate, RIGHT = pan, MIDDLE = zoom
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    
    // Apply initial state
    if (this.mode === CameraMode.ISOMETRIC) {
      this.applyIsometricAngle(this.isometricAngle, false);
    }

    this.boundClearWalkKeys = () => this.clearWalkKeys();
    window.addEventListener('blur', this.boundClearWalkKeys);
  }

  /**
   * Update camera (call in render loop)
   */
  update(delta: number): void {
    if (this.isTransitioning) {
      this.updateTransition(delta);
    }

    this.applyWalkMovement(delta);
    
    if (this.mode === CameraMode.FREE) {
      this.controls.update();
    }

    this.enforceGroundClamp();
  }

  /** Enable or disable WASD camera walk (e.g. while a modal has focus). */
  setWalkEnabled(enabled: boolean): void {
    this.walkEnabled = enabled;
    if (!enabled) {
      this.clearWalkKeys();
    }
  }

  /**
   * Track WASD / Shift for camera walk. Returns true when the key is consumed.
   */
  handleWalkKeyEvent(event: KeyboardEvent, isDown: boolean): boolean {
    if (!this.walkEnabled) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;

    const key = event.key.toLowerCase();
    let handled = false;
    switch (key) {
      case 'w':
        this.walkKeys.forward = isDown;
        handled = true;
        break;
      case 's':
        this.walkKeys.back = isDown;
        handled = true;
        break;
      case 'a':
        this.walkKeys.left = isDown;
        handled = true;
        break;
      case 'd':
        this.walkKeys.right = isDown;
        handled = true;
        break;
      case 'shift':
        this.walkKeys.sprint = isDown;
        handled = true;
        break;
      default:
        break;
    }

    if (handled && isDown) {
      event.preventDefault();
    }
    return handled;
  }

  private clearWalkKeys(): void {
    this.walkKeys.forward = false;
    this.walkKeys.back = false;
    this.walkKeys.left = false;
    this.walkKeys.right = false;
    this.walkKeys.sprint = false;
  }

  private applyWalkMovement(delta: number): void {
    if (!this.walkEnabled || this.isTransitioning) return;

    const { forward, back, left, right } = this.walkKeys;
    if (!forward && !back && !left && !right) return;

    this.activeCamera.getWorldDirection(this.walkForward);
    this.walkForward.y = 0;
    if (this.walkForward.lengthSq() < 1e-6) {
      this.walkForward.set(0, 0, -1);
    } else {
      this.walkForward.normalize();
    }

    this.walkRight.crossVectors(this.walkForward, this.walkWorldUp).normalize();

    this.walkMove.set(0, 0, 0);
    if (forward) this.walkMove.add(this.walkForward);
    if (back) this.walkMove.sub(this.walkForward);
    if (right) this.walkMove.add(this.walkRight);
    if (left) this.walkMove.sub(this.walkRight);
    if (this.walkMove.lengthSq() < 1e-6) return;

    this.walkMove.normalize();

    const baseSpeed = 36;
    const zoomScale = THREE.MathUtils.clamp(this.getWorldPerPixel() * 8, 0.35, 5);
    const sprintScale = this.walkKeys.sprint ? 2.5 : 1;
    this.walkMove.multiplyScalar(baseSpeed * zoomScale * sprintScale * delta);

    this.activeCamera.position.add(this.walkMove);
    this.controls.target.add(this.walkMove);

    if (this.mode === CameraMode.FREE) {
      this.camera.position.copy(this.activeCamera.position);
    } else {
      this.orthographicCamera.position.copy(this.activeCamera.position);
    }
  }

  /**
   * When enabled, keeps the camera above {@link minGroundY} so users cannot clip through
   * the ground plane. Disabled when the facility has basement floors (negative levels).
   */
  setGroundClamp(options: {
    enabled: boolean;
    minGroundY?: number;
    clearance?: number;
  }): void {
    this.groundClampEnabled = options.enabled;
    if (options.minGroundY !== undefined) {
      this.minGroundY = options.minGroundY;
    }
    if (options.clearance !== undefined) {
      this.groundClearance = options.clearance;
    }
    if (this.groundClampEnabled) {
      this.enforceGroundClamp();
    }
  }

  private enforceGroundClamp(): void {
    if (!this.groundClampEnabled) return;

    const minY = this.minGroundY + this.groundClearance;
    const pos = this.activeCamera.position;
    if (pos.y >= minY) return;

    pos.y = minY;

    if (this.mode === CameraMode.FREE) {
      this.camera.position.y = minY;
    } else {
      this.orthographicCamera.position.y = minY;
    }
  }

  /**
   * Handle container resize
   */
  handleResize(width: number, height: number): void {
    const aspect = width / height;
    
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    
    const frustumSize = 35; // Match the constructor value
    this.orthographicCamera.left = -frustumSize * aspect;
    this.orthographicCamera.right = frustumSize * aspect;
    this.orthographicCamera.updateProjectionMatrix();
  }

  /**
   * Get the currently active camera
   */
  getCamera(): THREE.Camera {
    return this.activeCamera;
  }

  /**
   * World-space distance covered by a single screen pixel at the camera focus.
   * A camera-only zoom metric (independent of viewing angle) used to fade detail
   * grids by zoom level. Returns world units per pixel.
   */
  getWorldPerPixel(): number {
    const viewportHeight = Math.max(this.container.clientHeight, 1);
    if (this.activeCamera instanceof THREE.OrthographicCamera) {
      const cam = this.activeCamera;
      const visibleHeight = (cam.top - cam.bottom) / cam.zoom;
      return visibleHeight / viewportHeight;
    }
    const cam = this.activeCamera as THREE.PerspectiveCamera;
    const distance = cam.position.distanceTo(this.controls.target);
    const visibleHeight = 2 * Math.tan((cam.fov * Math.PI) / 360) * distance;
    return visibleHeight / viewportHeight;
  }

  /**
   * Get current camera mode
   */
  getMode(): CameraMode {
    return this.mode;
  }

  /**
   * Set camera mode
   */
  setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    
    const previousMode = this.mode;
    this.mode = mode;
    
    if (mode === CameraMode.FREE) {
      // Switch to perspective camera
      this.activeCamera = this.camera;
      this.controls.object = this.camera;
      this.controls.enabled = true;
      this.controls.enableRotate = true;
    } else {
      // Switch to isometric (orthographic) camera
      this.activeCamera = this.orthographicCamera;
      this.controls.object = this.orthographicCamera;
      this.controls.enabled = true;
      this.controls.enableRotate = false; // Disable free rotation in isometric
      this.controls.screenSpacePanning = true; // Enable panning in isometric
      this.controls.enablePan = true; // Explicitly enable panning
      
      // Animate transition from free mode to isometric
      const shouldAnimate = previousMode === CameraMode.FREE;
      this.applyIsometricAngle(this.isometricAngle, shouldAnimate);
    }
    
    this.notifyStateChange();
  }

  /**
   * Set isometric view angle
   */
  setIsometricAngle(angle: IsometricAngle, animate: boolean = true): void {
    if (this.mode !== CameraMode.ISOMETRIC) {
      this.setMode(CameraMode.ISOMETRIC);
    }
    
    this.applyIsometricAngle(angle, animate);
  }

  /**
   * Rotate isometric view clockwise or counter-clockwise
   */
  rotateIsometric(direction: 'cw' | 'ccw'): void {
    if (this.mode !== CameraMode.ISOMETRIC) return;
    if (this.isTransitioning) return;
    
    const angles = [
      IsometricAngle.NORTH_EAST,
      IsometricAngle.SOUTH_EAST,
      IsometricAngle.SOUTH_WEST,
      IsometricAngle.NORTH_WEST,
    ];
    
    const currentIndex = angles.indexOf(this.isometricAngle);
    const newIndex = direction === 'cw'
      ? (currentIndex + 1) % 4
      : (currentIndex - 1 + 4) % 4;
    
    this.applyIsometricAngle(angles[newIndex], true);
  }

  /**
   * Apply isometric angle
   * Uses arc interpolation for smooth rotation transitions
   */
  private applyIsometricAngle(angle: IsometricAngle, animate: boolean): void {
    this.isometricAngle = angle;
    
    const target = this.controls.target.clone();
    const rad = THREE.MathUtils.degToRad(angle);
    
    const newPosition = new THREE.Vector3(
      target.x + Math.sin(rad) * this.isometricDistance,
      this.isometricHeight,
      target.z + Math.cos(rad) * this.isometricDistance
    );
    
    if (animate && this.mode === CameraMode.ISOMETRIC) {
      // Use arc interpolation for smooth rotation
      this.startTransition(newPosition, target, true);
    } else {
      this.orthographicCamera.position.copy(newPosition);
      this.orthographicCamera.lookAt(target);
    }
    
    this.notifyStateChange();
  }

  /**
   * Start a smooth camera transition
   * @param useArc - If true, interpolates along an arc around the target (for rotations)
   */
  private startTransition(targetPosition: THREE.Vector3, targetLookAt: THREE.Vector3, useArc: boolean = false): void {
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.isArcTransition = useArc;
    
    this.transitionStart = {
      position: this.activeCamera.position.clone(),
      target: this.controls.target.clone(),
    };
    
    this.transitionEnd = {
      position: targetPosition.clone(),
      target: targetLookAt.clone(),
    };
  }

  /**
   * Update transition animation
   */
  private updateTransition(delta: number): void {
    if (!this.transitionStart || !this.transitionEnd) return;
    
    this.transitionProgress += delta / this.transitionDuration;
    
    if (this.transitionProgress >= 1) {
      this.transitionProgress = 1;
      this.isTransitioning = false;
    }
    
    // Use smooth easing - smoother curve with less "bounce"
    const t = this.easeOutQuad(this.transitionProgress);
    
    if (this.isArcTransition) {
      // For rotations: interpolate along an arc around the target
      // This prevents the camera from "cutting through" the scene
      const target = this.transitionEnd.target;
      
      // Get start and end offsets from target
      const startOffset = this.transitionStart.position.clone().sub(this.transitionStart.target);
      const endOffset = this.transitionEnd.position.clone().sub(this.transitionEnd.target);
      
      // Calculate radii and angles
      const startRadius = Math.sqrt(startOffset.x * startOffset.x + startOffset.z * startOffset.z);
      const endRadius = Math.sqrt(endOffset.x * endOffset.x + endOffset.z * endOffset.z);
      const startAngle = Math.atan2(startOffset.x, startOffset.z);
      const endAngle = Math.atan2(endOffset.x, endOffset.z);
      
      // Interpolate angle (handle wraparound)
      let angleDiff = endAngle - startAngle;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const currentAngle = startAngle + angleDiff * t;
      
      // Interpolate radius and height
      const currentRadius = startRadius + (endRadius - startRadius) * t;
      const currentHeight = startOffset.y + (endOffset.y - startOffset.y) * t;
      
      // Calculate new position on arc
      const newPosition = new THREE.Vector3(
        target.x + Math.sin(currentAngle) * currentRadius,
        target.y + currentHeight,
        target.z + Math.cos(currentAngle) * currentRadius
      );
      
      this.activeCamera.position.copy(newPosition);
      
      // Interpolate target
      this.controls.target.lerpVectors(
        this.transitionStart.target,
        this.transitionEnd.target,
        t
      );
    } else {
      // Standard linear interpolation for non-rotation transitions
      this.activeCamera.position.lerpVectors(
        this.transitionStart.position,
        this.transitionEnd.position,
        t
      );
      
      // Interpolate target
      this.controls.target.lerpVectors(
        this.transitionStart.target,
        this.transitionEnd.target,
        t
      );
    }
    
    this.activeCamera.lookAt(this.controls.target);
    
    this.enforceGroundClamp();

    if (!this.isTransitioning) {
      this.transitionStart = null;
      this.transitionEnd = null;
      this.isArcTransition = false;
    }
  }

  /**
   * Quadratic ease-out - smooth deceleration without bounce
   * Starts fast and slows down smoothly at the end
   */
  private easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }


  /**
   * Zoom camera
   */
  zoom(factor: number): void {
    if (this.mode === CameraMode.FREE) {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      this.camera.position.addScaledVector(direction, factor);
      this.enforceGroundClamp();
    } else {
      // Adjust orthographic zoom
      const frustumSize = 50 / factor;
      const aspect = this.container.clientWidth / this.container.clientHeight;
      this.orthographicCamera.left = -frustumSize * aspect;
      this.orthographicCamera.right = frustumSize * aspect;
      this.orthographicCamera.top = frustumSize;
      this.orthographicCamera.bottom = -frustumSize;
      this.orthographicCamera.updateProjectionMatrix();
    }
  }

  /**
   * Focus on a specific point
   */
  focusOn(target: THREE.Vector3, animate: boolean = true): void {
    const offset = this.activeCamera.position.clone().sub(this.controls.target);
    const newPosition = target.clone().add(offset);
    
    if (animate) {
      this.startTransition(newPosition, target);
    } else {
      this.activeCamera.position.copy(newPosition);
      this.controls.target.copy(target);
    }
  }
  
  /**
   * Focus on a specific point with a specific camera position
   * Allows precise control over both where to look and where to position the camera
   */
  focusOnWithDistance(target: THREE.Vector3, cameraPosition: THREE.Vector3, animate: boolean = true): void {
    if (animate) {
      this.startTransition(cameraPosition, target);
    } else {
      this.activeCamera.position.copy(cameraPosition);
      this.controls.target.copy(target);
      this.activeCamera.lookAt(target);
    }
  }
  
  /**
   * Orbit the camera 90 degrees around the current target point
   * Works in any camera mode (FREE or ISOMETRIC)
   * Uses arc interpolation for smooth, natural rotation
   * @param direction - 'cw' (clockwise) or 'ccw' (counter-clockwise)
   */
  orbit90Degrees(direction: 'cw' | 'ccw'): void {
    if (this.isTransitioning) return;
    
    const target = this.controls.target.clone();
    const currentPos = this.activeCamera.position.clone();
    
    // Calculate the offset from target to camera
    const offset = currentPos.sub(target);
    
    // Rotate the offset by 90 degrees around the Y axis
    const angle = direction === 'cw' ? -Math.PI / 2 : Math.PI / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    const newOffset = new THREE.Vector3(
      offset.x * cos - offset.z * sin,
      offset.y, // Keep Y the same (height)
      offset.x * sin + offset.z * cos
    );
    
    // Calculate new camera position
    const newPosition = target.clone().add(newOffset);
    
    // Use arc interpolation for smooth rotation without cutting through scene
    this.startTransition(newPosition, target, true);
    
    this.notifyStateChange();
  }

  /**
   * Frame all content in view by adjusting camera distance based on scene bounds
   * Call this when switching to isometric or when wanting to see all content
   * @param sceneBounds - Bounding box containing all scene content
   * @param animate - Whether to animate the transition
   * @param style - `aerial` uses a higher oblique vantage for imported layouts in free mode
   */
  frameAllContent(
    sceneBounds: THREE.Box3,
    animate: boolean = true,
    style: 'default' | 'aerial' = 'default'
  ): void {
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    sceneBounds.getCenter(center);
    sceneBounds.getSize(size);
    
    // Calculate the maximum dimension needed
    const maxDim = Math.max(size.x, size.y, size.z);
    
    // If scene is empty or very small, use defaults
    if (maxDim < 1) {
      this.isometricDistance = this.baseIsometricDistance;
      this.isometricHeight = this.baseIsometricHeight;
    } else {
      // Adjust distance to fit content with tighter framing (0.9x multiplier)
      // This makes the content fill more of the view for a better initial frame
      this.isometricDistance = Math.max(this.baseIsometricDistance * 0.6, maxDim * 0.9);
      this.isometricHeight = Math.max(this.baseIsometricHeight * 0.6, maxDim * 0.35);
    }
    
    // Update target to scene center
    this.controls.target.copy(center);
    
    // Apply the new view
    if (this.mode === CameraMode.ISOMETRIC) {
      this.applyIsometricAngle(this.isometricAngle, animate);
    } else {
      // For free mode, move camera to frame content
      const rad = THREE.MathUtils.degToRad(225); // Oblique NE/SW aerial
      const horizontalDist =
        style === 'aerial'
          ? Math.max(this.baseIsometricDistance * 0.5, maxDim * 0.95)
          : this.isometricDistance;
      const height =
        style === 'aerial'
          ? Math.max(this.baseIsometricHeight * 0.75, maxDim * 0.55)
          : this.isometricHeight;
      const newPosition = new THREE.Vector3(
        center.x + Math.sin(rad) * horizontalDist,
        center.y + height,
        center.z + Math.cos(rad) * horizontalDist
      );
      
      if (animate) {
        this.startTransition(newPosition, center);
      } else {
        this.camera.position.copy(newPosition);
        this.camera.lookAt(center);
      }
    }
  }

  /**
   * Snapshot the live camera (including recent orbit/pan input).
   */
  getCurrentCameraState(): CameraState {
    let zoom = 1;
    if (this.mode === CameraMode.ISOMETRIC) {
      const frustumHalfHeight = this.orthographicCamera.top;
      if (frustumHalfHeight > 0) {
        zoom = CameraController.BASE_ORTHO_FRUSTUM / frustumHalfHeight;
      }
    }

    return {
      mode: this.mode,
      isometricAngle: this.isometricAngle,
      position: this.activeCamera.position.clone(),
      target: this.controls.target.clone(),
      zoom,
    };
  }

  private syncIsometricOrbitFromPosition(
    position: THREE.Vector3,
    target: THREE.Vector3
  ): void {
    const offset = position.clone().sub(target);
    this.isometricHeight = offset.y;
    this.isometricDistance = Math.max(Math.hypot(offset.x, offset.z), 1);
  }

  private applyOrthographicZoom(zoom: number): void {
    const safeZoom = Math.max(zoom, 0.05);
    const frustumSize = CameraController.BASE_ORTHO_FRUSTUM / safeZoom;
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.orthographicCamera.left = -frustumSize * aspect;
    this.orthographicCamera.right = frustumSize * aspect;
    this.orthographicCamera.top = frustumSize;
    this.orthographicCamera.bottom = -frustumSize;
    this.orthographicCamera.updateProjectionMatrix();
  }

  /**
   * Apply a saved camera snapshot (from facility data or default view).
   */
  applySavedState(saved: SerializedCameraState, animate: boolean = true): void {
    const target = new THREE.Vector3(saved.target.x, saved.target.y, saved.target.z);
    const position = new THREE.Vector3(saved.position.x, saved.position.y, saved.position.z);

    this.isometricAngle = saved.isometricAngle as IsometricAngle;
    this.mode = saved.mode;

    if (saved.mode === CameraMode.FREE) {
      this.activeCamera = this.camera;
      this.controls.object = this.camera;
      this.controls.enabled = true;
      this.controls.enableRotate = true;
      this.controls.enablePan = true;
      this.controls.screenSpacePanning = true;
    } else {
      this.activeCamera = this.orthographicCamera;
      this.controls.object = this.orthographicCamera;
      this.controls.enabled = true;
      this.controls.enableRotate = false;
      this.controls.enablePan = true;
      this.controls.screenSpacePanning = true;
    }

    if (animate) {
      this.startTransition(position, target);
    } else {
      this.activeCamera.position.copy(position);
      this.controls.target.copy(target);
      this.activeCamera.lookAt(target);
      if (saved.mode === CameraMode.FREE) {
        this.camera.position.copy(position);
      } else {
        this.orthographicCamera.position.copy(position);
      }
    }

    if (saved.mode === CameraMode.ISOMETRIC) {
      this.syncIsometricOrbitFromPosition(position, target);
      this.applyOrthographicZoom(saved.zoom || 1);
    }

    this.notifyStateChange();
  }

  /**
   * Reset camera to initial position
   */
  reset(): void {
    const target = new THREE.Vector3(0, 0, 0);
    const position = new THREE.Vector3(30, 30, 30);
    
    this.startTransition(position, target);
  }

  /**
   * Notify state change
   */
  private notifyStateChange(): void {
    this.onStateChange({
      mode: this.mode,
      isometricAngle: this.isometricAngle,
      position: this.activeCamera.position.clone(),
      target: this.controls.target.clone(),
      zoom: 1,
    });
  }

  /**
   * Set whether rotation is allowed (for placement/selection mode with Ctrl)
   * When in placement/selection mode, rotation is only allowed when Ctrl is held
   */
  setRotationEnabled(enabled: boolean): void {
    // Only affect free mode - isometric never has rotation
    if (this.mode === CameraMode.FREE) {
      this.controls.enableRotate = enabled;
      
      // Swap mouse button behavior based on rotation state
      // When rotation is disabled (placement/selection mode default):
      //   LEFT = NONE (free for selection/placement handlers)
      //   RIGHT = pan, MIDDLE = zoom
      //   Ctrl+drag enables rotation via setRotationEnabled(true)
      // When rotation is enabled (Ctrl held):
      //   LEFT = rotate, RIGHT = pan, MIDDLE = zoom
      if (enabled) {
        // Rotation enabled: LEFT rotates (Ctrl is held)
        this.controls.mouseButtons = {
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      } else {
        // Rotation disabled: LEFT does nothing (let selection/placement handle it)
        // Use RIGHT for pan only, MIDDLE for zoom
        this.controls.mouseButtons = {
          LEFT: null as unknown as THREE.MOUSE,  // Disable left button
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        };
      }
    }
  }

  /**
   * Get current rotation enabled state
   */
  isRotationEnabled(): boolean {
    return this.controls.enableRotate;
  }

  /**
   * Temporarily disable all camera controls (for gizmo interaction)
   */
  setControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  /**
   * Check if controls are enabled
   */
  areControlsEnabled(): boolean {
    return this.controls.enabled;
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    window.removeEventListener('blur', this.boundClearWalkKeys);
    this.clearWalkKeys();
    this.controls.dispose();
  }
}


