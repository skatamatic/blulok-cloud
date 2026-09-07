/**
 * Grid alignment: world ↔ working-frame indices and occupancy helpers.
 */

import * as THREE from 'three';
import { GridSystem } from '../../../components/bludesign/core/GridSystem';
import { GridSize } from '../../../components/bludesign/core/types';

/** Jest `toBe` uses Object.is; normalize -0 so integer grid indices compare cleanly */
function gridIndex(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

describe('GridSystem alignment', () => {
  const scene = new THREE.Scene();

  it('round-trips grid indices through world when alignment is null', () => {
    const grid = new GridSystem(scene);
    grid.setGridSize(GridSize.TINY);

    for (let ix = -3; ix <= 3; ix++) {
      for (let iz = -3; iz <= 3; iz++) {
        const w = grid.gridToWorld({ x: ix, z: iz, y: 0 });
        const back = grid.worldToGrid(w);
        expect(gridIndex(back.x)).toBe(ix);
        expect(gridIndex(back.z)).toBe(iz);
      }
    }
  });

  it('round-trips cell corners when a yawed alignment is active', () => {
    const grid = new GridSystem(scene);
    grid.setGridSize(GridSize.TINY);
    grid.setGridAlignment({
      yaw: Math.PI / 7,
      originX: 1.37,
      originZ: -0.82,
    });

    for (let ix = -4; ix <= 4; ix++) {
      for (let iz = -4; iz <= 4; iz++) {
        const w = grid.gridToWorld({ x: ix, z: iz, y: 0 });
        const back = grid.worldToGrid(w);
        expect(gridIndex(back.x)).toBe(ix);
        expect(gridIndex(back.z)).toBe(iz);
      }
    }
  });

  it('getFootprintCenterWorld matches fractional gridToWorld for footprint center', () => {
    const grid = new GridSystem(scene);
    grid.setGridSize(GridSize.TINY);
    grid.setGridAlignment({ yaw: Math.PI / 6, originX: 2, originZ: -1 });

    const anchor = { x: 1, z: 2, y: 0 };
    const c1 = grid.getFootprintCenterWorld(anchor, { x: 2, z: 3 });
    const c2 = grid.gridToWorld({ x: 2, z: 3.5, y: 0 });
    expect(c1.x).toBeCloseTo(c2.x, 6);
    expect(c1.z).toBeCloseTo(c2.z, 6);
  });

  it('collectWorldCellsCoveringAlignedFootprint uses one world cell per aligned cell for 1×1', () => {
    const grid = new GridSystem(scene);
    grid.setGridSize(GridSize.TINY);
    grid.setGridAlignment({ yaw: Math.PI / 4, originX: 0, originZ: 0 });

    const cells = grid.collectWorldCellsCoveringAlignedFootprint({ x: 0, z: 0, y: 0 }, { x: 1, z: 1 });
    expect(cells.length).toBe(1);
  });
});
