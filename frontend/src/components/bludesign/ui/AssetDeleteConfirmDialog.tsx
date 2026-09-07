import React, { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/Common/ConfirmDialog';
import { AssetService, type AssetFacilityUsage } from '../services/AssetService';
import type { AssetMetadata } from '../core/types';
import {
  setSkipAssetDeleteConfirm,
} from '../assets/assetDeleteConfirmSession';

interface AssetDeleteConfirmDialogProps {
  asset: AssetMetadata | null;
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  confirmLabel?: string;
}

export const AssetDeleteConfirmDialog: React.FC<AssetDeleteConfirmDialogProps> = ({
  asset,
  isOpen,
  onConfirm,
  onCancel,
  title = 'Delete Asset',
  confirmLabel = 'Delete Asset',
}) => {
  const [facilities, setFacilities] = useState<AssetFacilityUsage[]>([]);
  const [loadingFacilities, setLoadingFacilities] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);

  useEffect(() => {
    if (!isOpen || !asset) {
      setSkipConfirm(false);
      setFacilities([]);
      return;
    }

    let cancelled = false;
    setLoadingFacilities(true);

    AssetService.getAssetFacilities(asset.id)
      .then((rows) => {
        if (!cancelled) setFacilities(rows);
      })
      .catch(() => {
        if (!cancelled) setFacilities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingFacilities(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, asset?.id]);

  const message = useMemo(() => {
    if (!asset) return '';

    let text = `Delete "${asset.name}"? This cannot be undone.`;

    if (loadingFacilities) {
      text += ' Checking facility usage…';
      return text;
    }

    if (facilities.length > 0) {
      const totalPlacements = facilities.reduce((sum, f) => sum + (f.usageCount ?? 1), 0);
      const facilitySummary = facilities
        .map((f) => {
          const count = f.usageCount ?? 1;
          return count > 1 ? `${f.name} (${count}×)` : f.name;
        })
        .join(', ');
      text += ` This asset is used in ${facilities.length} ${
        facilities.length === 1 ? 'facility' : 'facilities'
      }`;
      if (totalPlacements > facilities.length) {
        text += ` (${totalPlacements} placements total)`;
      }
      text += `: ${facilitySummary}. Deleting it will break those scenes.`;
    } else if ((asset.facilityUsageCount ?? 0) > 0) {
      text += ` This asset is used by ${asset.facilityUsageCount} saved ${
        asset.facilityUsageCount === 1 ? 'facility' : 'facilities'
      } — deleting it will break those scenes.`;
    }

    return text;
  }, [asset, facilities, loadingFacilities]);

  const handleConfirm = () => {
    if (skipConfirm) {
      setSkipAssetDeleteConfirm(true);
    }
    onConfirm();
  };

  return (
    <ConfirmDialog
      isOpen={isOpen}
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      confirmTone="danger"
      onCancel={onCancel}
      onConfirm={handleConfirm}
      footerExtra={
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={skipConfirm}
            onChange={(e) => setSkipConfirm(e.target.checked)}
            className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
          />
          Don&apos;t ask again this session
        </label>
      }
    />
  );
};
