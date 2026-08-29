# Facility Frontend Architecture

## Overview

The facility management frontend provides a comprehensive, hierarchical view of the storage facility ecosystem with intuitive navigation and smart cross-linking between related data. The system is designed with a beautiful, modern UI that showcases the facility hierarchy while maintaining excellent user experience.

## Hierarchical Data Structure

```
Facility
├── Gateway (1)
├── Access Control Devices (0-N)
│   ├── Gates
│   ├── Elevators
│   └── Doors
├── Units (0-N)
│   ├── Primary Tenant
│   ├── Shared Tenants
│   └── BluLok Device (1:1)
└── Statistics & Monitoring
```

## Page Architecture

### 1. Facilities Overview (`/facilities`)

**Purpose**: Card-based overview of all facilities with filtering and search
**Features**:
- Beautiful facility cards with branding images
- Real-time statistics (units, occupancy, device status)
- Advanced filtering (status, search)
- Smart sorting options
- Role-based access control
- Responsive grid layout

**Cross-linking**:
- Click facility card → Facility Details
- Quick actions to devices/units
- Status indicators link to problem areas

### 2. Facility Details (`/facilities/:id`)

**Purpose**: Comprehensive facility management with tabbed interface
**Features**:
- Tabbed interface (Overview, Devices, Units, Schedules, Access Groups / Access Codes, FMS, Provisioning Data, Gateway)
- **Devices** and **Units** tabs: **Cards** vs **Table** toggle (shared `ViewModeToggle`); table columns are sortable and use the same list APIs as global Devices/Units pages (including pagination).
- **Schedules → User Schedules:** sortable table (same chrome as Units/Devices). Loads every facility tenant/maintenance user by paging `GET /users` (default page size is 20; the tab requests 200 and follows `total`) and merges co-tenants from the units list. Assignments come from one `GET /facilities/:id/user-schedules` call, not per-user schedule fetches.
- **Searchable entity pickers:** `UnitFilter`, `UserFilter`, and `DeviceFilter` typeahead comboboxes (paged API, not native `<select>`). Always pass the selected `facilityId`. `DeviceFilter` `list="unassigned"` is the assignment picker; `list="facility"` lists operational devices at that facility (`ExpandableFilters` `type: 'device'`). Applied selections use `AppliedFilterBar` (dismissible chips + **Clear all**) — Session trace is the first consumer. Gateway **Session trace** uses Unit + User plus a progressive Time control (after and/or before date+time; sessions match by interval overlap and stay whole). With a unit selected, User is `allowedUsers` from that unit’s events. Removing the unit chip clears User, not Time. The trace workspace switches Sessions / Events / NDJSON over live **and** historical snapshot data. Copy dump is the snapshot, not the filtered view.
- Gateway status monitoring
- Device hierarchy visualization
- Unit management interface
- Real-time lock controls
- Statistics dashboard

**Simplified UI** (`users.simplified_ui` / `usesSimplifiedUi()` — facility_admin only, presentation-only):
- **Hidden tabs:** Gateway, Access Groups, Access Codes (deep links redirect to Facility overview)
- **Facility overview:** Gateway status card and “Manage gateway” device actions hidden
- **FMS tab:** `FacilityFMSSimplifiedView` — no provider configuration / webhook feed / sync sidebar; Test Connection + Sync Now on the history card; Review actions on pending rows; `fms_sync_status` + `fms_sync_progress` refresh the history grid inline
- See [auth.md](./auth.md) for the preference flag

**Cross-linking**:
- Device cards → Device details
- Unit cards → Unit management
- Gateway status → Device dashboard
- Minimized quick links; navigation primarily via card click

### 3. Devices Overview (`/devices`)

**Purpose**: Unified device monitoring across all facilities
**Features**:
- **Cards** and **Table** view modes; cards force name-ascending fetch; table supports per-column sort with server-side ordering. Combined device types (`all`) use merge-then-sort-then-paginate on the backend (`merged-device-list.utils`).
- Device type filtering (Access Control, BluLok)
- Status monitoring and filtering
- Real-time lock controls
- Battery level monitoring
- Search and advanced filtering

**Cross-linking**:
- Device cards → Parent facility
- BluLok devices → Associated units
- Facility filtering integration
- Status alerts → Problem resolution

### 4. Units Management (`/units`)

**Purpose**: Comprehensive unit and tenant management
**Features**:
- Cards, table, and site-map entry points; cards force `unit_number` ascending with **natural** numeric ordering (e.g. Unit 2 before Unit 10). Table columns are sortable (`tenant_last_name`, `lock_status`, `battery_level`, etc.) via whitelisted `sortBy` on the units API.
- Tenant assignment visualization
- Lock status and control
- Unit filtering and search
- Occupancy tracking
- Feature and amenity display

**Cross-linking**:
- Unit cards → Unit details (facility link removed on cards)
- Tenant info → User management
- Device status → Device controls
- "My Units" for tenants

## Smart Cross-Linking System

### Navigation Patterns

1. **Breadcrumb Navigation**: Clear hierarchical paths
2. **Context-Aware Actions**: Related actions based on current view
3. **Quick Links**: Jump between related entities
4. **State Preservation**: Maintain filters when navigating

### Cross-Reference Features

- **Facility Cards**: Link to devices, units, and details
- **Device Cards**: Link to parent facility and associated units
 - **Unit Cards**: Link to unit details, tenant info, and device controls
- **Status Indicators**: Direct links to problem resolution
- **Search Integration**: Global search with entity linking

## UI/UX Principles

### Visual Hierarchy

1. **Card-Based Design**: Clean, scannable information cards
2. **Status Colors**: Consistent color coding across all views
3. **Icon System**: Intuitive icons for different entity types
4. **Progressive Disclosure**: Show summary, expand for details

### Interactive Elements

1. **Hover States**: Subtle animations and feedback
2. **Real-time Updates**: Live status and control updates
3. **Loading States**: Skeleton screens and progress indicators
4. **Error Handling**: Graceful error states with recovery options

### Responsive Design

1. **Mobile-First**: Optimized for all screen sizes
2. **Adaptive Layouts**: Grid/list toggles for different contexts
3. **Touch-Friendly**: Large tap targets and gestures
4. **Accessibility**: Full keyboard navigation and screen reader support

## Role-Based Views

### Admin/Dev Admin
- Full access to all facilities and controls
- Device management and configuration
- Tenant assignment and management
- System-wide monitoring and alerts

### Facility Admin
- Scoped to assigned facilities only
- Unit and tenant management
- Device monitoring and control
- Facility-specific reporting

### Tenant
- "My Units" view with assigned units only
- Lock status monitoring
- Basic unit information
- Simplified interface

## Real-Time Features

### Live Status Updates
- Device online/offline status
- Lock status changes
- Battery level monitoring
- Occupancy changes

### Interactive Controls
- One-click lock/unlock controls
- Status change confirmations
- Real-time feedback
- Error handling and retry

## Performance Optimizations

### Data Loading
- Lazy loading for large datasets
- Pagination with "load more"
- Efficient filtering and search
- Cached facility data

### UI Performance
- Virtual scrolling for large lists
- Optimized re-renders
- Image lazy loading
- Skeleton loading states

## Integration Points

### API Services
- Centralized API service layer
- Error handling and retry logic
- Request/response transformation
- Authentication integration

### State Management
- Local component state for UI
- Context for global state
- Optimistic updates for controls
- Error boundary handling

## Future Enhancements

### Planned Features
1. **Real-time Notifications**: WebSocket integration for live updates
2. **Advanced Analytics**: Facility usage patterns and insights
3. **Mobile App**: Native mobile experience
4. **Offline Support**: Progressive Web App capabilities
5. **Advanced Search**: Full-text search across all entities
6. **Bulk Operations**: Multi-select and batch actions
7. **Custom Dashboards**: User-configurable views
8. **Audit Logging**: Activity tracking and history

### Technical Improvements
1. **GraphQL Integration**: More efficient data fetching
2. **Service Workers**: Background sync and caching
3. **Advanced Filtering**: Saved filters and custom views
4. **Export/Import**: Data export and reporting
5. **Third-party Integrations**: External system connections

## Real-time data (WebSocket)

Aggregate REST snapshots (facility stats, histogram buckets, dashboard stats scoped to one facility) are **signals to refetch**, not live payloads. Use `useLockDeviceRealtime` or an `activity` subscription with debounced REST reload.

| Surface | Subscription | Refresh strategy |
|---------|--------------|------------------|
| Facility overview stats sidebar | `device_status`, `units` (facility-scoped) | Debounced `getFacility` background reload |
| Device groups / access codes device lists | Same | Reload `deviceHierarchy` via background `getFacility` |
| Devices / Units tabs | `device_status`, `units` | Debounced list API reload (existing) |
| Gateway card | `gateway_status` + live status hook | See `cursorDocs/gateway-integration.md` |
| Dashboard stats widgets | `general_stats` (all facilities) or `device_status`/`units` (single facility) | WS payload vs debounced REST |
| Unlocked units / units manager widgets | `device_status`, `units` | Debounced REST via `useUnitsData` / widget hook |
| Activity monitor, histogram, access history | `activity` (with `facility_id` when scoped) | Debounced REST |
| Lock status, battery, gates, notifications | `device_status`, `battery_status`, etc. | Direct WS or `useLockDeviceRealtime` |
| Access Groups / Access Codes tab (push badge + codes) | `access_code_push_state` (`facility_id` required; ADMIN / DEV_ADMIN / FACILITY_ADMIN + facility RBAC) | Live push-state payload; debounced REST `getEffectiveAccessCodes` when `refresh_effective_codes` |

**App vs admin access codes:** dashboard widget `access_codes` is for entitled user keypad codes. Admin Access Groups use `access_code_push_state` for gateway push outbox status and effective-code refresh nudges.
## Testing Strategy

### Unit Tests
- Component rendering and behavior
- API service layer testing
- Utility function testing
- Error handling verification

### Integration Tests
- Cross-page navigation flows
- API integration testing
- Authentication flows
- Role-based access testing

### E2E Tests
- Complete user workflows
- Cross-browser compatibility
- Mobile responsiveness
- Performance benchmarks

This architecture provides a solid foundation for managing complex facility hierarchies while maintaining an intuitive and beautiful user experience. The smart cross-linking system ensures users can efficiently navigate between related data, while the role-based views provide appropriate access control and simplified interfaces for different user types.

