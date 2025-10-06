# FMS Integration - Quick Start Guide

## ✅ What's Already Done

All core FMS infrastructure is built and ready:
- ✅ Complete type system
- ✅ Abstract base provider
- ✅ Generic REST API provider
- ✅ Database models (Configuration, Sync Log, Change)
- ✅ Core FMS service
- ✅ **NEW:** Complete API routes
- ✅ Database migration
- ✅ Comprehensive documentation

## 🚀 3 Steps to Get FMS Running

### Step 1: Register Routes (2 minutes)

Add to `backend/src/server.ts`:

```typescript
import { fmsRouter } from './routes/fms.routes';

// ... existing imports

// Register FMS routes (add with other route registrations)
app.use('/api/v1/fms', fmsRouter);
```

### Step 2: Register Providers (2 minutes)

Add to `backend/src/server.ts` (in startup section):

```typescript
import { FMSService } from './services/fms/fms.service';
import { GenericRestProvider } from './services/fms/providers/generic-rest-provider';
import { FMSProviderType } from './types/fms.types';

// Register FMS providers
const fmsService = FMSService.getInstance();
fmsService.registerProvider(FMSProviderType.GENERIC_REST, GenericRestProvider as any);

console.log('✅ FMS providers registered');
```

### Step 3: Run Migration (1 minute)

```bash
cd backend
npm run migrate:latest
```

## 🎉 That's It - Backend is Ready!

The backend is now fully functional. You can test it with:

```bash
# Test the API
curl -X GET http://localhost:3000/api/v1/fms/config/facility-123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📋 Available API Endpoints

### Configuration
- `POST /api/v1/fms/config` - Create FMS configuration
- `GET /api/v1/fms/config/:facilityId` - Get FMS configuration  
- `PUT /api/v1/fms/config/:id` - Update FMS configuration
- `DELETE /api/v1/fms/config/:id` - Delete FMS configuration
- `POST /api/v1/fms/config/:id/test` - Test FMS connection

### Sync Operations
- `POST /api/v1/fms/sync/:facilityId` - Trigger manual sync
- `GET /api/v1/fms/sync/:facilityId/history` - Get sync history
- `GET /api/v1/fms/sync/:syncLogId` - Get sync details

### Change Management
- `GET /api/v1/fms/changes/:syncLogId/pending` - Get pending changes
- `POST /api/v1/fms/changes/review` - Review changes (accept/reject)
- `POST /api/v1/fms/changes/apply` - Apply accepted changes

### Webhooks
- `POST /api/v1/fms/webhook/:facilityId` - Webhook receiver (stub)

## 🎯 Next: Frontend Implementation

### 1. Create FMS Dashboard Widget

**File:** `frontend/src/components/widgets/FMSWidget.tsx`

**Features:**
- Display last sync time
- Show pending changes count
- "Sync Now" button
- Link to FMS management page

**Example:**
```tsx
export const FMSWidget: React.FC = () => {
  const { data: syncStatus } = useFMSSyncStatus(facilityId);
  
  return (
    <WidgetCard title="FMS Integration">
      <div>
        Last Sync: {syncStatus?.lastSyncAt}
      </div>
      <div>
        Pending Changes: {syncStatus?.pendingChanges}
      </div>
      <Button onClick={handleSync}>
        Sync Now
      </Button>
    </WidgetCard>
  );
};
```

### 2. Create FMS Management Page

**File:** `frontend/src/pages/facilities/[id]/fms.tsx`

**Sections:**
1. **Configuration Tab**
   - Provider selection dropdown
   - Authentication form (API key, username/password, etc.)
   - Feature toggles
   - Sync settings (auto-accept, interval)

2. **Sync Tab**
   - Manual sync button
   - Sync history table
   - Status indicators

3. **Changes Tab**
   - Pending changes table
   - Accept/reject buttons
   - Impact summaries

### 3. Create FMS API Service

**File:** `frontend/src/services/fms.service.ts`

```typescript
import { apiClient } from './api.client';

export class FMSService {
  async getConfig(facilityId: string) {
    return apiClient.get(`/fms/config/${facilityId}`);
  }

  async saveConfig(data: any) {
    return apiClient.post('/fms/config', data);
  }

  async testConnection(configId: string) {
    return apiClient.post(`/fms/config/${configId}/test`);
  }

  async triggerSync(facilityId: string) {
    return apiClient.post(`/fms/sync/${facilityId}`);
  }

  async getSyncHistory(facilityId: string) {
    return apiClient.get(`/fms/sync/${facilityId}/history`);
  }

  async getPendingChanges(syncLogId: string) {
    return apiClient.get(`/fms/changes/${syncLogId}/pending`);
  }

  async reviewChanges(changeIds: string[], accepted: boolean) {
    return apiClient.post('/fms/changes/review', { changeIds, accepted });
  }

  async applyChanges(syncLogId: string, changeIds: string[]) {
    return apiClient.post('/fms/changes/apply', { syncLogId, changeIds });
  }
}
```

## 🧪 Testing the Integration

### 1. Create Test FMS Configuration

```bash
curl -X POST http://localhost:3000/api/v1/fms/config \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "facility_id": "550e8400-e29b-41d4-a716-446655440001",
    "provider_type": "generic_rest",
    "config": {
      "providerType": "generic_rest",
      "baseUrl": "https://api.example-fms.com",
      "apiVersion": "v1",
      "auth": {
        "type": "api_key",
        "credentials": {
          "apiKey": "test-api-key-123"
        }
      },
      "features": {
        "supportsTenantSync": true,
        "supportsUnitSync": true,
        "supportsWebhooks": false,
        "supportsRealtime": false
      },
      "syncSettings": {
        "autoAcceptChanges": false,
        "syncInterval": 60
      }
    },
    "is_enabled": true
  }'
```

### 2. Test Connection

```bash
curl -X POST http://localhost:3000/api/v1/fms/config/CONFIG_ID/test \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 3. Trigger Manual Sync

```bash
curl -X POST http://localhost:3000/api/v1/fms/sync/FACILITY_ID \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### 4. Get Sync History

```bash
curl -X GET http://localhost:3000/api/v1/fms/sync/FACILITY_ID/history \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## 📚 Additional Resources

- **Architecture:** See `cursorDocs/FMS_INTEGRATION_ARCHITECTURE.md`
- **Implementation Guide:** See `cursorDocs/FMS_IMPLEMENTATION_SUMMARY.md`
- **Provider Development:** See `backend/src/services/fms/providers/generic-rest-provider.ts`

## 🔧 Adding New FMS Providers

Example: Adding Yardi provider

**1. Create provider class:**

```typescript
// backend/src/services/fms/providers/yardi-provider.ts
import { BaseFMSProvider } from '../base-fms-provider';

export class YardiProvider extends BaseFMSProvider {
  getProviderName() { return 'Yardi'; }
  
  getCapabilities() {
    return {
      supportsTenantSync: true,
      supportsUnitSync: true,
      supportsWebhooks: true,
      supportsRealtime: false,
      supportsLeaseManagement: true,
      supportsPaymentIntegration: false,
      supportsBulkOperations: true,
    };
  }
  
  async testConnection() {
    // Yardi-specific connection test
  }
  
  async fetchTenants() {
    // Yardi API call to get tenants
  }
  
  async fetchUnits() {
    // Yardi API call to get units
  }
  
  // ... implement other required methods
}
```

**2. Register in server startup:**

```typescript
import { YardiProvider } from './services/fms/providers/yardi-provider';

fmsService.registerProvider(FMSProviderType.YARDI, YardiProvider as any);
```

**3. Add to provider dropdown in frontend**

## 🎉 You're Ready!

The FMS integration is now fully functional on the backend. Build the frontend UI and start syncing with facility management systems!

**Questions?** Check the documentation in `cursorDocs/` or ask for help!

