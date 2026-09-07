export * from './ScenePresets';
export { SkyManager } from './SkyManager';
export { GroundPlaneManager } from './GroundPlaneManager';
export { SceneryManager } from './SceneryManager';
export { computeWoodlandTreePlacements, CANADIAN_WOODLAND_TREE_IDS } from './woodlandTreePlacements';
export { computeUrbanSceneryPlacements } from './urbanPlacements';
export { sampleWoodlandTerrainHeight, hillSeedVec2, sampleWoodlandDensity, WOODLAND_HILL_AMPLITUDE, WOODLAND_HILL_NOISE_SCALE } from './woodlandTerrain';
export { LocalTerrainManager } from './LocalTerrainManager';
export type { LocalTerrainAssets } from './LocalTerrainManager';
export {
  fetchTerrainSidecarAssets,
  revokeTerrainSidecarAssets,
  applyStoredTerrainToEngine,
} from './terrainSidecarLoader';
export type { TerrainSidecarAssets } from './terrainSidecarLoader';
