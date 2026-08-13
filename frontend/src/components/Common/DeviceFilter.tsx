import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';
import { BluLokDeviceSummary } from '@/components/Common/BluLokDeviceSummary';
import { FilterComboboxEmptyOption } from '@/components/Common/FilterComboboxEmptyOption';
import { filterComboboxDropdownClass } from '@/components/Common/list-filters.styles';
import { useFilterDropdownPortal } from '@/hooks/useFilterDropdownPortal';
import {
  bluLokDeviceMatchesSearch,
  formatBluLokUserFacingLabel,
  type BluLokDeviceDisplayFields,
} from '@/utils/blulokDeviceDisplay.utils';

const PAGE_SIZE = 20;

export type DeviceFilterList = 'unassigned' | 'facility';

interface Device extends BluLokDeviceDisplayFields {
  device_status?: 'online' | 'offline' | 'low_battery' | 'error' | string;
  battery_level?: number;
  device_type?: string;
  location_description?: string;
  lock_status?: string | null;
}

interface DeviceFilterProps {
  value: string;
  onChange: (deviceId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId: string;
  excludeDeviceIds?: string[];
  /** `unassigned` = assignment picker. `facility` = searchable list of all operational devices at the facility. */
  list?: DeviceFilterList;
  deviceType?: 'blulok' | 'access_control' | 'all';
  onDisplayLabelChange?: (label: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}

function isBluLokRow(device: Device, list: DeviceFilterList): boolean {
  if (list === 'unassigned') return true;
  const type = (device.device_type || '').toLowerCase();
  if (type === 'access_control' || type === 'door' || type === 'gate' || type === 'elevator') {
    return false;
  }
  return true;
}

function formatDeviceLabel(device: Device, list: DeviceFilterList): string {
  if (isBluLokRow(device, list)) return formatBluLokUserFacingLabel(device);
  return device.name?.trim() || device.serial?.trim() || device.device_serial?.trim() || device.id || 'Device';
}

function applyExclude(list: Device[], excludeDeviceIds: string[]): Device[] {
  if (!excludeDeviceIds.length) return list;
  const exclude = new Set(excludeDeviceIds);
  return list.filter((d) => d.id != null && !exclude.has(d.id));
}

async function resolveDeviceById(id: string): Promise<Device | null> {
  try {
    const response = await apiService.getBluLokDevice(id);
    if (response?.device) return response.device as Device;
  } catch {
    // Try access-control next.
  }
  try {
    const response = await apiService.getAccessControlDevice(id);
    if (response?.device) return response.device as Device;
  } catch {
    return null;
  }
  return null;
}

export const DeviceFilter: React.FC<DeviceFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search devices...',
  className = '',
  facilityId,
  excludeDeviceIds = [],
  list = 'unassigned',
  deviceType,
  onDisplayLabelChange,
  allowEmpty = false,
  emptyLabel = 'All devices',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalDevices, setTotalDevices] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvingValueRef = useRef<string | null>(null);
  const userIsSearchingRef = useRef(false);
  const { dropdownRef, dropdownStyle } = useFilterDropdownPortal(isOpen, containerRef, [searchTerm]);

  const applySelectedDevice = useCallback(
    (device: Device | null) => {
      userIsSearchingRef.current = false;
      setSelectedDevice(device);
      if (device) {
        const label = formatDeviceLabel(device, list);
        setSearchTerm(label);
        onDisplayLabelChange?.(label);
      } else {
        setSearchTerm('');
        onDisplayLabelChange?.('');
      }
    },
    [onDisplayLabelChange, list],
  );

  const loadUnassigned = useCallback(async () => {
    if (!facilityId) return;
    try {
      setLoading(true);
      const resp = await apiService.getUnassignedDevices(facilityId);
      const next = applyExclude(resp?.devices || [], excludeDeviceIds);
      setDevices(next);
      setFilteredDevices(next);
      setTotalDevices(next.length);
      setHasMore(false);
    } catch {
      setDevices([]);
      setFilteredDevices([]);
      setTotalDevices(0);
    } finally {
      setLoading(false);
    }
  }, [facilityId, excludeDeviceIds]);

  const loadFacilityPage = useCallback(
    async (page: number, isInitialLoad: boolean, search: string) => {
      if (!facilityId) return;
      try {
        if (isInitialLoad) setLoading(true);
        else setLoadingMore(true);

        const offset = (page - 1) * PAGE_SIZE;
        const resp = await apiService.getDevices({
          facility_id: facilityId,
          search: search || undefined,
          limit: PAGE_SIZE,
          offset,
          device_scope: 'operational',
          ...(deviceType && deviceType !== 'all' ? { device_type: deviceType } : {}),
        });
        const newDevices = applyExclude(resp?.devices || [], excludeDeviceIds);
        const total = resp?.total || newDevices.length;

        if (isInitialLoad) {
          setDevices(newDevices);
          setFilteredDevices(newDevices);
        } else {
          setDevices((prev) => [...prev, ...newDevices]);
          setFilteredDevices((prev) => [...prev, ...newDevices]);
        }
        setTotalDevices(total);
        setCurrentPage(page);
        setHasMore((isInitialLoad ? newDevices.length : offset + newDevices.length) < total);
      } catch {
        if (isInitialLoad) {
          setDevices([]);
          setFilteredDevices([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [facilityId, deviceType, excludeDeviceIds],
  );

  useEffect(() => {
    if (list === 'unassigned') {
      void loadUnassigned();
      return;
    }
    void loadFacilityPage(1, true, '');
  }, [list, loadUnassigned, loadFacilityPage]);

  useEffect(() => {
    if (list !== 'unassigned') return;
    const timeoutId = window.setTimeout(() => {
      const norm = searchTerm.trim().toLowerCase();
      setFilteredDevices(devices.filter((d) => bluLokDeviceMatchesSearch(d, norm)));
    }, 200);
    return () => window.clearTimeout(timeoutId);
  }, [list, searchTerm, devices]);

  useEffect(() => {
    if (list !== 'facility') return;
    const timeoutId = window.setTimeout(() => {
      if (!userIsSearchingRef.current) return;
      setCurrentPage(1);
      setHasMore(true);
      void loadFacilityPage(1, true, searchTerm);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [list, searchTerm, loadFacilityPage]);

  useEffect(() => {
    if (!value) {
      resolvingValueRef.current = null;
      if (!userIsSearchingRef.current) applySelectedDevice(null);
      return;
    }
    const found = devices.find((d) => d.id === value);
    if (found) {
      resolvingValueRef.current = null;
      applySelectedDevice(found);
    }
  }, [value, devices, applySelectedDevice]);

  useEffect(() => {
    if (!value || list !== 'facility') return;
    if (devices.some((d) => d.id === value)) return;
    if (resolvingValueRef.current === value) return;
    resolvingValueRef.current = value;
    let cancelled = false;
    (async () => {
      const fetched = await resolveDeviceById(value);
      if (cancelled || !fetched) return;
      applySelectedDevice(fetched);
      setDevices((prev) => (prev.some((d) => d.id === fetched.id) ? prev : [fetched, ...prev]));
      setFilteredDevices((prev) => (prev.some((d) => d.id === fetched.id) ? prev : [fetched, ...prev]));
    })();
    return () => {
      cancelled = true;
    };
  }, [value, list, devices, applySelectedDevice]);

  const handleSelect = (device: Device) => {
    if (!device.id) return;
    applySelectedDevice(device);
    onChange(device.id);
    setIsOpen(false);
  };

  const handleClear = () => {
    applySelectedDevice(null);
    onChange('');
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userIsSearchingRef.current = true;
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    if (!disabled) setIsOpen(true);
  };

  const handleInputBlur = (e: React.FocusEvent) => {
    if (dropdownRef.current?.contains(e.relatedTarget as Node)) return;
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (list !== 'facility') return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop <= clientHeight + 50 && hasMore && !loadingMore) {
      void loadFacilityPage(currentPage + 1, false, searchTerm);
    }
  };

  const emptyState =
    list === 'unassigned'
      ? devices.length === 0
        ? 'No unassigned devices available'
        : 'No devices match your search'
      : searchTerm
        ? 'No devices found'
        : 'No devices available';

  const dropdown = isOpen && !disabled && (
    <div
      ref={dropdownRef}
      className={filterComboboxDropdownClass}
      style={dropdownStyle}
      onScroll={handleScroll}
      onMouseDown={(e) => e.preventDefault()}
    >
      {loading ? (
        <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading devices...</div>
      ) : (
        <>
          {allowEmpty && (
            <FilterComboboxEmptyOption label={emptyLabel} onSelect={handleClear} />
          )}
          {filteredDevices.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{emptyState}</div>
          ) : (
            <>
              <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {searchTerm
                  ? `Search Results (${totalDevices || filteredDevices.length})`
                  : list === 'unassigned'
                    ? `Available Devices (${devices.length})`
                    : `All Devices (${totalDevices})`}
              </div>
              {filteredDevices.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => handleSelect(d)}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                    selectedDevice?.id === d.id
                      ? 'bg-primary-50 text-primary-900 dark:bg-primary-900/20 dark:text-primary-100'
                      : 'text-gray-900 dark:text-white'
                  }`}
                >
                  {isBluLokRow(d, list) ? (
                    <BluLokDeviceSummary device={d} status={d.device_status || 'unknown'} />
                  ) : (
                    <div>
                      <div className="truncate text-sm font-medium">{formatDeviceLabel(d, list)}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {d.location_description || d.device_type || d.device_serial}
                      </div>
                    </div>
                  )}
                </button>
              ))}
              {list === 'facility' && hasMore && (
                <div className="border-t border-gray-200 dark:border-gray-700">
                  {loadingMore ? (
                    <div className="px-3 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
                      Loading more devices...
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void loadFacilityPage(currentPage + 1, false, searchTerm)}
                      className="w-full px-3 py-2 text-left text-sm text-primary-600 transition-colors hover:bg-gray-100 dark:text-primary-400 dark:hover:bg-gray-700"
                    >
                      Load more devices ({Math.max(0, totalDevices - filteredDevices.length)} remaining)
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <CpuChipIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`block w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        />
      </div>
      {dropdown ? createPortal(dropdown, document.body) : null}
    </div>
  );
};
