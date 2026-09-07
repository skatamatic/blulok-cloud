/**
 * Resolves {@link BuildingMaterials} from a scene {@link Theme} (built-in skins + registry lookup).
 * Pure aside from the injected `getSkin` callback.
 */

import type { Theme } from '../ThemeManager';
import type { CategorySkin } from '../SkinRegistry';
import { AssetCategory, BuildingSkinType, type BuildingMaterials } from '../types';

export function getBuildingMaterialsFromTheme(
  theme: Theme,
  getSkin: (skinId: string) => CategorySkin | undefined
): BuildingMaterials {
  if (theme.buildingSkinId) {
    const skin = getSkin(theme.buildingSkinId);
    if (skin && skin.category === AssetCategory.BUILDING) {
      const wallMat = skin.partMaterials['wall'];
      const floorMat = skin.partMaterials['floor'];
      const roofMat = skin.partMaterials['roof'];
      return {
        wall: wallMat,
        floor: floorMat,
        roof: roofMat,
      } as BuildingMaterials;
    }
  }

  switch (theme.buildingSkin) {
    case BuildingSkinType.GLASS:
      return {
        wall: {
          color: '#b4d4e8',
          metalness: 0.1,
          roughness: 0.05,
          transparent: true,
          opacity: 0.35,
        },
        roof: {
          color: '#c4e4f8',
          metalness: 0.1,
          roughness: 0.1,
          transparent: true,
          opacity: 0.4,
        },
        floor: {
          color: '#c8c8c8',
          metalness: 0.1,
          roughness: 0.6,
        },
      };

    case BuildingSkinType.BRICK:
      return {
        wall: {
          color: '#a85e4d',
          metalness: 0.0,
          roughness: 0.9,
        },
        roof: {
          color: '#5a4a3a',
          metalness: 0.05,
          roughness: 0.85,
        },
        floor: {
          color: '#808080',
          metalness: 0.05,
          roughness: 0.8,
        },
      };

    case BuildingSkinType.CONCRETE:
      return {
        wall: {
          color: '#9a9a9a',
          metalness: 0.05,
          roughness: 0.85,
        },
        roof: {
          color: '#7a7a7a',
          metalness: 0.1,
          roughness: 0.8,
        },
        floor: {
          color: '#888888',
          metalness: 0.1,
          roughness: 0.75,
        },
      };

    case BuildingSkinType.METAL:
      return {
        wall: {
          color: '#6a7a8a',
          metalness: 0.7,
          roughness: 0.4,
        },
        roof: {
          color: '#5a6a7a',
          metalness: 0.75,
          roughness: 0.35,
        },
        floor: {
          color: '#707070',
          metalness: 0.3,
          roughness: 0.6,
        },
      };

    case BuildingSkinType.DEFAULT:
    default:
      return {
        wall: {
          color: '#e8e4dc',
          metalness: 0.0,
          roughness: 0.7,
        },
        roof: {
          color: '#5a5552',
          metalness: 0.1,
          roughness: 0.8,
        },
        floor: {
          color: '#909090',
          metalness: 0.05,
          roughness: 0.85,
        },
      };
  }
}

/**
 * Whether a building skin id uses glass-like transparency (for ghosting / materials).
 */
export function isGlassBuildingSkinId(
  skinId: string,
  getSkin: (id: string) => CategorySkin | undefined
): boolean {
  const skin = getSkin(skinId);
  if (!skin || skin.category !== AssetCategory.BUILDING) return false;
  const wall = skin.partMaterials['wall'];
  return !!(wall?.transparent || wall?.shader === 'paned-glass' || wall?.shader === 'glass-floor' || wall?.shader === 'glass-roof');
}
