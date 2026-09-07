import React, { useState, useRef, useEffect } from 'react';
import { BuildingOfficeIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { Facility } from '@/types/facility.types';

interface CompactFacilityDropdownProps {
  facilities: Facility[];
  selectedFacilityId: string;
  onSelect: (facilityId: string) => void;
  placeholder?: string;
  className?: string;
}

export const CompactFacilityDropdown: React.FC<CompactFacilityDropdownProps> = ({
  facilities,
  selectedFacilityId,
  onSelect,
  placeholder = 'Select a facility',
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId);

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

  const handleSelect = (facilityId: string) => {
    onSelect(facilityId);
    setIsOpen(false);
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
      // Make dropdown wider than button - minimum 320px, can extend into main view
      const minWidth = 320;
      const preferredWidth = Math.max(buttonRect.width, minWidth);
      
      dropdown.style.position = 'fixed';
      dropdown.style.top = `${buttonRect.bottom + 4}px`;
      dropdown.style.left = `${buttonRect.left}px`;
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
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-white dark:bg-gray-800 border ${
          selectedFacilityId 
            ? 'border-primary-500 dark:border-primary-400' 
            : 'border-gray-300 dark:border-gray-600'
        } rounded-lg shadow-sm hover:border-primary-500 dark:hover:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors flex items-center justify-between`}
      >
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {selectedFacility ? (
            <>
              {selectedFacility.branding_image && selectedFacility.image_mime_type ? (
                <img
                  src={`data:${selectedFacility.image_mime_type};base64,${selectedFacility.branding_image}`}
                  alt={selectedFacility.name}
                  className="h-6 w-6 rounded object-contain bg-white dark:bg-gray-100 p-0.5 flex-shrink-0 border border-gray-200 dark:border-gray-600"
                />
              ) : (
                <div className="h-6 w-6 rounded bg-primary-100 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0">
                  <BuildingOfficeIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                </div>
              )}
              <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                {selectedFacility.name}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {placeholder}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div
          ref={dropdownRef}
          className="fixed z-[9999] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-96 overflow-y-auto overflow-x-hidden"
        >
          {facilities.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              No facilities available
            </div>
          ) : (
            <ul className="py-1">
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
          )}
        </div>
      )}
    </div>
  );
};

