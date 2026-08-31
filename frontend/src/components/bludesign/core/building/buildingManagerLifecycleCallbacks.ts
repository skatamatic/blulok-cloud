import type * as THREE from 'three';
import type { Building, BuildingWall } from '../types';
import type { Theme } from '../ThemeManager';
import type { BuildingManagerCallbacks } from '../BuildingManager';

/**
 * Engine wiring: building CRUD / merge events update React-facing state and refresh scene theme.
 */
export function createBuildingManagerLifecycleCallbacks(ctx: {
  state: { buildings: Building[]; isFloorMode: boolean; activeFloor: number };
  applyThemeToScene: (theme: Theme) => void;
  getActiveSkinTheme: () => Theme;
  floorManager: { clear(): void };
  selectionManager: { setFloorMode(isFloorMode: boolean, activeFloor: number): void };
  gridSystem: { setGridY(y: number): void };
  emitStateUpdated: () => void;
}): BuildingManagerCallbacks {
  return {
    onBuildingCreated: (building: Building) => {
      ctx.state.buildings.push(building);
      ctx.emitStateUpdated();
      ctx.applyThemeToScene(ctx.getActiveSkinTheme());
    },
    onBuildingsMerged: (oldIds: string[], newBuilding: Building) => {
      ctx.state.buildings = ctx.state.buildings.filter((b) => !oldIds.includes(b.id));
      ctx.state.buildings.push(newBuilding);
      ctx.emitStateUpdated();
      ctx.applyThemeToScene(ctx.getActiveSkinTheme());
    },
    onBuildingDeleted: (buildingId: string) => {
      ctx.state.buildings = ctx.state.buildings.filter((b) => b.id !== buildingId);
      if (ctx.state.buildings.length === 0) {
        ctx.state.isFloorMode = false;
        ctx.state.activeFloor = 0;
        ctx.floorManager.clear();
        ctx.selectionManager.setFloorMode(false, 0);
        ctx.gridSystem.setGridY(0);
      }
      ctx.emitStateUpdated();
    },
    onBuildingModified: (building: Building) => {
      const idx = ctx.state.buildings.findIndex((b) => b.id === building.id);
      if (idx >= 0) {
        ctx.state.buildings[idx] = building;
      }
      ctx.emitStateUpdated();
    },
    onWallCreated: (_wall: BuildingWall, _mesh: THREE.Object3D) => {},
    onFloorTileCreated: (_floorTileId: string, _mesh: THREE.Object3D) => {},
  };
}
