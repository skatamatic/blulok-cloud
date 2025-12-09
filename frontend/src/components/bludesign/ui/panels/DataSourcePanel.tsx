/**
 * Data Source Panel
 * 
 * Allows configuring the facility data source for live data binding.
 * Connects the BluDesign diagram to real BluLok facility data.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ServerIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  SignalIcon,
  SignalSlashIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { DataSourceConfig } from '../../core/types';
import { useTheme } from '@/contexts/ThemeContext';
import { getBluLokFacilities, BluLokFacility } from '@/api/bludesign';

interface DataSourcePanelProps {
  config: DataSourceConfig;
  onConfigChange: (config: DataSourceConfig) => void;
  onSimulationModeChange?: (enabled: boolean) => void;
  simulationMode?: boolean;
}

export const DataSourcePanel: React.FC<DataSourcePanelProps> = ({
  config,
  onConfigChange,
  onSimulationModeChange,
  simulationMode = false,
}) => {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  
  const [facilities, setFacilities] = useState<BluLokFacility[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  
  // Load facilities
  const loadFacilities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBluLokFacilities();
      setFacilities(data);
    } catch (err) {
      console.error('Failed to load facilities:', err);
      setError('Failed to load facilities. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    loadFacilities();
  }, [loadFacilities]);
  
  // Update connection status based on config
  useEffect(() => {
    if (config.type === 'none') {
      setConnectionStatus('disconnected');
    } else if (config.type === 'simulated') {
      setConnectionStatus('connected');
    } else if (config.facilityId) {
      setConnectionStatus('connected');
    }
  }, [config]);
  
  const handleFacilitySelect = useCallback((facility: BluLokFacility | null) => {
    if (facility) {
      onConfigChange({
        type: 'blulok',
        facilityId: facility.id,
        facilityName: facility.name,
        autoConnect: true,
        lastSync: new Date(),
      });
    } else {
      onConfigChange({
        type: 'none',
      });
    }
  }, [onConfigChange]);
  
  const handleDisconnect = useCallback(() => {
    onConfigChange({ type: 'none' });
  }, [onConfigChange]);
  
  const handleRefresh = useCallback(async () => {
    await loadFacilities();
    if (config.facilityId) {
      onConfigChange({
        ...config,
        lastSync: new Date(),
      });
    }
  }, [loadFacilities, config, onConfigChange]);
  
  const filteredFacilities = facilities.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.address?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const selectedFacility = facilities.find(f => f.id === config.facilityId);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className={`flex items-center gap-3 p-3 rounded-lg ${
        connectionStatus === 'connected'
          ? isDark ? 'bg-green-900/20 border border-green-700/50' : 'bg-green-50 border border-green-200'
          : connectionStatus === 'error'
            ? isDark ? 'bg-red-900/20 border border-red-700/50' : 'bg-red-50 border border-red-200'
            : isDark ? 'bg-gray-800/50 border border-gray-700/50' : 'bg-gray-100 border border-gray-200'
      }`}>
        {connectionStatus === 'connected' ? (
          <SignalIcon className="w-5 h-5 text-green-500" />
        ) : connectionStatus === 'error' ? (
          <XCircleIcon className="w-5 h-5 text-red-500" />
        ) : (
          <SignalSlashIcon className={`w-5 h-5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
        )}
        <div className="flex-1">
          <div className={`text-sm font-medium ${
            connectionStatus === 'connected'
              ? isDark ? 'text-green-300' : 'text-green-700'
              : connectionStatus === 'error'
                ? isDark ? 'text-red-300' : 'text-red-700'
                : isDark ? 'text-gray-300' : 'text-gray-600'
          }`}>
            {connectionStatus === 'connected'
              ? config.type === 'simulated' ? 'Simulation Mode' : 'Connected'
              : connectionStatus === 'error'
                ? 'Connection Error'
                : 'Not Connected'}
          </div>
          {selectedFacility && connectionStatus === 'connected' && (
            <div className={`text-xs ${isDark ? 'text-green-400/70' : 'text-green-600'}`}>
              {selectedFacility.name}
            </div>
          )}
        </div>
        {connectionStatus === 'connected' && config.type === 'blulok' && (
          <button
            onClick={handleDisconnect}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              isDark
                ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50'
                : 'bg-red-100 text-red-600 hover:bg-red-200'
            }`}
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Mode Selection */}
      <div>
        <label className={`text-xs font-semibold uppercase tracking-wider block mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
          Data Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              config.type === 'blulok' || config.type === 'none'
                ? isDark
                  ? 'bg-primary-600 text-white'
                  : 'bg-primary-500 text-white'
                : isDark
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => {
              if (config.type !== 'blulok') {
                onConfigChange({ type: 'none' });
                onSimulationModeChange?.(false);
              }
            }}
          >
            <ServerIcon className="w-4 h-4" />
            Live Data
          </button>
          <button
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              config.type === 'simulated' || simulationMode
                ? isDark
                  ? 'bg-yellow-600 text-white'
                  : 'bg-yellow-500 text-white'
                : isDark
                  ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            onClick={() => {
              onConfigChange({ type: 'simulated' });
              onSimulationModeChange?.(true);
            }}
          >
            <BeakerIcon className="w-4 h-4" />
            Simulate
          </button>
        </div>
      </div>

      {/* Facility Selection (only shown when in live mode) */}
      {(config.type === 'none' || config.type === 'blulok') && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Select Facility
            </label>
            <button
              onClick={handleRefresh}
              disabled={loading}
              className={`p-1 rounded transition-colors ${
                isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-200'
              } ${loading ? 'animate-spin' : ''}`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative mb-2">
            <MagnifyingGlassIcon className={`absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              placeholder="Search facilities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-8 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                isDark 
                  ? 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500' 
                  : 'bg-white border border-gray-200 text-gray-900 placeholder-gray-400'
              }`}
            />
          </div>
          
          {/* Error */}
          {error && (
            <div className={`p-2 rounded mb-2 text-xs ${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
              {error}
            </div>
          )}
          
          {/* Facility List */}
          <div className={`max-h-48 overflow-y-auto rounded-lg border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            {loading ? (
              <div className={`p-4 text-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                Loading facilities...
              </div>
            ) : filteredFacilities.length === 0 ? (
              <div className={`p-4 text-center text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {searchTerm ? 'No facilities match your search' : 'No facilities available'}
              </div>
            ) : (
              filteredFacilities.map(facility => (
                <button
                  key={facility.id}
                  className={`w-full text-left px-3 py-2.5 border-b last:border-b-0 transition-colors ${
                    config.facilityId === facility.id
                      ? isDark
                        ? 'bg-primary-600/20 border-primary-700/50'
                        : 'bg-primary-50 border-primary-200'
                      : isDark
                        ? 'border-gray-700/50 hover:bg-gray-700/30'
                        : 'border-gray-100 hover:bg-gray-50'
                  }`}
                  onClick={() => handleFacilitySelect(facility)}
                >
                  <div className="flex items-center gap-2">
                    {config.facilityId === facility.id && (
                      <CheckCircleIcon className="w-4 h-4 text-primary-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium truncate ${
                        config.facilityId === facility.id
                          ? 'text-primary-500'
                          : isDark ? 'text-gray-200' : 'text-gray-800'
                      }`}>
                        {facility.name}
                      </div>
                      {facility.address && (
                        <div className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          {facility.address}
                          {facility.city && `, ${facility.city}`}
                          {facility.state && `, ${facility.state}`}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Simulation Mode Info */}
      {(config.type === 'simulated' || simulationMode) && (
        <div className={`p-3 rounded-lg ${isDark ? 'bg-yellow-900/20 border border-yellow-700/50' : 'bg-yellow-50 border border-yellow-200'}`}>
          <div className={`flex items-start gap-2 ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
            <BeakerIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium">Simulation Mode</div>
              <div className={`text-xs mt-1 ${isDark ? 'text-yellow-400/70' : 'text-yellow-600'}`}>
                Use the Properties panel to manually set asset states for preview.
                No live data connection is required.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Last Sync Info */}
      {config.lastSync && config.type === 'blulok' && (
        <div className={`text-xs ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Last synced: {config.lastSync.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default DataSourcePanel;

