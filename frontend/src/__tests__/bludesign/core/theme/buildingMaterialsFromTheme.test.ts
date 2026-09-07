/**
 * Building material resolution from Theme + skin registry callback.
 */

import {
  getBuildingMaterialsFromTheme,
  isGlassBuildingSkinId,
} from '../../../../components/bludesign/core/theme/buildingMaterialsFromTheme';
import type { Theme } from '../../../../components/bludesign/core/ThemeManager';
import type { CategorySkin } from '../../../../components/bludesign/core/SkinRegistry';
import { AssetCategory, BuildingSkinType } from '../../../../components/bludesign/core/types';

function theme(overrides: Partial<Theme> = {}): Theme {
  return {
    id: 'tid',
    name: 'T',
    description: '',
    categorySkins: {},
    buildingSkin: BuildingSkinType.DEFAULT,
    environment: {
      grass: { color: '#111', metalness: 0, roughness: 1 },
      pavement: { color: '#222', metalness: 0, roughness: 1 },
      gravel: { color: '#333', metalness: 0, roughness: 1 },
    },
    isBuiltin: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('getBuildingMaterialsFromTheme', () => {
  it('uses custom building skin id when category is BUILDING', () => {
    const buildingSkin: CategorySkin = {
      id: 'skin-b',
      name: 'B',
      category: AssetCategory.BUILDING,
      partMaterials: {
        wall: { color: '#aaa', metalness: 0, roughness: 1 },
        floor: { color: '#bbb', metalness: 0, roughness: 1 },
        roof: { color: '#ccc', metalness: 0, roughness: 1 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const getSkin = jest.fn((id: string) => (id === 'skin-b' ? buildingSkin : undefined));
    const m = getBuildingMaterialsFromTheme(
      theme({ buildingSkinId: 'skin-b', buildingSkin: BuildingSkinType.BRICK }),
      getSkin
    );
    expect(m.wall).toEqual(buildingSkin.partMaterials.wall);
    expect(getSkin).toHaveBeenCalledWith('skin-b');
  });

  it('falls back to buildingSkin switch when id points at non-BUILDING skin', () => {
    const wrong: CategorySkin = {
      id: 'wrong',
      name: 'W',
      category: AssetCategory.DOOR,
      partMaterials: {},
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const m = getBuildingMaterialsFromTheme(
      theme({ buildingSkinId: 'wrong', buildingSkin: BuildingSkinType.GLASS }),
      () => wrong
    );
    expect(m.wall).toMatchObject({ transparent: true });
  });

  it.each([
    [BuildingSkinType.GLASS, '#b4d4e8'],
    [BuildingSkinType.BRICK, '#a85e4d'],
    [BuildingSkinType.CONCRETE, '#9a9a9a'],
    [BuildingSkinType.METAL, '#6a7a8a'],
    [BuildingSkinType.DEFAULT, '#e8e4dc'],
  ] as const)('uses preset wall color for %s', (skin, wallColor) => {
    const m = getBuildingMaterialsFromTheme(theme({ buildingSkin: skin }), () => undefined);
    expect((m.wall as { color: string }).color).toBe(wallColor);
  });

  it('uses default preset when buildingSkin is an unexpected enum value', () => {
    const m = getBuildingMaterialsFromTheme(
      theme({ buildingSkin: 999 as unknown as BuildingSkinType }),
      () => undefined
    );
    expect((m.wall as { color: string }).color).toBe('#e8e4dc');
  });
});

describe('isGlassBuildingSkinId', () => {
  it('returns false when skin missing or not BUILDING', () => {
    expect(isGlassBuildingSkinId('x', () => undefined)).toBe(false);
    const door: CategorySkin = {
      id: 'd',
      name: 'D',
      category: AssetCategory.DOOR,
      partMaterials: { wall: { color: '#fff', transparent: true, metalness: 0, roughness: 1 } },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(isGlassBuildingSkinId('d', () => door)).toBe(false);
  });

  it('returns true when wall is transparent', () => {
    const skin: CategorySkin = {
      id: 'g',
      name: 'G',
      category: AssetCategory.BUILDING,
      partMaterials: {
        wall: { color: '#fff', transparent: true, metalness: 0, roughness: 1 },
        floor: { color: '#000', metalness: 0, roughness: 1 },
        roof: { color: '#000', metalness: 0, roughness: 1 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(isGlassBuildingSkinId('g', () => skin)).toBe(true);
  });

  it('returns true for glass shaders on wall', () => {
    const skin: CategorySkin = {
      id: 'g',
      name: 'G',
      category: AssetCategory.BUILDING,
      partMaterials: {
        wall: { color: '#fff', metalness: 0, roughness: 1, shader: 'paned-glass' },
        floor: { color: '#000', metalness: 0, roughness: 1 },
        roof: { color: '#000', metalness: 0, roughness: 1 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(isGlassBuildingSkinId('g', () => skin)).toBe(true);
  });

  it.each(['glass-floor', 'glass-roof'] as const)('returns true for shader %s', (shader) => {
    const skin: CategorySkin = {
      id: 'g',
      name: 'G',
      category: AssetCategory.BUILDING,
      partMaterials: {
        wall: { color: '#fff', metalness: 0, roughness: 1, shader },
        floor: { color: '#000', metalness: 0, roughness: 1 },
        roof: { color: '#000', metalness: 0, roughness: 1 },
      },
      isBuiltin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(isGlassBuildingSkinId('g', () => skin)).toBe(true);
  });
});
