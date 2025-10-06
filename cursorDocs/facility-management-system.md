# Facility Management System

## Overview

A comprehensive facility management system with beautiful, intuitive interfaces for creating and managing facilities, devices, units, and tenant assignments. The system provides hierarchical data visualization with smart cross-linking and role-based access control.

## Core Components

### 1. Add Facility Modal (`AddFacilityModal.tsx`)

**Features:**
- **Two-step wizard**: Facility creation → User assignment
- **Comprehensive form validation** with real-time error feedback
- **Location support** with latitude/longitude coordinates
- **Contact information** management
- **Branding image** URL support
- **User assignment** with role filtering (tenants, facility admins)
- **Beautiful UI** with icons and proper spacing

**User Flow:**
1. Fill facility basic information (name, address, contact)
2. Add location coordinates and branding
3. Select users to assign facility access
4. Create facility and assign users in single operation

### 2. Add Unit Modal (`AddUnitModal.tsx`)

**Features:**
- **Two-step wizard**: Unit creation → Tenant assignment
- **Facility selection** with dropdown
- **Unit type selection** from predefined options
- **Feature selection** with toggle buttons
- **Pricing and size** configuration
- **Optional tenant assignment** during creation
- **Smart validation** with contextual error messages

**Unit Types:**
- Small/Medium/Large/Extra Large Storage
- Climate Controlled, Drive-up, Indoor, Outdoor
- Vehicle Storage, Business Storage

**Features:**
- Climate Controlled, Drive-up Access, 24/7 Access
- Security Cameras, Lighting, Ground Floor
- Elevator Access, Loading Dock, Power Outlet
- Shelving Available

### 3. Add Device Modal (`AddDeviceModal.tsx`)

**Features:**
- **Device type selection**: Access Control vs BluLok
- **Facility integration** with gateway auto-assignment
- **Access Control devices**: Gates, elevators, doors
- **BluLok devices**: Smart lock assignment to units
- **Real-time unit availability** based on facility selection
- **Serial number tracking** and firmware versioning

**Device Types:**
- **Access Control**: Gate/Elevator/Door controllers with relay channels
- **BluLok**: Smart locks with 1:1 unit association

### 4. Tenant Assignment Modal (`TenantAssignmentModal.tsx`)

**Features:**
- **Current assignment visualization** with primary/shared indicators
- **Assignment type selection**: Primary vs Shared access
- **Tenant removal** with confirmation dialogs
- **Real-time availability** filtering
- **Role-based access** management
- **Beautiful visual hierarchy** with status indicators

## Page Integration

### Facilities Page
- **Add Facility button** opens `AddFacilityModal`
- **Card-based layout** with facility statistics
- **Real-time data** updates after creation
- **Role-based visibility** for creation actions

### Facility Details Page
- **Add Device buttons** for Access Control and BluLok
- **Add Unit button** with facility pre-selection
- **Tenant management** on unit cards
- **Tab-based navigation** with device/unit views
- **Cross-linking** to related entities

### Units Page
- **Add Unit button** opens `AddUnitModal`
- **Tenant assignment** integration
- **Grid and table views** for different contexts
- **Real-time updates** after modifications

## Data Relationships

### Hierarchy Management
```
Facility
├── Users (Facility Admins, Tenants)
├── Gateway (Auto-created)
├── Access Control Devices
│   ├── Gates, Elevators, Doors
│   └── Relay Channel Assignment
├── Units
│   ├── Primary Tenant (1)
│   ├── Shared Tenants (0-N)
│   └── BluLok Device (1:1)
└── Statistics Dashboard
```

### User Assignment Flow
1. **Facility Creation** → Assign facility admins and tenants
2. **Unit Creation** → Optional primary tenant assignment
3. **Device Creation** → Automatic facility/gateway association
4. **Tenant Management** → Add/remove primary/shared access

## Form Validation

### Facility Validation
- **Required fields**: Name, address
- **Email validation**: Proper email format
- **Coordinate validation**: Valid latitude/longitude ranges
- **URL validation**: Proper image URL format

### Unit Validation
- **Required fields**: Facility, unit number, type, size, rate
- **Numeric validation**: Positive values for size and rate
- **Unique constraints**: Unit number within facility
- **Feature selection**: Multiple feature support

### Device Validation
- **Required fields**: Facility/gateway, device-specific fields
- **Access Control**: Name, type, relay channel (1-16)
- **BluLok**: Unit assignment, serial number
- **Relationship validation**: Unit availability for BluLok devices

## User Experience Features

### Visual Design
- **Step-by-step wizards** for complex operations
- **Real-time validation** with immediate feedback
- **Consistent color coding** across all interfaces
- **Responsive design** for all screen sizes
- **Dark mode support** throughout

### Interactive Elements
- **Hover states** and smooth transitions
- **Loading states** during API operations
- **Success feedback** with automatic refresh
- **Error handling** with retry options
- **Confirmation dialogs** for destructive actions

### Smart Defaults
- **Pre-filled facility** when creating from facility page
- **Intelligent user filtering** based on roles
- **Automatic gateway assignment** based on facility
- **Status defaults** appropriate for entity type

## API Integration

### Facility Management
- `POST /api/v1/facilities` - Create facility
- `PUT /api/v1/user-facilities/:userId/facilities/:facilityId` - Assign user

### Unit Management  
- `POST /api/v1/units` - Create unit
- `POST /api/v1/units/:unitId/assign` - Assign tenant
- `DELETE /api/v1/units/:unitId/assign/:tenantId` - Remove tenant

### Device Management
- `POST /api/v1/devices/access-control` - Create access control device
- `POST /api/v1/devices/blulok` - Create BluLok device
- `GET /api/v1/units?facility_id=:id` - Get facility units

## Security Features

### Role-Based Access
- **Admin/Dev Admin**: Full system access
- **Facility Admin**: Scoped to assigned facilities
- **Tenant**: View-only access to assigned units

### Data Protection
- **Input sanitization** on all form fields
- **SQL injection prevention** through parameterized queries
- **XSS protection** through proper escaping
- **CSRF protection** through token validation

## Future Enhancements

### Planned Features
1. **Bulk operations** for multiple unit/device creation
2. **Import/Export** functionality for data migration
3. **Advanced scheduling** for tenant assignments
4. **Automated billing** integration
5. **Mobile app** for tenant access
6. **Real-time notifications** for device status changes
7. **Analytics dashboard** for facility performance
8. **Third-party integrations** (payment, access control systems)

### Technical Improvements
1. **Form auto-save** to prevent data loss
2. **Advanced validation** with server-side checks
3. **Optimistic updates** for better UX
4. **Offline support** with sync capabilities
5. **Advanced search** across all entities
6. **Audit logging** for all operations

This facility management system provides a solid foundation for managing complex storage facility operations while maintaining an intuitive and beautiful user experience. The hierarchical data model ensures proper relationships between facilities, devices, units, and tenants, while the role-based access control provides appropriate security and user experience for different user types.

