/**
 * Coordinates active floor changes and full-building vs per-floor editing view.
 * Side effects are injected via {@link FloorViewCoordinatorApi}.
 */

export interface FloorViewCoordinatorApi {
  getActiveFloor(): number;
  setActiveFloorLevel(level: number): void;
  getIsFloorMode(): boolean;
  setIsFloorMode(isFloorMode: boolean): void;
  /** FloorManager#setFloor — grid Y, ghosting prep */
  floorManagerSetFloor(level: number): void;
  /** Full-building view when not in per-floor mode */
  floorManagerSetFullBuildingView(fullBuildingViewActive: boolean): void;
  selectionSetFloorMode(isFloorMode: boolean, activeFloor: number): void;
  /** When the numeric floor index changes (e.g. clear rotated working grid) */
  onActiveFloorIndexChanged(previous: number, next: number): void;
  /** Placement ghost height + floor index */
  syncPlacementToFloor(level: number): void;
  /** SceneManager#applyFloorGhosting(currentFloor, isFullBuildingView) — second arg is !isFloorMode */
  applySceneFloorGhosting(activeFloor: number, isFullBuildingView: boolean): void;
  emitStateUpdated(): void;
}

export class FloorViewCoordinator {
  constructor(private readonly api: FloorViewCoordinatorApi) {}

  /**
   * Switch the editor to a floor level (grid, placement, ghosting).
   */
  setActiveFloor(level: number): void {
    const previous = this.api.getActiveFloor();
    this.api.setActiveFloorLevel(level);
    this.api.floorManagerSetFloor(level);
    this.api.selectionSetFloorMode(this.api.getIsFloorMode(), level);

    if (level !== previous) {
      this.api.onActiveFloorIndexChanged(previous, level);
    }

    this.api.syncPlacementToFloor(level);
    this.api.applySceneFloorGhosting(level, !this.api.getIsFloorMode());
    this.api.emitStateUpdated();
  }

  /**
   * Toggle between per-floor editing and full-building view.
   */
  toggleFullBuildingView(): void {
    const nextFloorMode = !this.api.getIsFloorMode();
    this.api.setIsFloorMode(nextFloorMode);

    if (!nextFloorMode) {
      this.api.setActiveFloorLevel(0);
    }

    this.api.floorManagerSetFullBuildingView(!nextFloorMode);
    this.api.selectionSetFloorMode(nextFloorMode, this.api.getActiveFloor());
    this.api.applySceneFloorGhosting(this.api.getActiveFloor(), !nextFloorMode);
    this.api.emitStateUpdated();
  }
}
