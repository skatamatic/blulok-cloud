# Interactive Facility Site Map

## Overview

The interactive facility site map provides a visual, drag-and-drop interface for managing facility layouts with real-time unit status monitoring. Built with React-Konva for high-performance canvas rendering and smooth interactions.

## Technology Choice: React-Konva

### Why React-Konva Over Alternatives

**React-Konva** was chosen over React Flow, D3, or custom SVG solutions because:

1. **Performance**: Canvas-based rendering handles hundreds of elements smoothly
2. **Interactivity**: Built-in drag & drop, click events, hover states
3. **Customization**: Complete control over shapes, colors, animations
4. **Real-time Updates**: Efficient re-rendering for live status changes
5. **Touch Support**: Works perfectly on tablets and mobile devices
6. **Zoom & Pan**: Native support for navigation controls

### Compared to React Flow
- **React Flow**: Better for node-based workflows, connections, graphs
- **React-Konva**: Better for spatial layouts, floor plans, geometric shapes

## Site Map Features

### Visual Elements

**Unit Rectangles:**
- **Color-coded by status**: Green (available), Blue (occupied), Yellow (maintenance), Purple (reserved)
- **Security indicators**: Red border for unlocked units
- **Click interaction**: Opens detailed unit information panel
- **Drag & drop**: Repositionable in edit mode
- **Real-time updates**: Status changes reflect immediately

**Facility Infrastructure:**
- **Walls**: Gray rectangles for facility boundaries
- **Doors/Gates**: Green rectangles for access points
- **Gateway**: Blue circle with white center for network hub
- **Elevators**: Special rectangular elements for vertical access

### Interactive Features

**Edit Mode:**
- **Tool Palette**: Select, Add Unit, Add Wall, Add Door, Add Gateway
- **Drag & Drop**: Move elements to optimal positions
- **Element Selection**: Click to select and modify properties
- **Delete Function**: Remove unwanted elements
- **Grid Alignment**: Background grid for precise positioning

**View Mode:**
- **Unit Details**: Click units for detailed information panel
- **Real-time Controls**: Lock/unlock units directly from map
- **Status Monitoring**: Visual status indicators
- **Navigation**: Zoom and pan for large facilities

### Data Integration

**Real-time Synchronization:**
- **Unit Status**: Live updates from database
- **Lock Status**: Real-time lock/unlock operations
- **Battery Levels**: Device health monitoring
- **Tenant Information**: Current assignments and details

**Persistent Layouts:**
- **Save Functionality**: Store facility layouts in database
- **Multi-floor Support**: Ready for floor-based navigation
- **Element Properties**: Metadata storage for each element
- **Responsive Design**: Adapts to different screen sizes

## Implementation Architecture

### Component Structure

```
FacilitySiteMapPage
├── Header (Navigation, Edit Toggle, Save)
├── Toolbar (Edit Mode Only)
│   ├── Tool Selection
│   ├── Available Units List
│   └── Element Properties Panel
├── Canvas Area (React-Konva Stage)
│   ├── Grid Background
│   ├── Layout Elements
│   └── Zoom Controls
├── Unit Details Panel
└── Status Legend
```

### Data Models

**FacilityLayoutElement:**
```typescript
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
```

**FacilityLayout:**
```typescript
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
```

## User Workflows

### Site Admin Workflow
1. **Access**: Navigate to Units → Site Map view
2. **View Status**: See all units with color-coded status
3. **Monitor Security**: Identify unlocked units (red borders)
4. **Unit Management**: Click units for details and controls
5. **Layout Updates**: Edit mode for facility changes

### Facility Setup Workflow
1. **Edit Mode**: Toggle edit mode in site map
2. **Add Infrastructure**: Place walls, doors, gateways
3. **Add Units**: Drag units from available list to layout
4. **Position Elements**: Drag to optimal locations
5. **Save Layout**: Persist facility configuration

### Operational Workflow
1. **Status Monitoring**: Real-time visual status updates
2. **Security Response**: Identify and respond to unlocked units
3. **Unit Control**: Lock/unlock units directly from map
4. **Tenant Management**: Access unit details and tenant info
5. **Quick Navigation**: Jump to detailed views

## Performance Considerations

### Optimization Strategies
- **Canvas Rendering**: Efficient for large numbers of elements
- **Event Delegation**: Minimal event listeners for better performance
- **Selective Re-rendering**: Only update changed elements
- **Lazy Loading**: Load unit data on demand
- **Debounced Saves**: Batch layout changes for efficiency

### Scalability
- **Element Limits**: Tested with 100+ units per facility
- **Memory Management**: Efficient object reuse
- **Network Efficiency**: Minimal API calls for status updates
- **Responsive Performance**: Smooth on mobile and desktop

## Future Enhancements

### Planned Features
1. **Multi-floor Support**: Floor selection and navigation
2. **Advanced Tools**: Copy/paste, alignment guides, grouping
3. **Templates**: Pre-built facility layout templates
4. **Import/Export**: CAD file import, layout sharing
5. **Measurement Tools**: Distance and area calculations
6. **3D Visualization**: Optional 3D view for complex facilities

### Integration Opportunities
1. **IoT Sensors**: Temperature, humidity, motion detection
2. **Security Cameras**: Video feed integration
3. **Access Logs**: Visual activity tracking on map
4. **Maintenance Scheduling**: Visual maintenance indicators
5. **Emergency Response**: Evacuation routes and procedures

## Technical Implementation Notes

### React-Konva Best Practices
- **Layer Management**: Separate layers for background, elements, UI
- **Event Handling**: Proper event delegation and cleanup
- **Performance**: Use `Konva.hitFunc` for complex shapes
- **Memory**: Destroy unused objects to prevent leaks

### Integration Points
- **API Endpoints**: Ready for facility layout CRUD operations
- **Real-time Updates**: WebSocket integration for live changes
- **State Management**: Efficient local state with backend sync
- **Error Handling**: Graceful degradation for offline scenarios

This interactive site map provides a significant competitive advantage by offering visual facility management that competitors lack, while maintaining excellent performance and user experience.
