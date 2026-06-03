import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeftIcon,
  EyeIcon,
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { useGlobalFacility } from '@/contexts/GlobalFacilityContext';
import { Unit } from '@/types/facility.types';
import { apiService } from '@/services/api.service';
import { useDetailsBackNavigation } from '@/hooks/useBackNavigation';
import { DetailsPageHeader } from '@/components/Common/DetailsPageLayout';
import { canRequestRemoteUnlock, isLockTransitionPending } from '@/utils/unitLock.utils';
import { lockHardwareFeedbackToasts } from '@/utils/lockHardwareFeedback.constants';
import { useRemoteUnlockAction } from '@/hooks/useRemoteUnlockAction';
import { resolveLockTimeoutMsForUnit } from '@/utils/facilityLockTimeout.utils';

const statusColors = {
  available: 'bg-green-500 border-green-600',
  occupied: 'bg-blue-500 border-blue-600',
  maintenance: 'bg-yellow-500 border-yellow-600',
  reserved: 'bg-purple-500 border-purple-600'
};

const lockStatusColors = {
  locked: 'border-blue-500',
  unlocked: 'border-red-500 border-2',
  error: 'border-red-600 border-2'
};

export default function SimpleSiteMapPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  const { facilities: globalFacilities } = useGlobalFacility();
  const { goBack, showBack, backLabel } = useDetailsBackNavigation({ fallbackPath: '/units' });
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [loading, setLoading] = useState(true);
  const unitsDataRef = useRef<Unit[]>([]);
  unitsDataRef.current = units;
  const { requestUnlock, isSubmitting, syncLockStatus } = useRemoteUnlockAction({
    timeoutToast: lockHardwareFeedbackToasts.unitUnlockTimeout,
  });

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    loadUnits();
  }, []);

  const loadUnits = async () => {
    try {
      const response = await apiService.getUnits({ limit: 100 });
      setUnits(response.units || []);
    } catch (error) {
      console.error('Failed to load units:', error);
    } finally {
      setLoading(false);
    }
  };

  const patchUnitLockOptimistic = (unitId: string, lockStatus: string) => {
    const patch = (list: Unit[]) =>
      list.map((u) =>
        u.id === unitId && u.blulok_device
          ? { ...u, blulok_device: { ...u.blulok_device, lock_status: lockStatus } }
          : u,
      );
    setUnits(patch);
    setSelectedUnit((prev) =>
      prev?.id === unitId && prev.blulok_device
        ? { ...prev, blulok_device: { ...prev.blulok_device, lock_status: lockStatus } }
        : prev,
    );
  };

  const handleRemoteUnlock = async (unit: Unit) => {
    if (!unit.blulok_device || !canManage) return;
    if (!canRequestRemoteUnlock(unit.blulok_device.lock_status)) return;

    const previousStatus = unit.blulok_device.lock_status ?? 'locked';
    let clearTransitionalAfterRefresh = false;

    const refreshAfterUnlockAttempt = async () => {
      await loadUnits();
      if (!clearTransitionalAfterRefresh) return;
      clearTransitionalAfterRefresh = false;
      const revert = (list: Unit[]) =>
        list.map((u) => {
          if (u.id !== unit.id || !u.blulok_device) return u;
          const status = u.blulok_device.lock_status;
          if (status === 'unlocking' || status === 'locking') {
            return {
              ...u,
              blulok_device: { ...u.blulok_device, lock_status: previousStatus },
            };
          }
          return u;
        });
      setUnits(revert);
      setSelectedUnit((prev) => {
        if (prev?.id !== unit.id || !prev.blulok_device) return prev;
        const status = prev.blulok_device.lock_status;
        if (status === 'unlocking' || status === 'locking') {
          return {
            ...prev,
            blulok_device: { ...prev.blulok_device, lock_status: previousStatus },
          };
        }
        return prev;
      });
    };

    await requestUnlock({
      deviceId: unit.blulok_device.id,
      watchKey: unit.id,
      timeoutMs: resolveLockTimeoutMsForUnit(unit, globalFacilities),
      getLockStatus: () => {
        const cur = unitsDataRef.current.find((x) => x.id === unit.id);
        return cur?.blulok_device?.lock_status;
      },
      applyOptimisticUnlocking: () => {
        patchUnitLockOptimistic(unit.id, 'unlocking');
      },
      revertOptimisticLockStatus: (status) => {
        clearTransitionalAfterRefresh = true;
        patchUnitLockOptimistic(unit.id, status);
      },
      refresh: refreshAfterUnlockAttempt,
    });
  };

  useEffect(() => {
    for (const unit of units) {
      if (unit.blulok_device?.lock_status) {
        syncLockStatus(unit.id, unit.blulok_device.lock_status);
      }
    }
  }, [units, syncLockStatus]);

  // Generate a simple grid layout for units
  const generateGridLayout = (units: Unit[]) => {
    const cols = 8; // 8 units per row
    return units.map((unit, index) => ({
      ...unit,
      gridPosition: {
        x: (index % cols) * 80 + 20,
        y: Math.floor(index / cols) * 60 + 20
      }
    }));
  };

  const layoutUnits = generateGridLayout(units);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <DetailsPageHeader
          onBack={showBack ? goBack : undefined}
          backLabel={backLabel}
          title="Facility Site Map"
          subtitle="Visual layout of storage units"
          actions={
            <button
              onClick={() => navigate('/units')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <EyeIcon className="h-4 w-4 mr-2" />
              List View
            </button>
          }
        />
      </div>

      <div className="flex-1 flex">
        {/* Main Canvas */}
        <div className="flex-1 bg-white dark:bg-gray-800 relative overflow-auto">
          <div 
            className="relative min-h-full p-8"
            style={{ 
              backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              minWidth: '800px',
              minHeight: '600px'
            }}
          >
            {/* Facility Outline */}
            <div className="absolute top-8 left-8 w-96 h-80 border-4 border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 opacity-20 rounded-lg"></div>
            
            {/* Units */}
            {loading ? (
              <div className="space-y-4">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute animate-pulse"
                    style={{
                      left: `${(i % 6) * 80 + 40}px`,
                      top: `${Math.floor(i / 6) * 60 + 40}px`,
                      width: '60px',
                      height: '40px'
                    }}
                  >
                    <div className="w-full h-full bg-gray-300 dark:bg-gray-600 rounded"></div>
                  </div>
                ))}
              </div>
            ) : (
              layoutUnits.map((unit) => (
                <div
                  key={unit.id}
                  className={`absolute cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg rounded border-2 ${
                    statusColors[unit.status as keyof typeof statusColors]
                  } ${
                    unit.blulok_device ? lockStatusColors[unit.blulok_device.lock_status as keyof typeof lockStatusColors] : ''
                  }`}
                  style={{
                    left: `${unit.gridPosition.x}px`,
                    top: `${unit.gridPosition.y}px`,
                    width: '60px',
                    height: '40px'
                  }}
                  onClick={() => setSelectedUnit(unit)}
                >
                  <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold bg-black bg-opacity-20 rounded">
                    {unit.unit_number}
                  </div>
                  
                  {/* Security indicator for unlocked units */}
                  {unit.blulok_device?.lock_status === 'unlocked' && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                  )}
                  
                  {/* Low battery indicator */}
                  {unit.blulok_device?.battery_level && unit.blulok_device.battery_level < 20 && (
                    <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-500 rounded-full">
                      <ExclamationTriangleIcon className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unit Details Panel */}
        {selectedUnit && (
          <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Unit {selectedUnit.unit_number}
              </h3>
              <button
                onClick={() => setSelectedUnit(null)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedUnit.status as keyof typeof statusColors]} text-white`}>
                  {selectedUnit.status.charAt(0).toUpperCase() + selectedUnit.status.slice(1)}
                </span>
              </div>

              {selectedUnit.primary_tenant && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Primary Tenant</h4>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {selectedUnit.primary_tenant.first_name} {selectedUnit.primary_tenant.last_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedUnit.primary_tenant.email}
                    </p>
                  </div>
                </div>
              )}


              {selectedUnit.blulok_device && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Device Status</h4>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Lock Status</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        selectedUnit.blulok_device.lock_status === 'locked' 
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }`}>
                        {selectedUnit.blulok_device.lock_status === 'locked' ? 
                          <LockClosedIcon className="h-3 w-3 mr-1" /> : 
                          <LockOpenIcon className="h-3 w-3 mr-1" />
                        }
                        {selectedUnit.blulok_device.lock_status}
                      </span>
                    </div>
                    {selectedUnit.blulok_device.battery_level && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Battery</span>
                        <span className={`text-sm font-medium ${
                          selectedUnit.blulok_device.battery_level < 20 ? 'text-red-500' : 
                          selectedUnit.blulok_device.battery_level < 50 ? 'text-yellow-500' : 'text-green-500'
                        }`}>
                          {selectedUnit.blulok_device.battery_level}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {canManage && (
                <div className="space-y-2">
                  <button
                    onClick={() => navigate(`/units/${selectedUnit.id}`)}
                    className="w-full flex items-center justify-center space-x-2 py-2 px-4 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <EyeIcon className="h-4 w-4" />
                    <span>View Details</span>
                  </button>
                  
                  {selectedUnit.blulok_device && (
                    <button
                      type="button"
                      onClick={() => void handleRemoteUnlock(selectedUnit)}
                      disabled={
                        isLockTransitionPending(selectedUnit.blulok_device.lock_status) ||
                        isSubmitting(selectedUnit.id) ||
                        !canRequestRemoteUnlock(selectedUnit.blulok_device.lock_status)
                      }
                      className={`w-full flex items-center justify-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                        isLockTransitionPending(selectedUnit.blulok_device.lock_status) ||
                        isSubmitting(selectedUnit.id)
                          ? 'bg-blue-600 text-white animate-pulse'
                          : canRequestRemoteUnlock(selectedUnit.blulok_device.lock_status)
                            ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <LockOpenIcon className="h-4 w-4" />
                      <span>
                        {isLockTransitionPending(selectedUnit.blulok_device.lock_status) ||
                        isSubmitting(selectedUnit.id)
                          ? 'Unlocking…'
                          : canRequestRemoteUnlock(selectedUnit.blulok_device.lock_status)
                            ? 'Unlock'
                            : 'Unlocked'}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6 text-xs">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-3 bg-green-500 rounded border"></div>
              <span className="text-gray-600 dark:text-gray-400">Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-3 bg-blue-500 rounded border"></div>
              <span className="text-gray-600 dark:text-gray-400">Occupied</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-3 bg-yellow-500 rounded border"></div>
              <span className="text-gray-600 dark:text-gray-400">Maintenance</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-3 bg-purple-500 rounded border"></div>
              <span className="text-gray-600 dark:text-gray-400">Reserved</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-3 bg-gray-300 border-2 border-red-500 rounded"></div>
              <span className="text-gray-600 dark:text-gray-400">Unlocked</span>
            </div>
          </div>
          
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Click units to view details • Red borders indicate unlocked units
          </div>
        </div>
      </div>
    </div>
  );
}

