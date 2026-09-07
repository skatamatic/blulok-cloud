import {
  buildingPreviewGizmoGridCenter,
  computeBuildingMovePreviewCells,
  mergedTranslatedFootprintBounds,
} from '../../../../components/bludesign/core/manipulation/buildingMovePreviewGeometry';

describe('buildingMovePreviewGeometry', () => {
  const fp = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };

  describe('computeBuildingMovePreviewCells', () => {
    it('lists every integer cell inside translated footprints', () => {
      const cells = computeBuildingMovePreviewCells([fp], 2, -1);
      expect(cells).toEqual(
        expect.arrayContaining([
          { x: 2, z: -1 },
          { x: 2, z: 0 },
          { x: 3, z: -1 },
          { x: 3, z: 0 },
        ])
      );
      expect(cells).toHaveLength(4);
    });

    it('returns empty array when footprints is empty', () => {
      expect(computeBuildingMovePreviewCells([], 1, 1)).toEqual([]);
    });

    it('merges multiple footprints', () => {
      const a = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
      const b = { minX: 2, maxX: 2, minZ: 0, maxZ: 0 };
      const cells = computeBuildingMovePreviewCells([a, b], 0, 0);
      expect(cells).toEqual(expect.arrayContaining([{ x: 0, z: 0 }, { x: 2, z: 0 }]));
      expect(cells).toHaveLength(2);
    });
  });

  describe('mergedTranslatedFootprintBounds', () => {
    it('returns null for empty footprints', () => {
      expect(mergedTranslatedFootprintBounds([], 1, 1)).toBeNull();
    });

    it('expands union bounds after delta', () => {
      expect(
        mergedTranslatedFootprintBounds(
          [
            { minX: 0, maxX: 1, minZ: 0, maxZ: 0 },
            { minX: 5, maxX: 6, minZ: 2, maxZ: 3 },
          ],
          1,
          -1
        )
      ).toEqual({ minX: 1, maxX: 7, minZ: -1, maxZ: 2 });
    });
  });

  describe('buildingPreviewGizmoGridCenter', () => {
    it('returns null when no footprints', () => {
      expect(buildingPreviewGizmoGridCenter([], 0, 0)).toBeNull();
    });

    it('uses floor of centroid in grid space plus delta', () => {
      expect(buildingPreviewGizmoGridCenter([fp], 3, 4)).toEqual({ x: 3, z: 4 });
    });
  });
});
