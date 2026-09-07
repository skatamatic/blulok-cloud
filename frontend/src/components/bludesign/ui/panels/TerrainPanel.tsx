/**
 * Editor terrain setup panel — fetch satellite + elevation and align mesh to facility.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowPathIcon,
  MapPinIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
  ViewfinderCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import type { BluDesignEngine } from '../../core/BluDesignEngine';
import {
  buildTerrainConfigFromFetch,
  DEFAULT_TERRAIN_DETAIL_LEVEL,
  normalizeTerrainDetailLevel,
  TERRAIN_DETAIL_LEVEL_OPTIONS,
  type TerrainConfig,
  type TerrainDetailLevel,
  type TerrainTransform,
} from '../../core/environment/terrainConfigMetadata';
import {
  fetchTerrainSidecarAssets,
  forgetRetainedTerrainSidecars,
  revokeTerrainSidecarAssets,
} from '../../core/environment/terrainSidecarLoader';
import type { FetchSiteTerrainResponse } from '@/api/bludesign';
import * as bludesignApi from '@/api/bludesign';
import { generateUuid } from '@/utils/uuid.utils';

type FetchMeta = FetchSiteTerrainResponse['meta'];

/** Reconstruct preview metadata from a persisted terrain config (for restore). */
function fetchMetaFromConfig(config: TerrainConfig): FetchMeta {
  return {
    width: config.meshWidth,
    height: config.meshHeight,
    minM: config.heightMinM,
    maxM: config.heightMaxM,
    imageryZoom: config.imageryZoom,
    elevationZoom: config.elevationZoom,
    imageryMetersPerPixel: config.imageryMetersPerPixel,
    bounds: config.bounds,
    providers: config.providers,
    attribution: config.attribution,
    worldSizeMeters: config.worldSizeMeters,
  };
}

export interface PendingTerrainAssets {
  imagery: Blob;
  heightmap: Blob;
}

export interface TerrainPanelProps {
  engine: BluDesignEngine;
  facilityId?: string | null;
  setupActive: boolean;
  onSetupActiveChange: (active: boolean) => void;
  onPendingAssets: (assets: PendingTerrainAssets | null) => void;
  onTerrainApplied?: () => void;
  onTerrainDeleted?: () => void;
  width?: number;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Decode RG8 heightmap PNG into a grayscale preview image URL. */
async function createElevationPreviewUrl(heightmapBlob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(heightmapBlob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas unavailable for elevation preview');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const normalized = (pixels[i] * 256 + pixels[i + 1]) / 65535;
    const shade = Math.round(normalized * 255);
    pixels[i] = shade;
    pixels[i + 1] = shade;
    pixels[i + 2] = shade;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to encode elevation preview'));
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

function TerrainAssetPreviewCard({
  title,
  subtitle,
  imageUrl,
  fileSize,
  isDark,
}: {
  title: string;
  subtitle: string;
  imageUrl: string;
  fileSize?: number;
  isDark: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border ${
        isDark ? 'border-gray-700 bg-gray-900/60' : 'border-gray-200 bg-white'
      }`}
    >
      <div
        className={`relative aspect-square w-full overflow-hidden ${
          isDark ? 'bg-gray-950' : 'bg-gray-100'
        }`}
      >
        <img
          src={imageUrl}
          alt={`${title} preview`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
      <div className="space-y-0.5 p-2">
        <p className={`text-xs font-semibold ${isDark ? 'text-gray-200' : 'text-gray-800'}`}>
          {title}
        </p>
        <p className={`text-[10px] leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {subtitle}
        </p>
        {fileSize !== undefined && (
          <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {formatBytes(fileSize)}
          </p>
        )}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  isDark,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  isDark: boolean;
}) {
  return (
    <label className="block space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{label}</span>
        <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#147FD4]"
      />
    </label>
  );
}

export const TerrainPanel: React.FC<TerrainPanelProps> = ({
  engine,
  facilityId,
  setupActive,
  onSetupActiveChange,
  onPendingAssets,
  onTerrainApplied,
  onTerrainDeleted,
  width = 320,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  // Re-evaluated each render so the restore effect re-runs once the engine's
  // terrain config becomes available after a load/draft-recovery.
  const terrainConfigPresent = !!engine.getTerrainConfig();
  const terrainDataId = engine.getTerrainConfig()?.terrainDataId ?? null;

  const [lat, setLat] = useState(49.45607);
  const [lng, setLng] = useState(-119.60714);
  const [detailLevel, setDetailLevel] = useState<TerrainDetailLevel>(DEFAULT_TERRAIN_DETAIL_LEVEL);
  const [radiusMeters, setRadiusMeters] = useState(400);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<{ imagery: string; heightmap: string } | null>(
    null
  );
  const [elevationPreviewUrl, setElevationPreviewUrl] = useState<string | null>(null);
  const [fetchMeta, setFetchMeta] = useState<FetchMeta | null>(null);
  const [transform, setTransform] = useState<TerrainTransform>({
    offset: { x: 0, y: 0, z: 0 },
    scale: 1,
    rotationDeg: 0,
    elevationAmplitude: 1,
    baseOpacity: 1,
  });
  const [draftConfig, setDraftConfig] = useState<TerrainConfig | null>(null);
  const [pendingBlobs, setPendingBlobs] = useState<PendingTerrainAssets | null>(null);
  const [terrainVisible, setTerrainVisible] = useState(true);
  const [showRefetchConfirm, setShowRefetchConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sidecarStatus, setSidecarStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [sidecarError, setSidecarError] = useState<string | null>(null);
  const [sidecarRetryNonce, setSidecarRetryNonce] = useState(0);
  const hydratedKeyRef = useRef<string | null>(null);
  const [sidecarsLoadedTick, setSidecarsLoadedTick] = useState(0);

  // Re-run hydration when the persisted terrain sidecars finish loading.
  useEffect(() => {
    return engine.on('terrain-sidecars-loaded', () => setSidecarsLoadedTick((n) => n + 1));
  }, [engine]);

  const resetTerrainPanelState = useCallback(() => {
    hydratedKeyRef.current = null;
    setPreviewUrls((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev.imagery);
        URL.revokeObjectURL(prev.heightmap);
      }
      return null;
    });
    setElevationPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setDraftConfig(null);
    setPendingBlobs(null);
    setFetchMeta(null);
    setAttribution(null);
    setTerrainVisible(true);
    setFetchError(null);
    setSidecarStatus('idle');
    setSidecarError(null);
    onSetupActiveChange(false);
    onPendingAssets(null);
  }, [onSetupActiveChange, onPendingAssets]);

  // Drop stale preview state when switching facilities; engine load will rehydrate if terrain exists.
  useEffect(() => {
    resetTerrainPanelState();
  }, [facilityId, resetTerrainPanelState]);

  // Reset panel UI when terrain is fully cleared (new facility, facility without terrain).
  useEffect(() => {
    return engine.on('terrain-cleared', resetTerrainPanelState);
  }, [engine, resetTerrainPanelState]);

  // Hydrate the original fetch coordinates, radius, and alignment from a
  // persisted/restored terrain config. Runs independently of the sidecar
  // images so the inputs are correct even if the imagery/heightmap are missing.
  useEffect(() => {
    const config = engine.getTerrainConfig();
    if (!config?.center) return;

    setLat(config.center.lat);
    setLng(config.center.lng);
    setRadiusMeters(config.radiusMeters);
    setDetailLevel(normalizeTerrainDetailLevel(config.detailLevel));
    setTransform({
      offset: { ...config.offset },
      scale: config.scale,
      rotationDeg: config.rotationDeg,
      elevationAmplitude: config.elevationAmplitude,
      baseOpacity: config.baseOpacity,
    });
  }, [engine, terrainDataId, terrainConfigPresent]);

  // Restore the imagery/heightmap sidecars so the saved terrain is fully
  // editable (preview cards + Apply) after a reload or draft recovery.
  useEffect(() => {
    const config = engine.getTerrainConfig();
    const effectiveTerrainDataId = config?.terrainDataId || facilityId || '';
    if (!config?.center || !effectiveTerrainDataId) return;

    const key = `${effectiveTerrainDataId}:${config.fetchedAt}`;
    const loaded = engine.getLoadedTerrainSidecars();
    const canUseLoadedSidecars =
      loaded &&
      loaded.terrainDataId === effectiveTerrainDataId &&
      loaded.config.fetchedAt === config.fetchedAt;

    let cancelled = false;
    const applySidecarsToPanel = async (
      imageryBlob: Blob,
      heightmapBlob: Blob
    ) => {
      const imageryUrl = URL.createObjectURL(imageryBlob);
      const heightmapUrl = URL.createObjectURL(heightmapBlob);
      const elevationUrl = await createElevationPreviewUrl(heightmapBlob).catch(() => null);
      if (cancelled) {
        URL.revokeObjectURL(imageryUrl);
        URL.revokeObjectURL(heightmapUrl);
        if (elevationUrl) URL.revokeObjectURL(elevationUrl);
        return;
      }
      setPendingBlobs({ imagery: imageryBlob, heightmap: heightmapBlob });
      setPreviewUrls({ imagery: imageryUrl, heightmap: heightmapUrl });
      setElevationPreviewUrl(elevationUrl);
      setDraftConfig(config);
      setFetchMeta(fetchMetaFromConfig(config));
      setTerrainVisible(engine.hasVisibleLocalTerrain());
      const attr = [config.attribution.imagery, config.attribution.elevation]
        .filter(Boolean)
        .join(' · ');
      setAttribution(attr || null);
      setSidecarStatus('idle');
      setSidecarError(null);
    };

    if (hydratedKeyRef.current === key) return;

    if (canUseLoadedSidecars && loaded) {
      void (async () => {
        hydratedKeyRef.current = key;
        await applySidecarsToPanel(loaded.imageryBlob, loaded.heightmapBlob);
      })();
      return () => {
        cancelled = true;
        if (hydratedKeyRef.current === key) hydratedKeyRef.current = null;
      };
    }

    setDraftConfig(config);
    setFetchMeta(fetchMetaFromConfig(config));
    setSidecarStatus('loading');
    setSidecarError(null);

    void (async () => {
      let fetched: typeof loaded = null;
      try {
        fetched = await fetchTerrainSidecarAssets(config, facilityId);
        if (cancelled) {
          revokeTerrainSidecarAssets(fetched);
          return;
        }
        engine.setLoadedTerrainSidecars(fetched);
        await engine.applyGroundPreset('local', { terrain: fetched });
        engine.refreshGroundPlaneBounds();
        setTerrainVisible(true);
        await applySidecarsToPanel(fetched.imageryBlob, fetched.heightmapBlob);
        hydratedKeyRef.current = key;
      } catch (error) {
        if (cancelled) return;
        setTerrainVisible(false);
        setSidecarStatus('failed');
        setSidecarError(
          error instanceof Error
            ? error.message
            : 'Stored terrain files could not be loaded.'
        );
      }
    })();

    return () => {
      cancelled = true;
      if (hydratedKeyRef.current === key) hydratedKeyRef.current = null;
    };
  }, [engine, facilityId, terrainDataId, terrainConfigPresent, sidecarsLoadedTick, sidecarRetryNonce]);

  const revokePreviewUrls = useCallback(
    (urls: { imagery: string; heightmap: string } | null, elevationUrl: string | null) => {
      if (urls) {
        URL.revokeObjectURL(urls.imagery);
        URL.revokeObjectURL(urls.heightmap);
      }
      if (elevationUrl) URL.revokeObjectURL(elevationUrl);
    },
    []
  );

  useEffect(
    () => () => {
      revokePreviewUrls(previewUrls, elevationPreviewUrl);
    },
    [previewUrls, elevationPreviewUrl, revokePreviewUrls]
  );

  const applyTransformToEngine = useCallback(
    (partial: Partial<TerrainTransform> & Partial<TerrainConfig>) => {
      const nextTransform = { ...transform, ...partial };
      setTransform(nextTransform);
      engine.updateTerrainTransform({
        offset: nextTransform.offset,
        scale: nextTransform.scale,
        rotationDeg: nextTransform.rotationDeg,
        elevationAmplitude: nextTransform.elevationAmplitude,
        baseOpacity: nextTransform.baseOpacity,
      });
    },
    [engine, transform]
  );

  const handleCenterCamera = useCallback(() => {
    if (!engine.focusOnLocalTerrain()) {
      setFetchError('Terrain mesh is not loaded yet — fetch terrain first.');
    }
  }, [engine]);

  const handleFetch = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const result = await bludesignApi.fetchSiteTerrain({
        lat,
        lng,
        radiusMeters,
        detailLevel,
      });
      const imageryBlob = base64ToBlob(result.imageryBase64, 'image/jpeg');
      const heightmapBlob = base64ToBlob(result.heightmapBase64, 'image/png');
      const blobs = { imagery: imageryBlob, heightmap: heightmapBlob };
      setPendingBlobs(blobs);

      revokePreviewUrls(previewUrls, elevationPreviewUrl);
      const imageryUrl = URL.createObjectURL(imageryBlob);
      const heightmapUrl = URL.createObjectURL(heightmapBlob);
      const elevationUrl = await createElevationPreviewUrl(heightmapBlob);
      setPreviewUrls({ imagery: imageryUrl, heightmap: heightmapUrl });
      setElevationPreviewUrl(elevationUrl);
      setFetchMeta(result.meta);

      const config = buildTerrainConfigFromFetch(
        generateUuid(),
        { lat, lng },
        radiusMeters,
        result.meta,
        transform,
        detailLevel
      );
      setDraftConfig(config);
      setTerrainVisible(true);
      onSetupActiveChange(true);
      engine.setTerrainSetupPreview({ imageryUrl, heightmapUrl, config });
      await engine.applyGroundPreset('local', {
        terrain: { imageryUrl, heightmapUrl, config },
      });
      engine.refreshGroundPlaneBounds();
      engine.focusOnLocalTerrain();

      engine.setLoadedTerrainSidecars({
        terrainDataId: config.terrainDataId,
        imageryUrl,
        heightmapUrl,
        config,
        imageryBlob,
        heightmapBlob,
      });

      const attr = [
        result.meta.attribution?.imagery,
        result.meta.attribution?.elevation,
      ]
        .filter(Boolean)
        .join(' · ');
      setAttribution(attr || null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Terrain fetch failed');
    } finally {
      setFetching(false);
    }
  }, [
    lat,
    lng,
    radiusMeters,
    detailLevel,
    transform,
    engine,
    onSetupActiveChange,
    previewUrls,
    elevationPreviewUrl,
    revokePreviewUrls,
  ]);

  /** Build a terrain payload from the current preview + live alignment transform. */
  const buildCurrentTerrain = useCallback(() => {
    if (!draftConfig || !previewUrls) return null;
    const config: TerrainConfig = {
      ...draftConfig,
      offset: { ...transform.offset },
      scale: transform.scale,
      rotationDeg: transform.rotationDeg,
      elevationAmplitude: transform.elevationAmplitude,
      baseOpacity: transform.baseOpacity,
    };
    return {
      imageryUrl: previewUrls.imagery,
      heightmapUrl: previewUrls.heightmap,
      config,
    };
  }, [draftConfig, previewUrls, transform]);

  /** Panel draft first; fall back to engine-loaded sidecars (post-reload show/hide). */
  const resolveTerrainForApply = useCallback(() => {
    const fromPanel = buildCurrentTerrain();
    if (fromPanel) return fromPanel;

    const loaded = engine.getLoadedTerrainSidecars();
    const config = engine.getTerrainConfig();
    if (!loaded || !config) return null;

    return {
      imageryUrl: loaded.imageryUrl,
      heightmapUrl: loaded.heightmapUrl,
      config: {
        ...config,
        offset: { ...transform.offset },
        scale: transform.scale,
        rotationDeg: transform.rotationDeg,
        elevationAmplitude: transform.elevationAmplitude,
        baseOpacity: transform.baseOpacity,
      },
    };
  }, [buildCurrentTerrain, engine, transform]);

  const handleApply = useCallback(async () => {
    const terrain = buildCurrentTerrain();
    if (!terrain || !pendingBlobs) return;
    const { config } = terrain;
    engine.setTerrainConfig(config);
    hydratedKeyRef.current = `${config.terrainDataId}:${config.fetchedAt}`;
    engine.setTerrainSetupPreview(null);
    onPendingAssets(pendingBlobs);
    onSetupActiveChange(false);
    setTerrainVisible(true);
    await engine.applyGroundPreset('local', { terrain });
    engine.refreshGroundPlaneBounds();
    engine.setLoadedTerrainSidecars({
      terrainDataId: config.terrainDataId,
      imageryUrl: terrain.imageryUrl,
      heightmapUrl: terrain.heightmapUrl,
      config,
      imageryBlob: pendingBlobs.imagery,
      heightmapBlob: pendingBlobs.heightmap,
    });
    onTerrainApplied?.();

    void Promise.all([
      bludesignApi.uploadTerrainImagery(config.terrainDataId, pendingBlobs.imagery),
      bludesignApi.uploadTerrainHeightmap(config.terrainDataId, pendingBlobs.heightmap),
    ])
      .then(() => onPendingAssets(null))
      .catch((err) => console.error('Terrain upload failed:', err));
  }, [
    buildCurrentTerrain,
    pendingBlobs,
    engine,
    onPendingAssets,
    onSetupActiveChange,
    onTerrainApplied,
  ]);

  /**
   * Non-destructive show/hide toggle: hiding restores the standard editor grid
   * while keeping fetched imagery + alignment intact; showing re-applies terrain.
   */
  const handleToggleVisibility = useCallback(async () => {
    if (terrainVisible) {
      setTerrainVisible(false);
      await engine.applyGroundPreset('grid');
      engine.refreshGroundPlaneBounds();
      return;
    }

    const terrain = resolveTerrainForApply();
    if (!terrain) return;
    setTerrainVisible(true);
    engine.setTerrainSetupPreview(terrain);
    await engine.applyGroundPreset('local', { terrain });
    engine.refreshGroundPlaneBounds();
  }, [terrainVisible, engine, resolveTerrainForApply]);

  const hasDraft = !!draftConfig && !!previewUrls;
  const hasTerrainMetadata = !!draftConfig || !!engine.getTerrainConfig();
  const canFrameTerrain = terrainVisible && (hasDraft || engine.hasVisibleLocalTerrain());
  const hasExistingTerrain = hasDraft || !!engine.getTerrainConfig();

  const handleFetchClick = useCallback(() => {
    if (hasExistingTerrain) {
      setShowRefetchConfirm(true);
      return;
    }
    void handleFetch();
  }, [hasExistingTerrain, handleFetch]);

  const handleConfirmRefetch = useCallback(() => {
    setShowRefetchConfirm(false);
    void handleFetch();
  }, [handleFetch]);

  const handleConfirmDelete = useCallback(async () => {
    setShowDeleteConfirm(false);
    const terrainDataId =
      engine.getTerrainConfig()?.terrainDataId ?? draftConfig?.terrainDataId ?? null;

    setDeleting(true);
    setFetchError(null);
    try {
      engine.setTerrainConfig(null);
      await engine.clearTerrainGround();

      if (terrainDataId) {
        try {
          await bludesignApi.deleteTerrainData(terrainDataId);
        } catch {
          // Local state cleared; server files may not exist for never-applied drafts.
        }
        forgetRetainedTerrainSidecars(terrainDataId);
      }
      onTerrainDeleted?.();
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to delete terrain');
    } finally {
      setDeleting(false);
    }
  }, [draftConfig?.terrainDataId, engine, onTerrainDeleted]);

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ width }}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {!setupActive && !engine.getTerrainConfig() && (
          <p className={`text-xs leading-relaxed ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Fetch real satellite imagery and elevation for your site, then align the terrain mesh to
            your facility layout.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <label className="space-y-1">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Latitude
            </span>
            <input
              type="number"
              step="any"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                isDark
                  ? 'border-gray-600 bg-gray-800 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
            />
          </label>
          <label className="space-y-1">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Longitude
            </span>
            <input
              type="number"
              step="any"
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                isDark
                  ? 'border-gray-600 bg-gray-800 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
            />
          </label>
          <label className="space-y-1">
            <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
              Detail
            </span>
            <select
              value={detailLevel}
              onChange={(e) => setDetailLevel(e.target.value as TerrainDetailLevel)}
              className={`w-full rounded-md border px-2 py-1.5 text-sm ${
                isDark
                  ? 'border-gray-600 bg-gray-800 text-white'
                  : 'border-gray-300 bg-white text-gray-900'
              }`}
            >
              {TERRAIN_DETAIL_LEVEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            Radius (meters)
          </span>
          <input
            type="number"
            min={50}
            max={2000}
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            className={`w-full rounded-md border px-2 py-1.5 text-sm ${
              isDark
                ? 'border-gray-600 bg-gray-800 text-white'
                : 'border-gray-300 bg-white text-gray-900'
            }`}
          />
        </label>

        <button
          type="button"
          disabled={fetching}
          onClick={handleFetchClick}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#147FD4] px-3 py-2 text-sm font-medium text-white transition hover:bg-[#1269b0] disabled:opacity-60"
        >
          {fetching ? (
            <ArrowPathIcon className="h-4 w-4 animate-spin" />
          ) : hasExistingTerrain ? (
            <ArrowPathIcon className="h-4 w-4" />
          ) : (
            <MapPinIcon className="h-4 w-4" />
          )}
          {fetching
            ? 'Fetching terrain…'
            : hasExistingTerrain
              ? 'Refetch terrain'
              : 'Fetch terrain'}
        </button>

        {canFrameTerrain && (
          <button
            type="button"
            onClick={handleCenterCamera}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
              isDark
                ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                : 'border-gray-300 text-gray-800 hover:bg-gray-50'
            }`}
          >
            <ViewfinderCircleIcon className="h-4 w-4" />
            Center camera on terrain
          </button>
        )}

        {hasExistingTerrain && (
          <button
            type="button"
            disabled={deleting || fetching}
            onClick={() => setShowDeleteConfirm(true)}
            className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${
              isDark
                ? 'border-red-900/60 text-red-400 hover:bg-red-950/40'
                : 'border-red-200 text-red-600 hover:bg-red-50'
            }`}
          >
            {deleting ? (
              <ArrowPathIcon className="h-4 w-4 animate-spin" />
            ) : (
              <TrashIcon className="h-4 w-4" />
            )}
            {deleting ? 'Deleting terrain…' : 'Delete terrain'}
          </button>
        )}

        {fetchError && (
          <p className="text-xs text-red-500" role="alert">
            {fetchError}
          </p>
        )}

        {engine.getTerrainConfig() && sidecarStatus !== 'idle' && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              sidecarStatus === 'loading'
                ? isDark
                  ? 'border-blue-900/60 bg-blue-950/20 text-blue-200'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
                : isDark
                  ? 'border-amber-900/60 bg-amber-950/20 text-amber-200'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span>
                {sidecarStatus === 'loading'
                  ? 'Loading stored terrain imagery and elevation...'
                  : 'Terrain metadata exists, but the stored imagery/elevation files are not available.'}
              </span>
              {sidecarStatus === 'failed' && (
                <button
                  type="button"
                  onClick={() => {
                    hydratedKeyRef.current = null;
                    setSidecarRetryNonce((n) => n + 1);
                  }}
                  className={`shrink-0 rounded-md px-2 py-1 font-medium ${
                    isDark
                      ? 'bg-amber-900/40 text-amber-100 hover:bg-amber-900/60'
                      : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                  }`}
                >
                  Retry
                </button>
              )}
            </div>
            {sidecarError && (
              <p className={`mt-1 ${isDark ? 'text-amber-300/80' : 'text-amber-700'}`}>
                {sidecarError}
              </p>
            )}
          </div>
        )}

        {attribution && (
          <p className={`text-[10px] leading-snug ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {attribution}
          </p>
        )}

        {hasDraft && previewUrls && fetchMeta && (
          <div className="space-y-2 border-t pt-3 border-gray-700/40">
            <h4
              className={`text-xs font-semibold uppercase tracking-wide ${
                isDark ? 'text-gray-400' : 'text-gray-500'
              }`}
            >
              Fetched data
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <TerrainAssetPreviewCard
                title="Satellite"
                subtitle={`${fetchMeta.width}×${fetchMeta.height} · z${fetchMeta.imageryZoom}`}
                imageUrl={previewUrls.imagery}
                fileSize={pendingBlobs?.imagery.size}
                isDark={isDark}
              />
              <TerrainAssetPreviewCard
                title="Elevation"
                subtitle={`${fetchMeta.minM.toFixed(0)}–${fetchMeta.maxM.toFixed(0)} m · z${fetchMeta.elevationZoom}`}
                imageUrl={elevationPreviewUrl ?? previewUrls.heightmap}
                fileSize={pendingBlobs?.heightmap.size}
                isDark={isDark}
              />
            </div>
            <p className={`text-[10px] leading-snug ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              {fetchMeta.worldSizeMeters.toFixed(0)} m coverage ·{' '}
              {fetchMeta.imageryMetersPerPixel.toFixed(2)} m/px imagery
            </p>
          </div>
        )}

        {hasTerrainMetadata && (
          <div className="space-y-3 border-t pt-3 border-gray-700/40">
            <h4 className={`text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Alignment
            </h4>
            <SliderRow
              label="X offset"
              value={transform.offset.x}
              min={-200}
              max={200}
              step={1}
              onChange={(v) =>
                applyTransformToEngine({ offset: { ...transform.offset, x: v } })
              }
              isDark={isDark}
            />
            <SliderRow
              label="Z offset"
              value={transform.offset.z}
              min={-200}
              max={200}
              step={1}
              onChange={(v) =>
                applyTransformToEngine({ offset: { ...transform.offset, z: v } })
              }
              isDark={isDark}
            />
            <SliderRow
              label="Y offset"
              value={transform.offset.y}
              min={-50}
              max={50}
              step={0.5}
              onChange={(v) =>
                applyTransformToEngine({ offset: { ...transform.offset, y: v } })
              }
              isDark={isDark}
            />
            <SliderRow
              label="Scale"
              value={transform.scale}
              min={0.25}
              max={3}
              step={0.05}
              onChange={(v) => applyTransformToEngine({ scale: v })}
              isDark={isDark}
            />
            <SliderRow
              label="Yaw (°)"
              value={transform.rotationDeg}
              min={-180}
              max={180}
              step={1}
              onChange={(v) => applyTransformToEngine({ rotationDeg: v })}
              isDark={isDark}
            />
            <SliderRow
              label="Elevation amplitude"
              value={transform.elevationAmplitude}
              min={0}
              max={5}
              step={0.05}
              onChange={(v) => applyTransformToEngine({ elevationAmplitude: v })}
              isDark={isDark}
            />
            <SliderRow
              label="Base opacity"
              value={transform.baseOpacity}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => applyTransformToEngine({ baseOpacity: v })}
              isDark={isDark}
            />
          </div>
        )}
      </div>

      {hasDraft && (
        <footer
          className={`flex shrink-0 gap-2 border-t p-3 ${
            isDark ? 'border-gray-700' : 'border-gray-200'
          }`}
        >
          <button
            type="button"
            onClick={() => void handleToggleVisibility()}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
              isDark
                ? 'text-gray-300 hover:bg-gray-800'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            {terrainVisible ? (
              <EyeSlashIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            {terrainVisible ? 'Hide terrain' : 'Show terrain'}
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#147FD4] px-3 py-2 text-sm font-medium text-white hover:bg-[#1269b0]"
          >
            <CheckIcon className="h-4 w-4" />
            Apply
          </button>
        </footer>
      )}

      <ConfirmDialog
        isOpen={showRefetchConfirm}
        title="Refetch terrain?"
        message="Fetching again will replace the current satellite imagery and elevation for this site with fresh data at the coordinates and detail level above. Your alignment settings will be kept."
        confirmLabel="Refetch"
        cancelLabel="Keep current"
        confirmTone="primary"
        onConfirm={handleConfirmRefetch}
        onCancel={() => setShowRefetchConfirm(false)}
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete terrain?"
        message="This removes the satellite imagery and elevation mesh from this facility and deletes the stored terrain files. You can fetch new terrain later. Save the facility to persist the change."
        confirmLabel="Delete terrain"
        cancelLabel="Keep terrain"
        confirmTone="danger"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};
