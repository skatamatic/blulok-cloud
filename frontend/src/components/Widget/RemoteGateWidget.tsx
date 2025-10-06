import { useState, useEffect } from 'react';
import { 
  BoltIcon,
  PlayIcon,
  StopIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { Widget } from './Widget';
import { WidgetSize } from './WidgetSizeDropdown';

interface GateDevice {
  id: string;
  name: string;
  facility: string;
  status: 'online' | 'offline' | 'error';
  isOpen: boolean;
  lastActivity: Date;
  holdUntil?: Date;
}

interface RemoteGateWidgetProps {
  id: string;
  title: string;
  initialSize?: WidgetSize;
  availableSizes?: WidgetSize[];
  onGridSizeChange?: (gridSize: { w: number; h: number }) => void;
  onRemove?: () => void;
  facilityFilter?: string;
}

// Mock gate devices
const generateMockGates = (): GateDevice[] => {
  return [
    {
      id: 'gate-1',
      name: 'Main Entrance',
      facility: 'Downtown Storage',
      status: 'online',
      isOpen: false,
      lastActivity: new Date(Date.now() - 15 * 60 * 1000) // 15 minutes ago
    },
    {
      id: 'gate-2', 
      name: 'Loading Dock',
      facility: 'Downtown Storage',
      status: 'online',
      isOpen: false,
      lastActivity: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
    },
    {
      id: 'gate-3',
      name: 'Vehicle Gate',
      facility: 'Warehouse District',
      status: 'offline',
      isOpen: false,
      lastActivity: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
    }
  ];
};

export const RemoteGateWidget: React.FC<RemoteGateWidgetProps> = ({
  id,
  title,
  initialSize = 'medium',
  availableSizes = ['medium', 'large'],
  onGridSizeChange,
  onRemove,
  facilityFilter
}) => {
  const [size, setSize] = useState<WidgetSize>(initialSize);
  const [gates, setGates] = useState<GateDevice[]>([]);
  const [selectedGate, setSelectedGate] = useState<string>('');
  const [isOperating, setIsOperating] = useState(false);
  const [holdDuration, setHoldDuration] = useState<number>(5); // minutes

  useEffect(() => {
    loadGates();
    // Update gate status every 30 seconds
    const interval = setInterval(loadGates, 30000);
    return () => clearInterval(interval);
  }, [facilityFilter]);

  useEffect(() => {
    // Auto-select first online gate
    if (gates.length > 0 && !selectedGate) {
      const onlineGate = gates.find(g => g.status === 'online');
      if (onlineGate) {
        setSelectedGate(onlineGate.id);
      }
    }
  }, [gates, selectedGate]);

  const loadGates = async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 200));
    const mockGates = generateMockGates();
    setGates(mockGates);
  };

  const handleGateOperation = async (operation: 'open' | 'close' | 'hold') => {
    const gate = gates.find(g => g.id === selectedGate);
    if (!gate || gate.status !== 'online') return;

    setIsOperating(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setGates(prev => prev.map(g => 
      g.id === selectedGate 
        ? { 
            ...g, 
            isOpen: operation === 'open' || operation === 'hold',
            lastActivity: new Date(),
            holdUntil: operation === 'hold' ? new Date(Date.now() + holdDuration * 60 * 1000) : undefined
          }
        : g
    ));
    
    setIsOperating(false);
  };

  const selectedGateData = gates.find(g => g.id === selectedGate);
  const onlineGates = gates.filter(g => g.status === 'online');

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online':
        return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      case 'offline':
        return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      default:
        return <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" />;
    }
  };

  const formatLastActivity = (timestamp: Date) => {
    const diffMs = Date.now() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <Widget
      id={id}
      title={title}
      size={size}
      availableSizes={availableSizes}
      onSizeChange={setSize}
      onGridSizeChange={onGridSizeChange}
      onRemove={onRemove}
      enhancedMenu={
        <div className="space-y-1">
          <div className="px-3 py-2">
            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
              Hold Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="60"
              value={holdDuration}
              onChange={(e) => setHoldDuration(parseInt(e.target.value) || 5)}
              className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      }
    >
      {size === 'medium' ? (
        /* Compact gate control for medium widgets */
        <div className="h-full flex flex-col justify-center">
          {selectedGateData && selectedGateData.status === 'online' ? (
            <div className="text-center space-y-2">
              <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {selectedGateData.name}
              </div>
              <div className={`text-xs px-2 py-1 rounded-full ${
                selectedGateData.isOpen 
                  ? 'bg-green-600 text-white dark:bg-green-600'
                  : 'bg-gray-600 text-white dark:bg-gray-600'
              }`}>
                {selectedGateData.isOpen ? 'Open' : 'Closed'}
              </div>
              <button
                onClick={() => handleGateOperation(selectedGateData.isOpen ? 'close' : 'open')}
                disabled={isOperating}
                className={`w-full py-2 px-3 text-xs font-medium rounded-lg transition-colors text-white ${
                  selectedGateData.isOpen
                    ? 'bg-red-600 hover:bg-red-700 disabled:bg-gray-400'
                    : 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400'
                } disabled:cursor-not-allowed`}
              >
                {isOperating ? '...' : (selectedGateData.isOpen ? 'Close' : 'Open')}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <BoltIcon className="h-6 w-6 text-gray-400 mx-auto mb-1" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {onlineGates.length === 0 ? 'No gates online' : 'Select gate'}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Full gate control for large widgets */
        <div className="space-y-2 h-full flex flex-col">
        {/* Gate Selection */}
        <div>
          <select
            value={selectedGate}
            onChange={(e) => setSelectedGate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          >
            <option value="">Choose a gate</option>
            {gates.map((gate) => (
              <option key={gate.id} value={gate.id}>
                {gate.name} - {gate.facility}
              </option>
            ))}
          </select>
        </div>

        {/* Gate Status */}
        {selectedGateData && (
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                {getStatusIcon(selectedGateData.status)}
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedGateData.name}
                </span>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${
                selectedGateData.isOpen 
                  ? 'bg-green-600 text-white dark:bg-green-600'
                  : 'bg-gray-600 text-white dark:bg-gray-600'
              }`}>
                {selectedGateData.isOpen ? 'Open' : 'Closed'}
              </span>
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Last activity: {formatLastActivity(selectedGateData.lastActivity)}
            </div>

            {selectedGateData.holdUntil && (
              <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                Holding open until {selectedGateData.holdUntil.toLocaleTimeString()}
              </div>
            )}
          </div>
        )}

        {/* Control Buttons */}
        <div className="flex-1 flex flex-col justify-end">
          {selectedGateData ? (
            selectedGateData.status === 'online' ? (
              <div className="space-y-2">
                <button
                  onClick={() => handleGateOperation('open')}
                  disabled={isOperating || selectedGateData.isOpen}
                  className="w-full flex items-center justify-center space-x-2 py-3 px-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors disabled:cursor-not-allowed"
                >
                  <PlayIcon className="h-5 w-5" />
                  <span>{isOperating ? 'Opening...' : 'Open Once'}</span>
                </button>
                
                <button
                  onClick={() => handleGateOperation('hold')}
                  disabled={isOperating}
                  className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed"
                >
                  <ClockIcon className="h-4 w-4" />
                  <span>{isOperating ? 'Setting...' : `Hold Open (${holdDuration}m)`}</span>
                </button>

                {selectedGateData.isOpen && (
                  <button
                    onClick={() => handleGateOperation('close')}
                    disabled={isOperating}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed"
                  >
                    <StopIcon className="h-4 w-4" />
                    <span>{isOperating ? 'Closing...' : 'Close Gate'}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-sm text-red-600 dark:text-red-400">Gate offline</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Cannot operate gate remotely
                </p>
              </div>
            )
          ) : (
            <div className="text-center py-4">
              <BoltIcon className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Select a gate to control</p>
              {onlineGates.length === 0 && (
                <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                  No gates online
                </p>
              )}
            </div>
          )}
        </div>

        {/* Quick Stats for larger widgets */}
        {(size === 'large' || size === 'huge' || size.includes('wide')) && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {gates.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Total</div>
              </div>
              <div>
                <div className="text-lg font-bold text-green-600 dark:text-green-400">
                  {onlineGates.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Online</div>
              </div>
              <div>
                <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {gates.filter(g => g.isOpen).length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Open</div>
              </div>
            </div>
          </div>
        )}
        </div>
      )}
    </Widget>
  );
};
