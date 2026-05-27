/**
 * Empty state for the facility 3D viewer when no model is available or scope is invalid.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { CubeIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';

export type FacilityViewerEmptyVariant = 'no-model' | 'select-facility';

interface FacilityViewerEmptyStateProps {
  variant: FacilityViewerEmptyVariant;
  /** BluLok facility name when variant is `no-model`. */
  facilityName?: string;
  className?: string;
}

export const FacilityViewerEmptyState: React.FC<FacilityViewerEmptyStateProps> = ({
  variant,
  facilityName,
  className = '',
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const isNoModel = variant === 'no-model';

  const Icon = isNoModel ? CubeIcon : BuildingOffice2Icon;
  const title = isNoModel ? 'No 3D model configured' : 'Select a facility';
  const description = isNoModel
    ? facilityName
      ? `Link a BluDesign model for ${facilityName} to view it here.`
      : 'Link a BluDesign model for this facility to view it here.'
    : 'Pick one facility from the header to open its 3D view.';

  return (
    <div
      className={`flex h-full w-full items-center justify-center px-6 ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-xs text-center">
        <Icon
          className={`mx-auto mb-3 h-10 w-10 ${
            isDark ? 'text-gray-500' : 'text-gray-400'
          }`}
          strokeWidth={1.25}
          aria-hidden
        />

        <p
          className={`text-sm font-medium ${
            isDark ? 'text-gray-200' : 'text-gray-800'
          }`}
        >
          {title}
        </p>

        <p
          className={`mt-1 text-xs leading-relaxed ${
            isDark ? 'text-gray-500' : 'text-gray-500'
          }`}
        >
          {description}
        </p>

        {isNoModel && (
          <Link
            to="/bludesign/config"
            className={`mt-3 inline-block text-xs font-medium underline-offset-2 hover:underline ${
              isDark ? 'text-[#147FD4]' : 'text-[#147FD4]'
            }`}
          >
            BluDesign configuration
          </Link>
        )}
      </div>
    </div>
  );
};
