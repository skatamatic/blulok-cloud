import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CpuChipIcon } from '@heroicons/react/24/outline';
import { apiService } from '@/services/api.service';

interface Device {
  id: string;
  device_serial: string;
  firmware_version?: string;
  device_status?: 'online' | 'offline' | 'low_battery' | 'error';
  battery_level?: number;
}

interface DeviceFilterProps {
  value: string;
  onChange: (deviceId: string) => void;
  placeholder?: string;
  className?: string;
  facilityId: string;
  excludeDeviceIds?: string[];
}

export const DeviceFilter: React.FC<DeviceFilterProps> = ({
  value,
  onChange,
  placeholder = 'Search devices...',
  className = '',
  facilityId,
  excludeDeviceIds = [],
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [filteredDevices, setFilteredDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    loadDevices();
  }, [facilityId]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const norm = searchTerm.trim().toLowerCase();
      const next = devices.filter((d) => {
        if (!norm) return true;
        return (
          (d.device_serial || '').toLowerCase().includes(norm) ||
          (d.firmware_version || '').toLowerCase().includes(norm)
        );
      });
      setFilteredDevices(next);
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [searchTerm, devices]);

  useEffect(() => {
    if (value && devices.length > 0) {
      const d = devices.find((x) => x.id === value) || null;
      setSelectedDevice(d);
      if (d) setSearchTerm(d.device_serial || '');
    } else if (value === '') {
      setSelectedDevice(null);
      setSearchTerm('');
    }
  }, [value, devices]);

  // Compute floating dropdown position relative to input
  useLayoutEffect(() => {
    if (!isOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, [isOpen, searchTerm]);

  useEffect(() => {
    if (!isOpen) return;
    const onScrollOrResize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    };
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [isOpen]);

  const loadDevices = async () => {
    if (!facilityId) return;
    try {
      setLoading(true);
      const resp = await apiService.getUnassignedDevices(facilityId);
      let list: Device[] = resp?.devices || [];
      if (excludeDeviceIds?.length) {
        const exclude = new Set(excludeDeviceIds);
        list = list.filter((d) => !exclude.has(d.id));
      }
      setDevices(list);
      setFilteredDevices(list);
    } catch (e) {
      // Silent here; host component handles error toasts
      setDevices([]);
      setFilteredDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputFocus = () => setIsOpen(true);
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

  const handleSelect = (device: Device) => {
    setSelectedDevice(device);
    setSearchTerm(device.device_serial || '');
    onChange(device.id);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <CpuChipIcon className="h-4 w-4 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="block w-full pl-8 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>

      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="z-[9999] bg-white dark:bg-gray-800 shadow-2xl max-h-60 rounded-lg py-1 text-sm ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none border border-gray-200 dark:border-gray-700"
            style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, minWidth: 300 }}
            onMouseDown={(e) => {
              // Prevent input blur when clicking inside the dropdown
              e.preventDefault();
            }}
          >
            {loading ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Loading devices...</div>
            ) : filteredDevices.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                {devices.length === 0 ? 'No unassigned devices available' : 'No devices match your search'}
              </div>
            ) : (
              <>
                {!searchTerm && (
                  <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                    Available Devices ({devices.length})
                  </div>
                )}
                {filteredDevices.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => handleSelect(d)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      selectedDevice?.id === d.id ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100' : 'text-gray-900 dark:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="flex-shrink-0 h-8 w-8 bg-primary-100 dark:bg-primary-900/20 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-primary-800 dark:text-primary-200">
                            {(d.device_serial || 'D').slice(-2)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {d.device_serial || d.id}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {d.firmware_version ? `v${d.firmware_version}` : 'Unknown firmware'}
                          </div>
                          <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {d.id}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400">
                        <div className="text-right">
                          <div className="font-medium">{d.device_status || 'unknown'}</div>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};


