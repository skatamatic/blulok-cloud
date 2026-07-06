/**
 * Devices Routes
 *
 * Comprehensive device management API providing CRUD operations for BluLok locks
 * and access control devices. Supports device registration, status monitoring,
 * configuration management, and operational control.
 *
 * Key Features:
 * - Dual device type management (BluLok locks + access control devices)
 * - Device registration and configuration
 * - Real-time status monitoring and health tracking
 * - Device control operations (lock/unlock status updates)
 * - Battery level monitoring and alerts
 * - Facility-scoped device access control
 *
 * Device Types:
 * - BluLok: Primary smart locks with cryptographic access control
 * - Access Control: Secondary devices (gates, elevators, doors)
 *
 * Access Control:
 * - ADMIN/DEV_ADMIN: Full device management across all facilities
 * - FACILITY_ADMIN: Management of devices in assigned facilities
 * - TENANT: Read-only access to devices in their units
 * - MAINTENANCE: Access for device maintenance operations
 *
 * Device Operations:
 * - Register new devices with gateway association
 * - Update device configurations and settings
 * - Monitor device status and connectivity
 * - Update lock status for access control
 * - Track battery levels and maintenance needs
 * - Search and filter devices by various criteria
 *
 * Business Logic:
 * - Device isolation ensures facility security
 * - Status monitoring enables proactive maintenance
 * - Battery tracking prevents device failures
 * - Lock status updates support access control workflows
 * - Gateway association enables device communication
 *
 * Security Considerations:
 * - Facility-scoped access prevents unauthorized operations
 * - Input validation on all device data and configurations
 * - XSS protection for user-provided device names
 * - Audit logging for all device operations
 * - Secure device configuration management
 *
 * Performance Optimizations:
 * - Efficient database queries with proper indexing
 * - Pagination support for large device lists
 * - Cached device lookups for frequent access
 * - Optimized status queries for monitoring dashboards
 * - Bulk operations for facility-wide updates
 */

import { Router, Response } from 'express';
import { DeviceModel, type DeviceFilters } from '../models/device.model';
import { authenticateToken, requireNotTenant, requireAdminOrFacilityAdmin, applyFacilityScope, requireRoles } from '../middleware/auth.middleware';
import { UserRole } from '../types/auth.types';
import { AuthenticatedRequest } from '../types/auth.types';
import { DevicesService } from '../services/devices.service';
import { AuthService } from '../services/auth.service';
import { asyncHandler, ConflictError, NotFoundError } from '../middleware/error.middleware';
import {
  assertUnitAvailableForBluLok,
  assertUnitBelongsToGatewayFacility,
  assertUserCanProvisionOnGateway,
  buildManualProvisionMetadata,
  mapDeviceProvisionDatabaseError,
} from '@/utils/device-provision.utils';
import { DeviceMetadataService } from '../services/device-metadata.service';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/database.service';
import { AccessCodeService } from '@/services/access-code.service';
import { DeviceGroupService } from '@/services/device-group.service';
import {
  normalizeDeviceListSortKey,
  normalizeNetworkInfraSortKey,
  sortMergedDeviceList,
  needsInMemoryDeviceSort,
} from '@/utils/merged-device-list.utils';
import { DeviceReachabilityEnrichmentService } from '@/services/device-reachability-enrichment.service';
import {
  registerGet,
  registerPost,
  registerPut,
  registerDelete,
} from '@/openapi/register-route';
import { errorEnvelopeSchema } from '@/openapi/common-schemas';
import {
  listQuerySchema,
  deviceIdParamSchema,
  blulokDeviceIdParamSchema,
  facilityHierarchyParamSchema,
  deviceTypeStatusParamSchema,
  accessControlDeviceSchema,
  updateAccessControlDeviceSchema,
  updateBluLokMetadataSchema,
  updateAccessControlMetadataSchema,
  bluLokDeviceSchema,
  lockStatusSchema,
  deviceStatusSchema,
  assignBlulokDeviceBodySchema,
  devicesListResponseSchema,
  deviceResponseSchema,
  deviceWithSideEffectsResponseSchema,
  hierarchyResponseSchema,
  denylistResponseSchema,
  deviceStatusUpdateResponseSchema,
  lockCommandResponseSchema,
  assignDeviceResponseSchema,
  removeDeviceResponseSchema,
} from '@/schemas/devices.schemas';

const DEFAULT_DEVICE_LIST_LIMIT = 30;
const MAX_DEVICE_LIST_LIMIT = 200;
const MOUNT = '/api/v1/devices';

const reachabilityEnrichment = () => DeviceReachabilityEnrichmentService.getInstance();

async function enrichDeviceListRows<T extends object>(devices: T[]): Promise<T[]> {
  const enricher = reachabilityEnrichment();
  const cache = await enricher.createLivenessCache();
  return Promise.all(
    devices.map(async (d) => {
      const fields = d as Record<string, unknown>;
      if (fields.device_category === 'blulok') {
        return enricher.enrichBluLokRow(d, cache);
      }
      if (fields.device_category === 'access_control') {
        return enricher.enrichAccessControlRow(d, cache);
      }
      if (fields.device_category === 'network_infra') {
        return enricher.enrichNetworkInfraRow(d, cache);
      }
      return d;
    }),
  );
}

function applyEffectiveStatusFilter<T extends object>(
  devices: T[],
  statusFilter: string | undefined,
): T[] {
  if (!statusFilter) return devices;
  const enricher = reachabilityEnrichment();
  return devices.filter((d) => enricher.matchesEffectiveStatus(d, statusFilter));
}

function parseListOffset(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

/** Returns validated limit in [1, max] or undefined if absent/invalid. */
function parseListLimit(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), MAX_DEVICE_LIST_LIMIT);
}

const router = Router();
/** Used by devices route tests so knex mocks apply to the same instance the router holds. */
export const deviceModel = new DeviceModel();

// Simple XSS sanitization function
const sanitizeHtml = (input: string): string => {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Apply auth middleware to all routes
router.use(authenticateToken);

// GET /api/devices - Get all devices with hierarchy
// Listing all devices is not available to TENANT users
registerGet(
  router,
  '/',
  {
    openApiPath: MOUNT,
    tags: ['Devices', 'App'],
    summary: 'List devices with optional filtering and pagination',
    security: 'bearer',
    query: listQuerySchema,
    responses: {
      200: devicesListResponseSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireNotTenant,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const q = req.query as Record<string, unknown>;
      const { facility_id, device_type, status, search } = q;
      const deviceScope = (q.device_scope as string | undefined) || 'operational';
      const sortByParam = (q.sortBy ?? q.sort_by) as string | undefined;
      const sortOrderParam = (q.sortOrder ?? q.sort_order) as string | undefined;
      const projectionRaw = q.projection as string | undefined;
      const projectionId = projectionRaw === 'id';
      const limitParsed = parseListLimit(q.limit);
      const offsetNum = parseListOffset(q.offset);

      // Restrict facility access based on user role
      const allowedFacilityId = facility_id as string | undefined;
      /** When dashboard omits facility_id, scoped users see devices across all assigned facilities (not only the first). */
      let allowedFacilityIds: string[] | undefined;

      // For facility-scoped users, enforce facility restrictions
      if (AuthService.isFacilityScoped(user.role)) {
        if (facility_id && !user.facilityIds?.includes(facility_id as string)) {
          res.status(403).json({ success: false, message: 'Access denied to this facility' });
          return;
        }
        // If no facility specified, restrict to user's facilities (all of them)
        if (!facility_id) {
          const userFacilityIds = applyFacilityScope(req);
          if (userFacilityIds && userFacilityIds.length > 0) {
            allowedFacilityIds = userFacilityIds;
          } else {
            // User has no facility access - return empty result
            res.json({ devices: [], total: 0 });
            return;
          }
        }
      }

      const sortKey = normalizeDeviceListSortKey(sortByParam);
      const order: 'asc' | 'desc' = sortOrderParam === 'desc' ? 'desc' : 'asc';
      const statusFilter = status as string | undefined;

      if (deviceScope === 'network_infra') {
        const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
        const infraSortKey = normalizeNetworkInfraSortKey(sortByParam);
        const fetchAllForEffectiveFilter = Boolean(statusFilter);
        const infraFilters = {
          search: search as string | undefined,
          sortBy: infraSortKey as any,
          sortOrder: order,
          ...(fetchAllForEffectiveFilter
            ? {}
            : {
                offset: offsetNum,
                limit: limitParsed ?? (projectionId ? undefined : DEFAULT_DEVICE_LIST_LIMIT),
              }),
          ...(allowedFacilityId ? { facility_id: allowedFacilityId } : {}),
          ...(allowedFacilityIds ? { facility_ids: allowedFacilityIds } : {}),
        };
        let { devices: networkInfraDevices } =
          await GatewayInventoryDeviceSyncService.getInstance().listNetworkInfraDevices(infraFilters);

        if (projectionId) {
          res.json({
            success: true,
            devices: networkInfraDevices.map((d) => ({
              id: d.id,
              device_category: d.device_category,
            })),
            total: networkInfraDevices.length,
          });
          return;
        }

        networkInfraDevices = await enrichDeviceListRows(networkInfraDevices);
        if (statusFilter) {
          networkInfraDevices = applyEffectiveStatusFilter(networkInfraDevices, statusFilter);
        }
        const infraTotal = networkInfraDevices.length;
        if (fetchAllForEffectiveFilter) {
          const pageSize = limitParsed ?? DEFAULT_DEVICE_LIST_LIMIT;
          networkInfraDevices = networkInfraDevices.slice(offsetNum, offsetNum + pageSize);
        }

        res.json({ success: true, devices: networkInfraDevices, total: infraTotal });
        return;
      }

      const baseFilters: DeviceFilters = {
        device_type: device_type as any,
        search: search as string,
      };
      if (allowedFacilityId) {
        (baseFilters as any).facility_id = allowedFacilityId;
      } else if (allowedFacilityIds && allowedFacilityIds.length > 0) {
        (baseFilters as any).facility_ids = allowedFacilityIds;
      }

      let devices: any[] = [];
      let total = 0;
      let devicesEnriched = false;

      const dt = device_type as string | undefined;
      const mergeAllScopes = deviceScope === 'all';

      if (needsInMemoryDeviceSort(dt, sortKey) || mergeAllScopes || Boolean(statusFilter)) {
        const fetchFilters: DeviceFilters = {
          ...baseFilters,
          sortBy: 'created_at',
          sortOrder: 'asc',
          ...(projectionId ? { skipPrimaryTenantEnrichment: true } : {}),
        };

        if (!dt || dt === 'all') {
          const [accessControlDevices, blulokDevices] = await Promise.all([
            deviceModel.findAccessControlDevices(fetchFilters),
            deviceModel.findBluLokDevices(fetchFilters),
          ]);
          devices = [
            ...accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' })),
            ...blulokDevices.map((d) => ({ ...d, device_category: 'blulok' })),
          ];
        } else if (dt === 'access_control') {
          const accessControlDevices = await deviceModel.findAccessControlDevices(fetchFilters);
          devices = accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' }));
        } else {
          const blulokDevices = await deviceModel.findBluLokDevices(fetchFilters);
          devices = blulokDevices.map((d) => ({ ...d, device_category: 'blulok' }));
        }

        if (mergeAllScopes) {
          const { GatewayInventoryDeviceSyncService } = await import('@/services/gateway-inventory-device-sync.service');
          const { devices: networkInfraDevices } =
            await GatewayInventoryDeviceSyncService.getInstance().listNetworkInfraDevices({
              search: search as string | undefined,
              ...(allowedFacilityId ? { facility_id: allowedFacilityId } : {}),
              ...(allowedFacilityIds ? { facility_ids: allowedFacilityIds } : {}),
            });
          devices = [...devices, ...networkInfraDevices];
        }

        if (!projectionId) {
          devices = await enrichDeviceListRows(devices);
          devicesEnriched = true;
          if (statusFilter) {
            devices = applyEffectiveStatusFilter(devices, statusFilter);
          }
        }

        sortMergedDeviceList(devices, sortKey, order);
        total = devices.length;
        let pageSize: number;
        if (limitParsed !== undefined) {
          pageSize = limitParsed;
        } else if (projectionId) {
          pageSize = total;
        } else {
          pageSize = Math.min(DEFAULT_DEVICE_LIST_LIMIT, total);
        }
        devices = devices.slice(offsetNum, offsetNum + pageSize);
      } else {
        const filters: DeviceFilters = {
          ...baseFilters,
          sortBy: sortKey as any,
          sortOrder: order,
          ...(projectionId ? { skipPrimaryTenantEnrichment: true } : {}),
        };

        const allowUnboundedDb = projectionId && limitParsed === undefined;

        if (!allowUnboundedDb) {
          if (limitParsed !== undefined) {
            filters.limit = limitParsed;
          } else {
            filters.limit = DEFAULT_DEVICE_LIST_LIMIT;
          }
        }
        filters.offset = offsetNum;

        // device_type === 'all' always uses the in-memory merge path above.
        if (dt === 'access_control') {
          const accessControlDevices = await deviceModel.findAccessControlDevices(filters);
          devices = accessControlDevices.map((d) => ({ ...d, device_category: 'access_control' }));
          total = await deviceModel.countAccessControlDevices(baseFilters);
        } else {
          const blulokDevices = await deviceModel.findBluLokDevices(filters);
          devices = blulokDevices.map((d) => ({ ...d, device_category: 'blulok' }));
          total = await deviceModel.countBluLokDevices(baseFilters);
        }
      }

      if (!projectionId && devices.length > 0 && !devicesEnriched) {
        devices = await enrichDeviceListRows(devices);
      }

      if (projectionId) {
        devices = devices.map((d) => ({
          id: d.id,
          device_category: d.device_category,
        }));
      }

      res.json({ success: true, devices, total });
    } catch (error) {
      console.error('Error fetching devices:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch devices' });
    }
  },
);

// GET /api/devices/blulok/:id - Get single BluLok device by id
registerGet(
  router,
  '/blulok/:id',
  {
    openApiPath: `${MOUNT}/blulok/{id}`,
    tags: ['Devices', 'App'],
    summary: 'Get a single BluLok device by ID',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: deviceResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;

      // Facility-scoped users must have access to the facility that owns this device (via gateway)
      if (AuthService.isFacilityScoped(user.role)) {
        const knex = DatabaseService.getInstance().connection;
        const gatewayRow = await knex('blulok_devices')
          .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
          .where('blulok_devices.id', id)
          .select('gateways.facility_id')
          .first();

        if (!gatewayRow || !user.facilityIds?.includes(gatewayRow.facility_id)) {
          res.status(403).json({ success: false, message: 'Access denied to this device' });
          return;
        }
      }

      const device = await deviceModel.findBluLokDeviceById(String(id));
      if (!device) {
        res.status(404).json({ success: false, message: 'Device not found' });
        return;
      }

      const enriched = await reachabilityEnrichment().enrichBluLokRow(device, await reachabilityEnrichment().createLivenessCache());
      res.json({ success: true, device: enriched });
    } catch (error) {
      console.error('Error fetching device:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch device' });
    }
  }),
);

// GET /api/devices/access-control/:id - Get single access control device by id
registerGet(
  router,
  '/access-control/:id',
  {
    openApiPath: `${MOUNT}/access-control/{id}`,
    tags: ['Devices', 'App'],
    summary: 'Get a single access control device by ID',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: deviceResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;

      const device = await deviceModel.findAccessControlDeviceWithGateway(String(id));
      if (!device) {
        res.status(404).json({ success: false, message: 'Device not found' });
        return;
      }

      if (AuthService.isFacilityScoped(user.role) && !user.facilityIds?.includes(device.facility_id)) {
        res.status(403).json({ success: false, message: 'Access denied to this device' });
        return;
      }

      const knex = DatabaseService.getInstance().connection;
      const facility = await knex('facilities')
        .where('id', device.facility_id)
        .select('name')
        .first();

      res.json({
        success: true,
        device: await reachabilityEnrichment().enrichAccessControlRow(
          {
            ...device,
            facility_name: facility?.name ?? String(device.facility_id),
          } as Record<string, unknown>,
          await reachabilityEnrichment().createLivenessCache(),
        ),
      });
    } catch (error) {
      console.error('Error fetching access control device:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch device' });
    }
  }),
);

// GET /api/devices/facility/:facilityId/hierarchy - Get facility device hierarchy
registerGet(
  router,
  '/facility/:facilityId/hierarchy',
  {
    openApiPath: `${MOUNT}/facility/{facilityId}/hierarchy`,
    tags: ['Devices', 'App'],
    summary: 'Get facility device hierarchy',
    security: 'bearer',
    params: facilityHierarchyParamSchema,
    responses: {
      200: hierarchyResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const facilityId = req.params.facilityId;

      // Check access permissions consistent with tests
      if (user.role === UserRole.TENANT) {
        // Tenants should not view full facility device hierarchy
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
      }
      if (user.role === UserRole.FACILITY_ADMIN) {
        if (!user.facilityIds?.includes(facilityId)) {
          res.status(403).json({ success: false, message: 'Access denied to this facility' });
          return;
        }
      }

      const hierarchy = await deviceModel.getFacilityDeviceHierarchy(String(facilityId));

      if (!hierarchy) {
        res.status(404).json({ success: false, message: 'Facility not found' });
        return;
      }

      const enrichedHierarchy =
        await reachabilityEnrichment().enrichFacilityDeviceHierarchy(hierarchy);

      res.json({ hierarchy: enrichedHierarchy });
    } catch (error) {
      logger.error('Error fetching facility device hierarchy:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch device hierarchy' });
    }
  }),
);

// POST /api/devices/access-control - Create access control device
registerPost(
  router,
  '/access-control',
  {
    openApiPath: `${MOUNT}/access-control`,
    tags: ['Devices', 'App'],
    summary: 'Create an access control device',
    security: 'bearer',
    body: accessControlDeviceSchema,
    responses: {
      201: deviceResponseSchema,
      400: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const value = req.body;

    const gateway = await assertUserCanProvisionOnGateway(user, value.gateway_id, deviceModel);

    const deviceSerial = String(value.device_serial).trim();
    const relayChannel = Number(value.relay_channel);
    const conflict = await deviceModel.findAccessControlIdentityConflict(
      value.gateway_id,
      deviceSerial,
      relayChannel,
      ''
    );
    if (conflict?.type === 'serial_relay') {
      throw new ConflictError(
        `Device serial "${deviceSerial}" on relay ${relayChannel} is already in use`
      );
    }

    const sanitizedValue = {
      ...value,
      device_serial: deviceSerial,
      name: sanitizeHtml(value.name),
      location_description: sanitizeHtml(value.location_description),
      metadata: buildManualProvisionMetadata(value.metadata),
    };

    try {
      const device = await deviceModel.createAccessControlDevice(sanitizedValue);
      try {
        await DeviceGroupService.getInstance().assignAccessControlToDefaultGroup(
          String(gateway.facility_id),
          String(device.id),
          { actorId: user.userId, actorName: user.email ?? undefined },
        );
      } catch (groupErr) {
        await deviceModel.deleteAccessControlDevice(String(device.id));
        throw groupErr;
      }
      try {
        await DevicesService.getInstance().cancelDeletionTombstoneForAccessControl(
          String(gateway.facility_id),
          deviceSerial,
          relayChannel,
        );
      } catch (cancelErr) {
        logger.warn('Failed to cancel DEVICE_DELETED tombstone after access-control create', { cancelErr });
      }
      try {
        await AccessCodeService.getInstance().pushCodesToGateway(String(gateway.facility_id));
      } catch (pushError) {
        logger.warn('Failed to push access codes after access-control device creation', { pushError });
      }

      res.status(201).json({ success: true, device });
    } catch (createError) {
      const mapped = mapDeviceProvisionDatabaseError(createError);
      if (mapped) throw mapped;
      logger.error('Error creating access control device:', createError);
      throw createError;
    }
  }),
);

// POST /api/devices/blulok - Create BluLok device
registerPost(
  router,
  '/blulok',
  {
    openApiPath: `${MOUNT}/blulok`,
    tags: ['Devices', 'App'],
    summary: 'Create a BluLok device',
    security: 'bearer',
    body: bluLokDeviceSchema,
    responses: {
      201: deviceResponseSchema,
      400: errorEnvelopeSchema,
      409: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const value = req.body;

    const gateway = await assertUserCanProvisionOnGateway(user, value.gateway_id, deviceModel);

    const normalizedSerial = String(value.device_serial || value.serial).trim();
    const existingSerial = await deviceModel.findBluLokBySerial(normalizedSerial);
    if (existingSerial) {
      throw new ConflictError(`Device serial "${normalizedSerial}" is already in use`);
    }

    const unitId =
      value.unit_id && String(value.unit_id).trim() ? String(value.unit_id).trim() : undefined;
    if (unitId) {
      await assertUnitBelongsToGatewayFacility(unitId, gateway.facility_id, deviceModel);
      await assertUnitAvailableForBluLok(unitId, deviceModel);
    }

    const displayName =
      value.name && String(value.name).trim() ? sanitizeHtml(String(value.name).trim()) : undefined;
    const locationDescription =
      value.location_description && String(value.location_description).trim()
        ? sanitizeHtml(String(value.location_description).trim())
        : undefined;
    const firmwareVersion =
      value.firmware_version && String(value.firmware_version).trim()
        ? String(value.firmware_version).trim()
        : undefined;

    const deviceSettings = {
      ...(value.device_settings && typeof value.device_settings === 'object'
        ? value.device_settings
        : {}),
      ...(displayName ? { displayName } : {}),
      ...(locationDescription ? { locationDescription } : {}),
    };

    const metadata = buildManualProvisionMetadata(
      value.metadata && typeof value.metadata === 'object' ? value.metadata : undefined
    );

    try {
      const device = await deviceModel.createBluLokDevice({
        gateway_id: value.gateway_id,
        ...(unitId ? { unit_id: unitId } : {}),
        device_serial: normalizedSerial,
        serial: normalizedSerial,
        ...(firmwareVersion ? { firmware_version: firmwareVersion } : {}),
        ...(value.supports_remote_lock !== undefined
          ? { supports_remote_lock: value.supports_remote_lock }
          : {}),
        device_settings: Object.keys(deviceSettings).length > 0 ? deviceSettings : undefined,
        metadata,
      });

      try {
        await DeviceGroupService.getInstance().assignBluLokToDefaultGroup(
          String(gateway.facility_id),
          String(device.id),
          { actorId: user.userId, actorName: user.email ?? undefined },
        );
      } catch (groupErr) {
        logger.warn('Failed to assign BluLok device to default access group', { groupErr });
      }

      try {
        await DevicesService.getInstance().cancelDeletionTombstoneForBlulok(
          String(gateway.facility_id),
          normalizedSerial,
        );
      } catch (cancelErr) {
        logger.warn('Failed to cancel DEVICE_DELETED tombstone after BluLok create', { cancelErr });
      }

      res.status(201).json({ success: true, device });
    } catch (createError) {
      const mapped = mapDeviceProvisionDatabaseError(createError);
      if (mapped) throw mapped;
      logger.error('Error creating BluLok device:', createError);
      throw createError;
    }
  }),
);

// PUT /api/devices/access-control/:id - Update access control device settings
registerPut(
  router,
  '/access-control/:id',
  {
    openApiPath: `${MOUNT}/access-control/{id}`,
    tags: ['Devices', 'App'],
    summary: 'Update access control device settings',
    security: 'bearer',
    params: deviceIdParamSchema,
    body: updateAccessControlDeviceSchema,
    responses: {
      200: deviceWithSideEffectsResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;
    const value = req.body;

    const existing = await deviceModel.findAccessControlDeviceWithGateway(String(id));
    if (!existing) {
      res.status(404).json({ success: false, message: 'Device not found' });
      return;
    }

    if (AuthService.isFacilityScoped(user.role) && !user.facilityIds?.includes(existing.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }

    const { status, is_locked, ...metadataFields } = value;
    const hasMetadataFields = Object.keys(metadataFields).length > 0;

    if (hasMetadataFields) {
      const metadataService = DeviceMetadataService.getInstance();
      try {
        const sanitizedMetadata = {
          ...metadataFields,
          name: metadataFields.name ? sanitizeHtml(metadataFields.name) : undefined,
          location_description: metadataFields.location_description
            ? sanitizeHtml(metadataFields.location_description)
            : undefined,
        };
        const result = await metadataService.updateAccessControlMetadata(
          String(id),
          sanitizedMetadata,
          {
            userId: user.userId,
            userName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || undefined,
          }
        );
        let device = result.device;
        if (status !== undefined || is_locked !== undefined) {
          const statusUpdate: Record<string, unknown> = {};
          if (status !== undefined) statusUpdate.status = status;
          if (is_locked !== undefined) statusUpdate.is_locked = is_locked;
          await deviceModel.updateAccessControlDevice(String(id), statusUpdate);
          device =
            (await deviceModel.findAccessControlDeviceWithGateway(String(id))) ?? device;
        }
        res.json({ success: true, device, sideEffects: result.sideEffects });
        return;
      } catch (err) {
        if (err instanceof ConflictError || err instanceof NotFoundError) {
          res.status(err.statusCode).json({ success: false, message: err.message });
          return;
        }
        throw err;
      }
    }

    const updatePayload = {
      ...value,
      name: value.name ? sanitizeHtml(value.name) : undefined,
      location_description: value.location_description ? sanitizeHtml(value.location_description) : undefined,
    };
    const updated = await deviceModel.updateAccessControlDevice(String(id), updatePayload);
    res.json({ success: true, device: updated });
  }),
);

// PUT /api/devices/access-control/:id/metadata - Update access control metadata with propagation
registerPut(
  router,
  '/access-control/:id/metadata',
  {
    openApiPath: `${MOUNT}/access-control/{id}/metadata`,
    tags: ['Devices', 'App'],
    summary: 'Update access control device metadata with propagation',
    security: 'bearer',
    params: deviceIdParamSchema,
    body: updateAccessControlMetadataSchema,
    responses: {
      200: deviceWithSideEffectsResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;
    const value = req.body;

    const existing = await deviceModel.findAccessControlDeviceWithGateway(String(id));
    if (!existing) {
      res.status(404).json({ success: false, message: 'Device not found' });
      return;
    }

    if (AuthService.isFacilityScoped(user.role) && !user.facilityIds?.includes(existing.facility_id)) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }

    const metadataService = DeviceMetadataService.getInstance();
    try {
      const result = await metadataService.updateAccessControlMetadata(
        String(id),
        {
          ...value,
          name: value.name ? sanitizeHtml(value.name) : undefined,
          location_description: value.location_description
            ? sanitizeHtml(value.location_description)
            : undefined,
        },
        {
          userId: user.userId,
          userName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || undefined,
        }
      );
      res.json({ success: true, device: result.device, sideEffects: result.sideEffects });
    } catch (err) {
      if (err instanceof ConflictError || err instanceof NotFoundError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      throw err;
    }
  }),
);

// DELETE /api/devices/network-infra/:deviceId - Remove network infra device from cloud inventory
registerDelete(
  router,
  '/network-infra/:deviceId',
  {
    openApiPath: `${MOUNT}/network-infra/{deviceId}`,
    tags: ['Devices', 'App'],
    summary: 'Remove network infrastructure device from cloud inventory',
    security: 'bearer',
    params: blulokDeviceIdParamSchema,
    responses: {
      200: removeDeviceResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;

    if (!deviceId) {
      res.status(400).json({ success: false, message: 'deviceId is required' });
      return;
    }

    try {
      const devicesService = DevicesService.getInstance();
      const hasAccess = await devicesService.hasUserAccessToNetworkInfraDevice(
        deviceId,
        user.userId,
        user.role,
      );
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this device' });
        return;
      }

      const summary = await devicesService.removeNetworkInfraDeviceFromCloudInventory(deviceId, {
        performedBy: user.userId,
      });

      res.status(200).json({
        success: true,
        message:
          'Network infrastructure device removed from cloud inventory. The gateway has been notified to stop reporting this device; if offline, the tombstone command will be delivered on reconnect.',
        removed: summary,
      });
    } catch (error: any) {
      logger.error('Error removing network infra device from inventory:', error);
      const message = error?.message || 'Failed to remove device from inventory';
      const status = /not found/i.test(message) ? 404 : 500;
      res.status(status).json({ success: false, message });
    }
  }),
);

// DELETE /api/devices/access-control/:deviceId - Remove access control device from cloud inventory
registerDelete(
  router,
  '/access-control/:deviceId',
  {
    openApiPath: `${MOUNT}/access-control/{deviceId}`,
    tags: ['Devices', 'App'],
    summary: 'Remove access control device from cloud inventory',
    security: 'bearer',
    params: blulokDeviceIdParamSchema,
    responses: {
      200: removeDeviceResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;

    if (!deviceId) {
      res.status(400).json({ success: false, message: 'deviceId is required' });
      return;
    }

    try {
      const devicesService = DevicesService.getInstance();
      const hasAccess = await devicesService.hasUserAccessToAccessControlDevice(
        deviceId,
        user.userId,
        user.role,
      );
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this device' });
        return;
      }

      const summary = await devicesService.removeAccessControlDeviceFromCloudInventory(deviceId, {
        performedBy: user.userId,
      });

      res.status(200).json({
        success: true,
        message:
          'Access control device removed from cloud inventory. The gateway has been notified to stop reporting this device; if offline, the tombstone command will be delivered on reconnect.',
        removed: summary,
      });
    } catch (error: any) {
      logger.error('Error removing access control device from inventory:', error);
      const message = error?.message || 'Failed to remove device from inventory';
      const status = /not found/i.test(message) ? 404 : 500;
      res.status(status).json({ success: false, message });
    }
  }),
);

// PUT /api/devices/blulok/:id/metadata - Update BluLok metadata with propagation
registerPut(
  router,
  '/blulok/:id/metadata',
  {
    openApiPath: `${MOUNT}/blulok/{id}/metadata`,
    tags: ['Devices', 'App'],
    summary: 'Update BluLok device metadata with propagation',
    security: 'bearer',
    params: deviceIdParamSchema,
    body: updateBluLokMetadataSchema,
    responses: {
      200: deviceWithSideEffectsResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { id } = req.params;
    const value = req.body;

    const existing = await deviceModel.findBluLokDeviceById(String(id));
    if (!existing) {
      res.status(404).json({ success: false, message: 'Device not found' });
      return;
    }

    const facilityId = (existing as { gateway_facility_id?: string }).gateway_facility_id;
    if (
      facilityId &&
      AuthService.isFacilityScoped(user.role) &&
      !user.facilityIds?.includes(facilityId)
    ) {
      res.status(403).json({ success: false, message: 'Access denied to this facility' });
      return;
    }

    const metadataService = DeviceMetadataService.getInstance();
    try {
      const result = await metadataService.updateBluLokMetadata(
        String(id),
        value,
        {
          userId: user.userId,
          userName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email || undefined,
        }
      );
      res.json({ success: true, device: result.device, sideEffects: result.sideEffects });
    } catch (err) {
      if (err instanceof ConflictError || err instanceof NotFoundError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      throw err;
    }
  }),
);

// PUT /api/devices/:deviceType/:id/status - Update device status
registerPut(
  router,
  '/:deviceType/:id/status',
  {
    openApiPath: `${MOUNT}/{deviceType}/{id}/status`,
    tags: ['Devices', 'App'],
    summary: 'Update device operational status',
    security: 'bearer',
    params: deviceTypeStatusParamSchema,
    body: deviceStatusSchema,
    responses: {
      200: deviceStatusUpdateResponseSchema,
      400: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const deviceType = req.params.deviceType as 'access_control' | 'blulok';
      const id = req.params.id;

      if (deviceType !== 'access_control' && deviceType !== 'blulok') {
        res.status(400).json({ success: false, message: 'Invalid device type' });
        return;
      }

      const value = req.body;

      await deviceModel.updateDeviceStatus(String(id), deviceType as any, value.status);

      res.json({ message: 'Device status updated successfully' });
    } catch (error) {
      console.error('Error updating device status:', error);
      res.status(500).json({ success: false, message: 'Failed to update device status' });
    }
  },
);

// PUT /api/devices/blulok/:id/lock - Issue BluLok lock/unlock command
registerPut(
  router,
  '/blulok/:id/lock',
  {
    openApiPath: `${MOUNT}/blulok/{id}/lock`,
    tags: ['Devices', 'App'],
    summary: 'Issue BluLok lock or unlock command',
    security: 'bearer',
    params: deviceIdParamSchema,
    body: lockStatusSchema,
    responses: {
      200: lockCommandResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      502: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = req.params.id;
      const value = req.body;

      const knex = deviceModel['db'].connection;
      const deviceRow = await knex('blulok_devices')
        .join('gateways', 'blulok_devices.gateway_id', 'gateways.id')
        .select('blulok_devices.unit_id', 'gateways.facility_id', 'gateways.id as gateway_id', 'blulok_devices.lock_status')
        .where('blulok_devices.id', String(id))
        .first();

      if (!deviceRow) {
        res.status(404).json({ success: false, message: 'Device not found' });
        return;
      }

      // Access control:
      // - If device has a unit: user must have access to that unit
      // - If device has no unit: allow admin/dev_admin; facility_admin must have facility access
      if (deviceRow.unit_id) {
        const { UnitsService } = await import('@/services/units.service');
        const unitsService = UnitsService.getInstance();
        const hasAccess = await unitsService.hasUserAccessToUnit(deviceRow.unit_id, user.userId, user.role);
        if (!hasAccess) {
          res.status(403).json({ success: false, message: 'Insufficient permissions - unit access required' });
          return;
        }
      } else {
        // No unit associated
        if (user.role === UserRole.ADMIN || user.role === UserRole.DEV_ADMIN) {
          // allowed
        } else if (user.role === UserRole.FACILITY_ADMIN) {
          if (!user.facilityIds?.includes(deviceRow.facility_id)) {
            res.status(403).json({ success: false, message: 'Insufficient permissions - facility access required' });
            return;
          }
        } else {
          res.status(403).json({ success: false, message: 'Insufficient permissions' });
          return;
        }
      }

      // If caller is explicitly setting lock_status=error, treat as direct override.
      // This is primarily for admin tooling and does not go through gateway commands.
      if (value.lock_status === 'error') {
        await deviceModel.updateLockStatus(String(id), 'error');
        res.json({ success: true, message: 'Lock status overridden to error' });
        return;
      }

      // For locked/unlocked, route through the LockCommandService so the device
      // enters a transitional state ('locking'/'unlocking') and we wait on gateway state updates.
      const { LockCommandService } = await import('@/services/lock-command.service');
      const lockCommandService = LockCommandService.getInstance();
      const result = await lockCommandService.issueLockCommand(
        String(id),
        value.lock_status,
        {
          userId: user.userId,
          userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
          role: user.role,
        },
      );

      if (!result.success) {
        res.status(502).json({ success: false, message: result.message });
        return;
      }

      res.json({
        success: true,
        message: result.message,
        lock_status: result.lock_status,
        previous_status: result.previous_status,
      });
    } catch (error) {
      console.error('Error updating lock status:', error);
      res.status(500).json({ success: false, message: 'Failed to update lock status' });
    }
  },
);

// PUT /api/devices/access-control/:id/lock — OPEN/CLOSE via gateway (same pipeline as BluLok)
registerPut(
  router,
  '/access-control/:id/lock',
  {
    openApiPath: `${MOUNT}/access-control/{id}/lock`,
    tags: ['Devices', 'App'],
    summary: 'Issue access control lock or unlock command',
    security: 'bearer',
    params: deviceIdParamSchema,
    body: lockStatusSchema,
    responses: {
      200: lockCommandResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      502: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireRoles([UserRole.ADMIN, UserRole.DEV_ADMIN, UserRole.FACILITY_ADMIN]),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const id = req.params.id;
      const value = req.body;

      const knex = deviceModel['db'].connection;
      const deviceRow = await knex('access_control_devices')
        .join('gateways', 'access_control_devices.gateway_id', 'gateways.id')
        .select('gateways.facility_id')
        .where('access_control_devices.id', String(id))
        .first();

      if (!deviceRow) {
        res.status(404).json({ success: false, message: 'Device not found' });
        return;
      }

      if (user.role === UserRole.FACILITY_ADMIN) {
        if (!user.facilityIds?.includes(deviceRow.facility_id)) {
          res.status(403).json({ success: false, message: 'Insufficient permissions - facility access required' });
          return;
        }
      }

      if (value.lock_status === 'error') {
        await knex('access_control_devices').where('id', String(id)).update({
          is_locked: true,
          updated_at: new Date(),
        });
        res.json({ success: true, message: 'Access control lock state overridden' });
        return;
      }

      const { LockCommandService } = await import('@/services/lock-command.service');
      const lockCommandService = LockCommandService.getInstance();
      const result = await lockCommandService.issueAccessControlLockCommand(
        String(id),
        value.lock_status as 'locked' | 'unlocked',
        {
          userId: user.userId,
          userName: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || 'User',
          role: user.role,
        },
      );

      if (!result.success) {
        res.status(502).json({ success: false, message: result.message });
        return;
      }

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      console.error('Error updating access-control lock status:', error);
      res.status(500).json({ success: false, message: 'Failed to update lock status' });
    }
  },
);

// GET /api/devices/blulok/:id/denylist - Get denylist entries for a device
registerGet(
  router,
  '/blulok/:id/denylist',
  {
    openApiPath: `${MOUNT}/blulok/{id}/denylist`,
    tags: ['Devices', 'App'],
    summary: 'Get denylist entries for a BluLok device',
    security: 'bearer',
    params: deviceIdParamSchema,
    responses: {
      200: denylistResponseSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { id: deviceId } = req.params;
      const user = req.user!;

      // Check access: facility admin can only view devices in their facilities
      if (AuthService.isFacilityAdmin(user.role)) {
        const knex = DatabaseService.getInstance().connection;
        const device = await knex('blulok_devices')
          .join('units', 'blulok_devices.unit_id', 'units.id')
          .where('blulok_devices.id', deviceId)
          .select('units.facility_id')
          .first();

        if (!device || !user.facilityIds?.includes(device.facility_id)) {
          res.status(403).json({
            success: false,
            message: 'Access denied to this device'
          });
          return;
        }
      }

      const { DenylistEntryModel } = await import('@/models/denylist-entry.model');
      const denylistModel = new DenylistEntryModel();
      const entries = await denylistModel.findByDevice(deviceId);

      // Enrich entries with user information
      const knex = DatabaseService.getInstance().connection;
      const enrichedEntries = await Promise.all(
        entries.map(async (entry) => {
          const userInfo = await knex('users')
            .where('id', entry.user_id)
            .select('id', 'email', 'first_name', 'last_name')
            .first();

          return {
            ...entry,
            user: userInfo || { id: entry.user_id, email: null, first_name: null, last_name: null },
          };
        })
      );

      res.json({
        success: true,
        entries: enrichedEntries,
      });
    } catch (error) {
      console.error('Error fetching device denylist:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch device denylist' });
    }
  }),
);

// GET /api/devices/unassigned - Get unassigned BluLok devices
// Unassigned device listing is admin-only
registerGet(
  router,
  '/unassigned',
  {
    openApiPath: `${MOUNT}/unassigned`,
    tags: ['Devices', 'App'],
    summary: 'List unassigned BluLok devices',
    security: 'bearer',
    query: listQuerySchema,
    responses: {
      200: devicesListResponseSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const q = req.query as Record<string, unknown>;
      const { facility_id, status, search } = q;
      const sortByRaw = (q.sortBy ?? q.sort_by) as string | undefined;
      const sortOrderRaw = (q.sortOrder ?? q.sort_order) as string | undefined;
      const limitParsed = parseListLimit(q.limit);
      const offsetNum = parseListOffset(q.offset);

      // Restrict facility access based on user role
      let allowedFacilityId = facility_id as string | undefined;

      // For facility-scoped users, enforce facility restrictions
      if (AuthService.isFacilityScoped(user.role)) {
        if (facility_id && !user.facilityIds?.includes(facility_id as string)) {
          res.status(403).json({ success: false, message: 'Access denied to this facility' });
          return;
        }
        // If no facility specified, restrict to user's facilities
        if (!facility_id) {
          const userFacilityIds = applyFacilityScope(req);
          if (userFacilityIds && userFacilityIds.length > 0) {
            allowedFacilityId = userFacilityIds[0]; // Default to first facility
          } else {
            // User has no facility access - return empty result
            res.json({ success: true, devices: [], total: 0 });
            return;
          }
        }
      }

      const filters: DeviceFilters = {
        device_type: 'blulok',
        search: search as string,
        sortBy: sortByRaw as any,
        sortOrder: sortOrderRaw === 'desc' ? 'desc' : 'asc',
      };

      const statusFilter = status as string | undefined;
      const fetchAllForEffectiveFilter = Boolean(statusFilter);

      if (!fetchAllForEffectiveFilter) {
        if (limitParsed !== undefined) {
          filters.limit = limitParsed;
        } else {
          filters.limit = DEFAULT_DEVICE_LIST_LIMIT;
        }
        filters.offset = offsetNum;
      }
      if (allowedFacilityId) {
        filters.facility_id = allowedFacilityId;
      }

      let devices: any[] = await deviceModel.findUnassignedDevices(filters);
      let total: number;

      if (fetchAllForEffectiveFilter) {
        const enricher = reachabilityEnrichment();
        devices = await enricher.enrichBluLokList(
          devices.map((d) => ({ ...d, device_category: 'blulok' as const })),
        );
        devices = applyEffectiveStatusFilter(devices, statusFilter);
        total = devices.length;
        const pageSize = limitParsed ?? DEFAULT_DEVICE_LIST_LIMIT;
        devices = devices.slice(offsetNum, offsetNum + pageSize);
      } else {
        const enricher = reachabilityEnrichment();
        devices = await enricher.enrichBluLokList(
          devices.map((d) => ({ ...d, device_category: 'blulok' as const })),
        );
        total = await deviceModel.countUnassignedDevices({
          ...filters,
          limit: undefined,
          offset: undefined,
        });
      }

      res.json({ success: true, devices, total });
    } catch (error) {
      logger.error('Error fetching unassigned devices:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch unassigned devices' });
    }
  }),
);

// POST /api/devices/blulok/:deviceId/assign - Assign device to unit
registerPost(
  router,
  '/blulok/:deviceId/assign',
  {
    openApiPath: `${MOUNT}/blulok/{deviceId}/assign`,
    tags: ['Devices', 'App'],
    summary: 'Assign a BluLok device to a unit',
    security: 'bearer',
    params: blulokDeviceIdParamSchema,
    body: assignBlulokDeviceBodySchema,
    responses: {
      200: assignDeviceResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { deviceId } = req.params;
      const { unit_id } = req.body;

      // RBAC: Only admins and facility admins can assign devices
      // Middleware will be applied at route level

      if (!unit_id) {
        res.status(400).json({
          success: false,
          message: 'unit_id is required'
        });
        return;
      }

      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: 'deviceId is required'
        });
        return;
      }

      // Check if user has access to the device (for facility admins)
      const devicesService = DevicesService.getInstance();
      const hasAccess = await devicesService.hasUserAccessToDevice(deviceId, user.userId, user.role);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this device'
        });
        return;
      }

      // Assign device to unit
      try {
        await devicesService.assignDeviceToUnit(deviceId, unit_id, {
          performedBy: user.userId,
          source: 'api'
        });

        res.status(200).json({
          success: true,
          message: 'Device assigned to unit successfully'
        });
      } catch (error: any) {
        logger.error('Error assigning device:', error);
        res.status(400).json({
          success: false,
          message: error.message || 'Failed to assign device to unit'
        });
      }
    } catch (error) {
      logger.error('Error in assign device route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign device to unit'
      });
    }
  }),
);

// DELETE /api/devices/blulok/:deviceId - Remove BluLok device from cloud inventory (admin / facility admin)
registerDelete(
  router,
  '/blulok/:deviceId',
  {
    openApiPath: `${MOUNT}/blulok/{deviceId}`,
    tags: ['Devices', 'App'],
    summary: 'Remove BluLok device from cloud inventory',
    security: 'bearer',
    params: blulokDeviceIdParamSchema,
    responses: {
      200: removeDeviceResponseSchema,
      403: errorEnvelopeSchema,
      404: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.user!;
    const { deviceId } = req.params;

    if (!deviceId) {
      res.status(400).json({
        success: false,
        message: 'deviceId is required',
      });
      return;
    }

    try {
      const devicesService = DevicesService.getInstance();

      const hasAccess = await devicesService.hasUserAccessToDevice(deviceId, user.userId, user.role);
      if (!hasAccess) {
        res.status(403).json({ success: false, message: 'Access denied to this device' });
        return;
      }

      const summary = await devicesService.removeBluLokDeviceFromCloudInventory(deviceId, {
        performedBy: user.userId,
      });

      res.status(200).json({
        success: true,
        message:
          'Lock removed from cloud inventory. The gateway has been notified to stop reporting this device; if offline, the tombstone command will be delivered on reconnect.',
        removed: summary,
      });
    } catch (error: any) {
      logger.error('Error removing BluLok device from inventory:', error);
      const message = error?.message || 'Failed to remove device from inventory';
      const status = /not found/i.test(message) ? 404 : 500;
      res.status(status).json({
        success: false,
        message,
      });
    }
  }),
);

// DELETE /api/devices/blulok/:deviceId/unassign - Unassign device from unit
registerDelete(
  router,
  '/blulok/:deviceId/unassign',
  {
    openApiPath: `${MOUNT}/blulok/{deviceId}/unassign`,
    tags: ['Devices', 'App'],
    summary: 'Unassign a BluLok device from its unit',
    security: 'bearer',
    params: blulokDeviceIdParamSchema,
    responses: {
      200: assignDeviceResponseSchema,
      400: errorEnvelopeSchema,
      403: errorEnvelopeSchema,
      500: errorEnvelopeSchema,
    },
  },
  requireAdminOrFacilityAdmin,
  asyncHandler(async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;
      const { deviceId } = req.params;

      // RBAC: Only admins and facility admins can unassign devices
      // Middleware will be applied at route level

      if (!deviceId) {
        res.status(400).json({
          success: false,
          message: 'deviceId is required'
        });
        return;
      }

      // Check if user has access to the device (for facility admins)
      const devicesService = DevicesService.getInstance();
      const hasAccess = await devicesService.hasUserAccessToDevice(deviceId, user.userId, user.role);
      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this device'
        });
        return;
      }

      // Unassign device from unit
      try {
        await devicesService.unassignDeviceFromUnit(deviceId, {
          performedBy: user.userId,
          source: 'api'
        });

        res.status(200).json({
          success: true,
          message: 'Device unassigned from unit successfully'
        });
      } catch (error: any) {
        logger.error('Error unassigning device:', error);
        res.status(400).json({
          success: false,
          message: error.message || 'Failed to unassign device from unit'
        });
      }
    } catch (error) {
      logger.error('Error in unassign device route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to unassign device from unit'
      });
    }
  }),
);

export { router as devicesRouter };
