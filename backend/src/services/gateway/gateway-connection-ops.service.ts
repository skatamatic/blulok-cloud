import type { Gateway } from '@/models/gateway.model';
import { GatewayService } from '@/services/gateway/gateway.service';
import { GatewayRecoveryService } from '@/services/gateway/gateway-recovery.service';

export type GatewayOpsHttpResult = {
  status: number;
  body: Record<string, unknown>;
};

export function validateGatewayConfigurationForTesting(gateway: {
  gateway_type?: string;
  base_url?: string | null;
  connection_url?: string | null;
}): boolean {
  const { gateway_type, base_url, connection_url } = gateway;

  switch (gateway_type) {
    case 'http':
      return !!(base_url && base_url.trim().length > 0);
    case 'physical':
      return !!(connection_url && connection_url.trim().length > 0);
    case 'simulated':
      return true;
    default:
      return false;
  }
}

const CRITICAL_TEST_ERROR_MARKERS = [
  'API endpoint may not exist',
  'base URL is incorrect',
  'HTML response instead of JSON',
  'API endpoint not found',
  'Cannot connect to gateway',
  'Authentication failed',
];

const CRITICAL_SYNC_ERROR_MARKERS = [
  'API endpoint may not exist',
  'base URL is incorrect',
  'HTML response instead of JSON',
  'API endpoint not found',
  'Gateway not connected',
  'Cannot connect to gateway',
];

function hasCriticalError(errors: string[] | undefined, markers: string[]): boolean {
  return !!errors?.some((error) => markers.some((marker) => error.includes(marker)));
}

function mapTestConnectionErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Gateway lock fetch failed';
  }
  if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
    return 'Cannot connect to gateway. Please check the gateway URL and network connectivity.';
  }
  if (error.message.includes('401') || error.message.includes('Unauthorized')) {
    return 'Authentication failed. Please check gateway credentials.';
  }
  if (error.message.includes('timeout')) {
    return 'Connection timeout. Gateway may be offline or unresponsive.';
  }
  return error.message;
}

/**
 * Initialize (if needed) and sync without updating status — used by test-connection.
 */
export async function runGatewayLockFetchTest(gateway: Gateway): Promise<GatewayOpsHttpResult> {
  if (!validateGatewayConfigurationForTesting(gateway)) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Gateway configuration is incomplete. Please provide required connection details.',
        error: 'Missing required configuration fields for gateway type.',
      },
    };
  }

  try {
    const gatewayService = GatewayService.getInstance();
    let gatewayInstance = gatewayService.getGateway(gateway.id);

    if (!gatewayInstance) {
      try {
        await gatewayService.initializeGateway(gateway);
        gatewayInstance = gatewayService.getGateway(gateway.id);
        if (!gatewayInstance) {
          throw new Error('Failed to initialize gateway');
        }
      } catch (initError) {
        return {
          status: 500,
          body: {
            success: false,
            message: 'Gateway not properly configured or initialized',
            error: initError instanceof Error ? initError.message : 'Unknown initialization error',
          },
        };
      }
    }

    const syncResult = await gatewayInstance.sync(false);
    if (hasCriticalError(syncResult?.syncResults?.errors, CRITICAL_TEST_ERROR_MARKERS)) {
      return {
        status: 400,
        body: {
          success: false,
          message: 'Gateway lock fetch failed - connection or configuration issue',
          error: syncResult.syncResults.errors.join('; '),
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `Gateway lock fetch successful - found ${syncResult.syncResults.devicesFound} locks`,
        data: {
          devicesFound: syncResult.syncResults.devicesFound,
          devicesSynced: syncResult.syncResults.devicesSynced,
          keysRetrieved: syncResult.syncResults.keysRetrieved,
          errors: syncResult.syncResults.errors.length > 0 ? syncResult.syncResults.errors : undefined,
        },
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        message: mapTestConnectionErrorMessage(error),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

/**
 * Manual sync with recovery blocking and critical-error mapping.
 */
export async function runGatewayManualSync(gateway: Gateway): Promise<GatewayOpsHttpResult> {
  if (gateway.facility_id) {
    const blocking = await GatewayRecoveryService.isBlockingActiveForFacility(gateway.facility_id);
    if (blocking) {
      return {
        status: 409,
        body: {
          success: false,
          code: 'recovery_in_progress',
          message:
            'Gateway recovery in progress — manual sync blocked until recovery completes or is bypassed',
        },
      };
    }
  }

  try {
    const gatewayService = GatewayService.getInstance();
    const gatewayInstance = gatewayService.getGateway(gateway.id);

    if (!gatewayInstance) {
      return {
        status: 404,
        body: {
          success: false,
          message: 'Gateway not initialized',
        },
      };
    }

    const syncResult = await gatewayInstance.sync(true);
    if (
      hasCriticalError(syncResult?.syncResults?.errors, CRITICAL_SYNC_ERROR_MARKERS) &&
      syncResult?.syncResults?.errors
    ) {
      return {
        status: 400,
        body: {
          success: false,
          message: syncResult.syncResults.errors.join('; '),
          error: syncResult.syncResults.errors.join('; '),
          data: syncResult,
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Gateway synchronization completed successfully',
        data: syncResult !== undefined ? syncResult : null,
      },
    };
  } catch (error) {
    return {
      status: 500,
      body: {
        success: false,
        message: 'Gateway synchronization failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}
