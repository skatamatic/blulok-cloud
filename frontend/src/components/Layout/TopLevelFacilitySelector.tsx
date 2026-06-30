import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { BuildingOfficeIcon, ChevronDownIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { useGlobalFacility, ALL_FACILITIES_ID } from '@/contexts/GlobalFacilityContext';
import { useSidebar } from '@/contexts/SidebarContext';
import {
  isFacilitySetupDetailRoute,
  resolveFacilitySetupPath,
} from '@/utils/facility-setup-navigation.utils';

export const TopLevelFacilitySelector: React.FC = () => {
  const { isCollapsed } = useSidebar();
  const navigate = useNavigate();
  const location = useLocation();
  const { facilities, selectedFacilityId, selectedFacility, setSelectedFacilityId, isAllFacilitiesSelected, isLoading } = useGlobalFacility();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (facilityId: string | null) => {
    setSelectedFacilityId(facilityId);
    setIsOpen(false);

    if (isFacilitySetupDetailRoute(location.pathname)) {
      const isAll = facilityId === ALL_FACILITIES_ID;
      navigate(resolveFacilitySetupPath(facilityId, isAll), { replace: true });
    }
  };

  // Calculate dropdown position when opening and on scroll/resize
  useEffect(() => {
    if (!isOpen || !buttonRef.current || !dropdownRef.current) {
      return;
    }

    const updatePosition = () => {
      if (!buttonRef.current || !dropdownRef.current) return;
      
      const buttonRect = buttonRef.current.getBoundingClientRect();
      const dropdown = dropdownRef.current;
      
      // Use fixed positioning to avoid clipping
      const minWidth = 320;
      const preferredWidth = Math.max(buttonRect.width, minWidth);
      
      dropdown.style.position = 'fixed';
      // For collapsed sidebar, align dropdown top with button top for better visual alignment
      // For expanded sidebar, position below the button
      if (isCollapsed) {
        dropdown.style.top = `${buttonRect.top}px`;
        dropdown.style.left = `${buttonRect.right + 4}px`;
      } else {
        dropdown.style.top = `${buttonRect.bottom + 4}px`;
        dropdown.style.left = `${buttonRect.left}px`;
      }
      dropdown.style.width = `${preferredWidth}px`;
      dropdown.style.minWidth = `${minWidth}px`;
    };

    // Initial positioning
    updatePosition();

    // Update position on scroll or resize
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, isCollapsed]);

  // Don't show anything if loading or no facilities
  if (isLoading || facilities.length === 0) {
    return null;
  }

  // Always show a dropdown selector so "All Facilities" can be chosen in single-facility installs.
  if (isCollapsed) {
    return (
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={isAllFacilitiesSelected ? 'All Facilities' : selectedFacility?.name || 'Select facility'}
        >
          {isAllFacilitiesSelected ? (
            <GlobeAltIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
          ) : selectedFacility?.branding_image && selectedFacility?.image_mime_type ? (
            <img
              src={`data:${selectedFacility.image_mime_type};base64,${selectedFacility.branding_image}`}
              alt={selectedFacility.name}
              className="h-8 w-8 rounded object-contain bg-white dark:bg-gray-100 p-0.5 flex-shrink-0 border border-gray-200 dark:border-gray-600"
            />
          ) : (
            <BuildingOfficeIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
          )}
        </button>
        {isOpen && (
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto overflow-x-hidden"
          >
            <ul className="py-1">
              {/* All Facilities option */}
              <li>
                <button
                  type="button"
                  onClick={() => handleSelect(ALL_FACILITIES_ID)}
                  className={`w-full px-4 py-3 text-left flex items-start space-x-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors ${
                    isAllFacilitiesSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : ''
                  }`}
                >
                  <div className="h-8 w-8 rounded bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <GlobeAltIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      All Facilities
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      View data across all facilities
                    </div>
                  </div>
                  {isAllFacilitiesSelected && (
                    <div className="h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400 flex-shrink-0 mt-1.5"></div>
                  )}
                </button>
              </li>
              
              {/* Divider */}
              {facilities.length > 0 && (
                <li className="border-t border-gray-200 dark:border-gray-700 my-1"></li>
              )}

              {/* Individual facilities */}
              {facilities.map((facility) => (
                <li key={facility.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(facility.id)}
                    className={`w-full px-4 py-3 text-left flex items-start space-x-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors ${
                      selectedFacilityId === facility.id
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : ''
                    }`}
                  >
                    {facility.branding_image && facility.image_mime_type ? (
                      <img
                        src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
                        alt={facility.name}
                        className="h-8 w-8 rounded object-contain bg-white dark:bg-gray-100 p-0.5 flex-shrink-0 border border-gray-200 dark:border-gray-600 mt-0.5"
                      />
                    ) : (
                      <div className="h-8 w-8 rounded bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <BuildingOfficeIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {facility.name}
                      </div>
                      {facility.address && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {facility.address}
                        </div>
                      )}
                    </div>
                    {selectedFacilityId === facility.id && (
                      <div className="h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400 flex-shrink-0 mt-1.5"></div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-2 rounded-md transition-all duration-200 flex items-center justify-between ${
          selectedFacilityId 
            ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100' 
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        } hover:bg-primary-50 dark:hover:bg-primary-900/30 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 dark:focus:ring-offset-gray-800`}
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {isAllFacilitiesSelected ? (
            <>
              <div className="h-5 w-5 rounded bg-primary-200 dark:bg-primary-800/30 flex items-center justify-center flex-shrink-0">
                <GlobeAltIcon className="h-3.5 w-3.5 text-primary-700 dark:text-primary-300" />
              </div>
              <span className="text-sm font-medium truncate">
                All Facilities
              </span>
            </>
          ) : selectedFacility ? (
            <>
              {selectedFacility.branding_image && selectedFacility.image_mime_type ? (
                <img
                  src={`data:${selectedFacility.image_mime_type};base64,${selectedFacility.branding_image}`}
                  alt={selectedFacility.name}
                  className="h-5 w-5 rounded object-contain bg-white dark:bg-gray-100 p-0.5 flex-shrink-0"
                />
              ) : (
                <div className="h-5 w-5 rounded bg-primary-200 dark:bg-primary-800/30 flex items-center justify-center flex-shrink-0">
                  <BuildingOfficeIcon className="h-3.5 w-3.5 text-primary-700 dark:text-primary-300" />
                </div>
              )}
              <span className="text-sm font-medium truncate">
                {selectedFacility.name}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Select facility
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 flex-shrink-0 ml-2 transition-transform ${
            selectedFacilityId 
              ? 'text-primary-700 dark:text-primary-300' 
              : 'text-gray-400 dark:text-gray-500'
          } ${isOpen ? 'transform rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto overflow-x-hidden"
        >
          <ul className="py-1">
            {/* All Facilities option */}
            <li>
              <button
                type="button"
                onClick={() => handleSelect(ALL_FACILITIES_ID)}
                className={`w-full px-4 py-3 text-left flex items-start space-x-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors ${
                  isAllFacilitiesSelected
                    ? 'bg-primary-50 dark:bg-primary-900/20'
                    : ''
                }`}
              >
                <div className="h-8 w-8 rounded bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <BuildingOfficeIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    All Facilities
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    View data across all facilities
                  </div>
                </div>
                {isAllFacilitiesSelected && (
                  <div className="h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400 flex-shrink-0 mt-1.5"></div>
                )}
              </button>
            </li>
            
            {/* Divider */}
            {facilities.length > 0 && (
              <li className="border-t border-gray-200 dark:border-gray-700 my-1"></li>
            )}

            {/* Individual facilities */}
            {facilities.map((facility) => (
              <li key={facility.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(facility.id)}
                  className={`w-full px-4 py-3 text-left flex items-start space-x-3 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors ${
                    selectedFacilityId === facility.id
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : ''
                  }`}
                >
                  {facility.branding_image && facility.image_mime_type ? (
                    <img
                      src={`data:${facility.image_mime_type};base64,${facility.branding_image}`}
                      alt={facility.name}
                      className="h-8 w-8 rounded object-contain bg-white dark:bg-gray-100 p-0.5 flex-shrink-0 border border-gray-200 dark:border-gray-600 mt-0.5"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <BuildingOfficeIcon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {facility.name}
                    </div>
                    {facility.address && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                        {facility.address}
                      </div>
                    )}
                  </div>
                  {selectedFacilityId === facility.id && (
                    <div className="h-2 w-2 rounded-full bg-primary-600 dark:bg-primary-400 flex-shrink-0 mt-1.5"></div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

