/**
 * Build-in-3D Wizard — Stage 2: asset generation.
 */

import React from 'react';
import { CubeTransparentIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { feetToMeters, metersToFeet } from '../../../core/types';
import type { BuildWizardController } from '../useBuildWizard';
import type { ResolvedAssetBucket } from '../assetSpec';

interface Props {
  controller: BuildWizardController;
  isDark: boolean;
}

export const AssetsStep: React.FC<Props> = ({ controller, isDark }) => {
  const toleranceFt = metersToFeet(controller.toleranceM);

  return (
    <div className="space-y-5 max-w-3xl">
      <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800/60' : 'bg-gray-50'}`}>
        <label className={`block text-xs font-medium mb-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
          Reuse tolerance: units within {toleranceFt.toFixed(1)} ft on each axis share one asset
        </label>
        <input
          type="range"
          min={0.25}
          max={3}
          step={0.25}
          value={toleranceFt}
          onChange={(e) => controller.setToleranceM(feetToMeters(Number(e.target.value)))}
          className="w-full accent-primary-500"
          disabled={controller.assetsBusy}
        />
      </div>

      <button
        type="button"
        onClick={() => void controller.generateAssets()}
        disabled={controller.assetsBusy}
        className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold bg-primary-500 text-white transition-all hover:bg-primary-600 disabled:opacity-50"
      >
        <CubeTransparentIcon className="w-5 h-5" />
        {controller.assetsBusy
          ? 'Generating assets…'
          : controller.assetsCreated
            ? 'Regenerate assets'
            : 'Generate assets'}
      </button>

      {controller.assetError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 text-error-500 text-sm">
          <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />
          <span>{controller.assetError}</span>
        </div>
      )}

      {controller.assetsCreated && (
        <div className="space-y-3">
          <div className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
            <span className={`font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {controller.unitsWithAsset} units → {controller.buckets.length} reusable asset
              {controller.buckets.length === 1 ? '' : 's'}
            </span>
            {controller.assetsReused > 0 && (
              <span className={isDark ? 'text-primary-300' : 'text-primary-700'}>
                {' '}
                · {controller.assetsReused} reused
                {controller.assetsCreatedCount > 0
                  ? `, ${controller.assetsCreatedCount} new`
                  : ''}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {controller.buckets.map((b) => (
              <BucketCard key={b.signature} bucket={b} isDark={isDark} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const BucketCard: React.FC<{ bucket: ResolvedAssetBucket; isDark: boolean }> = ({ bucket, isDark }) => {
  const wFt = metersToFeet(bucket.dimensions.width);
  const dFt = metersToFeet(bucket.dimensions.depth);
  const reused = bucket.matchKind !== 'created';
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-white'
      }`}
    >
      <TopDownPreview bucket={bucket} isDark={isDark} />
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
            {bucket.name}
          </div>
          <span
            className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              reused
                ? isDark
                  ? 'bg-primary-500/20 text-primary-300'
                  : 'bg-primary-100 text-primary-700'
                : isDark
                  ? 'bg-gray-700 text-gray-300'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {reused ? 'Reused' : 'New'}
          </span>
        </div>
        <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          {wFt.toFixed(1)} × {dFt.toFixed(1)} ft · door {bucket.lockerSpec.doorSide}
        </div>
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          {bucket.unitIds.length} unit{bucket.unitIds.length === 1 ? '' : 's'}
        </div>
      </div>
    </div>
  );
};

/** Cheap top-down schematic: rectangle (width × depth) with the door opening drawn on its side. */
const TopDownPreview: React.FC<{ bucket: ResolvedAssetBucket; isDark: boolean }> = ({ bucket, isDark }) => {
  const size = 52;
  const pad = 6;
  const { width, depth } = bucket.dimensions;
  const long = Math.max(width, depth, 0.01);
  const scale = (size - pad * 2) / long;
  const w = width * scale;
  const d = depth * scale;
  const x = (size - w) / 2;
  const y = (size - d) / 2;

  const { doorSide, doorWidth, doorPositionX } = bucket.lockerSpec;
  const horizontal = doorSide === 'front' || doorSide === 'back'; // along width (X)
  const dw = doorWidth * scale;
  const off = doorPositionX * scale;

  let dx1 = x;
  let dy1 = y;
  let dx2 = x;
  let dy2 = y;
  if (horizontal) {
    const cx = x + w / 2 + off;
    const yy = doorSide === 'front' ? y + d : y; // front=+Z (bottom)
    dx1 = cx - dw / 2;
    dx2 = cx + dw / 2;
    dy1 = yy;
    dy2 = yy;
  } else {
    const cy = y + d / 2 + off;
    const xx = doorSide === 'right' ? x + w : x; // right=+X
    dy1 = cy - dw / 2;
    dy2 = cy + dw / 2;
    dx1 = xx;
    dx2 = xx;
  }

  return (
    <svg width={size} height={size} className="flex-shrink-0">
      <rect
        x={x}
        y={y}
        width={w}
        height={d}
        rx={2}
        fill={isDark ? '#1f2937' : '#eef2ff'}
        stroke={isDark ? '#4b5563' : '#c7d2fe'}
        strokeWidth={1.5}
      />
      <line x1={dx1} y1={dy1} x2={dx2} y2={dy2} stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" />
    </svg>
  );
};
