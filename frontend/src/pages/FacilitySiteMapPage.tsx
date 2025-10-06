import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
// import { Stage, Layer, Rect, Text, Circle, Line, Group } from 'react-konva';
import { 
  ArrowLeftIcon,
  PlusIcon,
  TrashIcon,
  HomeIcon,
  ServerIcon,
  BoltIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  LockClosedIcon,
  LockOpenIcon,
  MapIcon
} from '@heroicons/react/24/outline';
import { useAuth } from '@/contexts/AuthContext';
import { Unit } from '@/types/facility.types';
import { apiService } from '@/services/api.service';

const statusColors = {
  available: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  occupied: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  maintenance: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400',
  reserved: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400',
  locked: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400',
  unlocked: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
};

interface FacilityLayoutElement {
  id: string;
  type: 'unit' | 'wall' | 'door' | 'gateway' | 'path' | 'elevator';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  properties: {
    unitId?: string;
    unitNumber?: string;
    status?: string;
    lockStatus?: string;
    label?: string;
    color?: string;
  };
}

interface FacilityLayout {
  id: string;
  facilityId: string;
  name: string;
  elements: FacilityLayoutElement[];
  canvasSize: { width: number; height: number };
  scale: number;
  floors: number;
  currentFloor: number;
}

export default function FacilitySiteMapPage() {
  const navigate = useNavigate();
  const { authState } = useAuth();
  // const stageRef = useRef<any>(null);
  
  const [layout, setLayout] = useState<FacilityLayout>({
    id: 'layout-1',
    facilityId: 'facility-1',
    name: 'Downtown Storage Layout',
    elements: [],
    canvasSize: { width: 1200, height: 800 },
    scale: 1,
    floors: 1,
    currentFloor: 1
  });
  
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [toolMode, setToolMode] = useState<'select' | 'unit' | 'wall' | 'door' | 'gateway'>('select');
  const [selectedUnit] = useState<Unit | null>(null);
  const [showUnitDetails, setShowUnitDetails] = useState(false);

  const canManage = ['admin', 'dev_admin', 'facility_admin'].includes(authState.user?.role || '');

  useEffect(() => {
    loadUnits();
    loadLayout();
  }, []);

  const loadUnits = async () => {
    try {
      const response = await apiService.getUnits({ limit: 100 });
      setUnits(response.units || []);
    } catch (error) {
      console.error('Failed to load units:', error);
    }
  };

  const handleLockToggle = async (unit: Unit) => {
    if (!unit.blulok_device || !canManage) return;
    
    try {
      const newStatus = unit.blulok_device.lock_status === 'locked' ? 'unlocked' : 'locked';
      await apiService.updateLockStatus(unit.blulok_device.id, newStatus);
      
      // Update the layout element
      setLayout(prev => ({
        ...prev,
        elements: prev.elements.map(element => 
          element.properties.unitId === unit.id 
            ? { ...element, properties: { ...element.properties, lockStatus: newStatus } }
            : element
        )
      }));
      
      // Refresh unit data
      await loadUnits();
    } catch (error) {
      console.error('Failed to toggle lock:', error);
    }
  };

  const loadLayout = async () => {
    // For now, generate a sample layout
    const sampleElements: FacilityLayoutElement[] = [
      // Walls
      { id: 'wall-1', type: 'wall', x: 50, y: 50, width: 300, height: 10, properties: { color: '#6B7280' } },
      { id: 'wall-2', type: 'wall', x: 50, y: 50, width: 10, height: 200, properties: { color: '#6B7280' } },
      { id: 'wall-3', type: 'wall', x: 350, y: 50, width: 10, height: 200, properties: { color: '#6B7280' } },
      { id: 'wall-4', type: 'wall', x: 50, y: 250, width: 300, height: 10, properties: { color: '#6B7280' } },
      
      // Gateway
      { id: 'gateway-1', type: 'gateway', x: 200, y: 30, width: 40, height: 20, properties: { label: 'Gateway', color: '#3B82F6' } },
      
      // Doors
      { id: 'door-1', type: 'door', x: 150, y: 50, width: 30, height: 10, properties: { label: 'Main Entry', color: '#10B981' } },
      
      // Sample units
      { id: 'unit-1', type: 'unit', x: 80, y: 80, width: 60, height: 40, properties: { unitNumber: 'A-101', status: 'occupied', lockStatus: 'locked' } },
      { id: 'unit-2', type: 'unit', x: 160, y: 80, width: 60, height: 40, properties: { unitNumber: 'A-102', status: 'available', lockStatus: 'locked' } },
      { id: 'unit-3', type: 'unit', x: 240, y: 80, width: 60, height: 40, properties: { unitNumber: 'A-103', status: 'maintenance', lockStatus: 'unlocked' } },
      { id: 'unit-4', type: 'unit', x: 80, y: 140, width: 60, height: 40, properties: { unitNumber: 'A-201', status: 'reserved', lockStatus: 'locked' } },
      { id: 'unit-5', type: 'unit', x: 160, y: 140, width: 60, height: 40, properties: { unitNumber: 'A-202', status: 'occupied', lockStatus: 'unlocked' } },
      { id: 'unit-6', type: 'unit', x: 240, y: 140, width: 60, height: 40, properties: { unitNumber: 'A-203', status: 'available', lockStatus: 'locked' } },
    ];
    
    setLayout(prev => ({ ...prev, elements: sampleElements }));
  };

  // const handleStageClick = (e: any) => {
  //   if (toolMode === 'select') {
  //     // Check if clicking on an element
  //     const clickedOnElement = e.target !== e.target.getStage();
  //     if (!clickedOnElement) {
  //       setSelectedElement(null);
  //     }
  //   } else if (isEditing && (toolMode === 'unit' || toolMode === 'wall' || toolMode === 'door' || toolMode === 'gateway')) {
  //     // Add new element
  //     const pos = e.target.getStage().getPointerPosition();
  //     addElement(toolMode, pos.x, pos.y);
  //   }
  // };

  // const addElement = (type: string, x: number, y: number) => {
  //   const newElement: FacilityLayoutElement = {
  //     id: `${type}-${Date.now()}`,
  //     type: type as any,
  //     x,
  //     y,
  //     width: type === 'unit' ? 60 : type === 'wall' ? 100 : type === 'door' ? 30 : 40,
  //     height: type === 'unit' ? 40 : type === 'wall' ? 10 : type === 'door' ? 10 : 20,
  //     properties: {
  //       label: type === 'unit' ? 'New Unit' : type.charAt(0).toUpperCase() + type.slice(1),
  //       color: type === 'unit' ? '#E5E7EB' : type === 'wall' ? '#6B7280' : '#10B981'
  //     }
  //   };

  //   setLayout(prev => ({
  //     ...prev,
  //     elements: [...prev.elements, newElement]
  //   }));
  // };

  // const handleElementClick = (elementId: string) => {
  //   setSelectedElement(elementId);
  //   const element = layout.elements.find(e => e.id === elementId);
  //   
  //   if (element?.type === 'unit') {
  //     // Find corresponding unit data
  //     const unitData = units.find(u => u.unit_number === element.properties.unitNumber);
  //     if (unitData) {
  //       setSelectedUnit(unitData);
  //       setShowUnitDetails(true);
  //     }
  //   }
  // };

  // const getElementColor = (element: FacilityLayoutElement) => {
  //   if (element.type === 'unit') {
  //     switch (element.properties.status) {
  //       case 'occupied': return '#3B82F6'; // Blue
  //       case 'available': return '#10B981'; // Green
  //       case 'maintenance': return '#F59E0B'; // Yellow
  //       case 'reserved': return '#8B5CF6'; // Purple
  //       default: return '#E5E7EB'; // Gray
  //     }
  //   }
  //   return element.properties.color || '#6B7280';
  // };

  // const getElementStroke = (element: FacilityLayoutElement) => {
  //   if (element.id === selectedElement) return '#147FD4';
  //   if (element.type === 'unit' && element.properties.lockStatus === 'unlocked') return '#EF4444';
  //   return undefined;
  // };

  // const renderElement = (element: FacilityLayoutElement) => {
  //   const isSelected = element.id === selectedElement;
  //   
  //   return (
  //     <Group key={element.id} draggable={isEditing && isSelected}>
  //       <Rect
  //         x={element.x}
  //         y={element.y}
  //         width={element.width}
  //         height={element.height}
  //         fill={getElementColor(element)}
  //         stroke={getElementStroke(element)}
  //         strokeWidth={isSelected ? 3 : element.properties.lockStatus === 'unlocked' ? 2 : 1}
  //         onClick={() => handleElementClick(element.id)}
  //         onTap={() => handleElementClick(element.id)}
  //       />
  //       
  //       {element.type === 'unit' && (
  //         <Text
  //           x={element.x + 5}
  //           y={element.y + element.height / 2 - 6}
  //           text={element.properties.unitNumber || 'Unit'}
  //           fontSize={10}
  //           fill="white"
  //           fontStyle="bold"
  //         />
  //       )}
  //       
  //       {element.type === 'gateway' && (
  //         <Circle
  //           x={element.x + element.width / 2}
  //           y={element.y + element.height / 2}
  //           radius={8}
  //           fill="#FFFFFF"
  //           stroke={element.properties.color}
  //           strokeWidth={2}
  //         />
  //       )}
  //       
  //       {element.properties.label && element.type !== 'unit' && (
  //         <Text
  //           x={element.x}
  //           y={element.y - 15}
  //           text={element.properties.label}
  //           fontSize={10}
  //           fill="#374151"
  //         />
  //       )}
  //     </Group>
  //   );
  // };

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/units')}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Facility Site Map</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{layout.name}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {canManage && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={`inline-flex items-center px-4 py-2 border text-sm font-medium rounded-lg transition-colors ${
                  isEditing
                    ? 'border-primary-300 text-primary-700 bg-primary-50 dark:border-primary-600 dark:text-primary-400 dark:bg-primary-900/20'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700'
                }`}
              >
                <PencilIcon className="h-4 w-4 mr-2" />
                {isEditing ? 'Exit Edit' : 'Edit Layout'}
              </button>
            )}
            
            <button
              onClick={() => navigate('/units')}
              className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <EyeIcon className="h-4 w-4 mr-2" />
              List View
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Toolbar */}
        {isEditing && (
          <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">Tools</h3>
            
            <div className="space-y-2">
              {[
                { key: 'select', label: 'Select', icon: ArrowLeftIcon },
                { key: 'unit', label: 'Add Unit', icon: HomeIcon },
                { key: 'wall', label: 'Add Wall', icon: PlusIcon },
                { key: 'door', label: 'Add Door', icon: BoltIcon },
                { key: 'gateway', label: 'Add Gateway', icon: ServerIcon },
              ].map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setToolMode(key as any)}
                  className={`w-full flex items-center space-x-2 px-3 py-2 text-sm rounded-lg transition-colors ${
                    toolMode === key
                      ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Available Units */}
            <div className="mt-6">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Available Units</h4>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {units.filter(unit => !layout.elements.some(e => e.properties.unitId === unit.id)).slice(0, 10).map((unit) => (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between p-2 text-xs bg-gray-50 dark:bg-gray-700 rounded hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer"
                    onClick={() => {
                      // Add unit to layout
                      const newElement: FacilityLayoutElement = {
                        id: `unit-${unit.id}`,
                        type: 'unit',
                        x: 100 + Math.random() * 200,
                        y: 100 + Math.random() * 200,
                        width: 60,
                        height: 40,
                        properties: {
                          unitId: unit.id,
                          unitNumber: unit.unit_number,
                          status: unit.status,
                          lockStatus: unit.blulok_device?.lock_status || 'locked'
                        }
                      };
                      setLayout(prev => ({ ...prev, elements: [...prev.elements, newElement] }));
                    }}
                  >
                    <span>Unit {unit.unit_number}</span>
                    <span className={`px-1 py-0.5 rounded text-xs ${statusColors[unit.status as keyof typeof statusColors]}`}>
                      {unit.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Element Properties */}
            {selectedElement && (
              <div className="mt-6">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Properties</h4>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      setLayout(prev => ({
                        ...prev,
                        elements: prev.elements.filter(e => e.id !== selectedElement)
                      }));
                      setSelectedElement(null);
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                    <span>Delete Element</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Canvas Area - Temporarily using HTML/CSS instead of Konva */}
        <div className="flex-1 bg-white dark:bg-gray-800 relative overflow-hidden">
          <div 
            className="w-full h-full border border-gray-200 dark:border-gray-700 relative bg-gray-50 dark:bg-gray-900"
            style={{ 
              backgroundImage: 'radial-gradient(circle, #e5e7eb 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
          >
            {/* Temporary message about site map */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <MapIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  Interactive Site Map Coming Soon
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md">
                  The visual facility layout editor is being updated for React 18 compatibility. 
                  For now, use the grid and table views in the Units page.
                </p>
                <button
                  onClick={() => navigate('/units')}
                  className="inline-flex items-center px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <ArrowLeftIcon className="h-4 w-4 mr-2" />
                  Back to Units
                </button>
              </div>
            </div>
          </div>

          {/* Zoom Controls */}
          <div className="absolute bottom-4 right-4 flex flex-col space-y-2">
            <button
              onClick={() => setLayout(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 3) }))}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <PlusIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button
              onClick={() => setLayout(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.5) }))}
              className="p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="text-gray-600 dark:text-gray-400 font-bold">−</span>
            </button>
          </div>

          {/* Instructions */}
          {isEditing && (
            <div className="absolute top-4 left-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                {toolMode === 'select' ? 'Click and drag elements to move them' :
                 toolMode === 'unit' ? 'Click to place a new unit' :
                 `Click to place a new ${toolMode}`}
              </p>
            </div>
          )}
        </div>

        {/* Unit Details Panel */}
        {showUnitDetails && selectedUnit && (
          <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Unit {selectedUnit.unit_number}
              </h3>
              <button
                onClick={() => setShowUnitDetails(false)}
                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusColors[selectedUnit.status]}`}>
                  {selectedUnit.status}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Size</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{selectedUnit.size_sqft} sq ft</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Rate</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">${selectedUnit.monthly_rate}/mo</p>
                </div>
              </div>

              {selectedUnit.blulok_device && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Device Status</h4>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Lock Status</span>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${statusColors[selectedUnit.blulok_device.lock_status as keyof typeof statusColors]}`}>
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
                      onClick={() => handleLockToggle(selectedUnit)}
                      className={`w-full flex items-center justify-center space-x-2 py-2 px-4 text-sm font-medium rounded-lg transition-colors ${
                        selectedUnit.blulok_device.lock_status === 'locked'
                          ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/20 dark:text-red-400'
                      }`}
                    >
                      {selectedUnit.blulok_device.lock_status === 'locked' ? 
                        <LockOpenIcon className="h-4 w-4" /> : 
                        <LockClosedIcon className="h-4 w-4" />
                      }
                      <span>{selectedUnit.blulok_device.lock_status === 'locked' ? 'Unlock' : 'Lock'}</span>
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
              <div className="w-3 h-3 bg-green-500 rounded"></div>
              <span className="text-gray-600 dark:text-gray-400">Available</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-blue-500 rounded"></div>
              <span className="text-gray-600 dark:text-gray-400">Occupied</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-yellow-500 rounded"></div>
              <span className="text-gray-600 dark:text-gray-400">Maintenance</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-purple-500 rounded"></div>
              <span className="text-gray-600 dark:text-gray-400">Reserved</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 border-2 border-red-500 rounded bg-transparent"></div>
              <span className="text-gray-600 dark:text-gray-400">Unlocked</span>
            </div>
          </div>
          
          {isEditing && (
            <button
              onClick={() => {
                // Save layout
                setIsEditing(false);
              }}
              className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <CheckIcon className="h-4 w-4 mr-2" />
              Save Layout
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
