import type { Request } from 'express';

export const NOT_BOUND_GATEWAY_CODE = 'not_bound_gateway';

export type OperationalSyncReject = {
  status: number;
  code: string;
  message: string;
};

export function readGatewayProxySessionHeaders(req: Request): {
  sessionRole?: string;
  gatewayId?: string;
} {
  const sessionRole = String(req.headers['x-gateway-session-role'] || '').trim() || undefined;
  const gatewayId = String(req.headers['x-gateway-id'] || '').trim() || undefined;
  return { sessionRole, gatewayId };
}

/**
 * Inventory and state sync may only be accepted from the bound production gateway.
 * Enforced when the request is proxied over a gateway WebSocket (session role header present).
 */
export function assertBoundGatewayForOperationalSync(params: {
  sessionRole?: string;
  requestingGatewayId?: string;
  boundGatewayId?: string;
}): { allowed: true } | { allowed: false; reject: OperationalSyncReject } {
  const { sessionRole, requestingGatewayId, boundGatewayId } = params;

  if (!sessionRole) {
    return { allowed: true };
  }

  if (sessionRole === 'swap_candidate') {
    return {
      allowed: false,
      reject: {
        status: 403,
        code: NOT_BOUND_GATEWAY_CODE,
        message:
          'Inventory and state sync are only accepted from the bound production gateway — complete swap recovery first',
      },
    };
  }

  if (sessionRole === 'active' && boundGatewayId) {
    if (!requestingGatewayId || requestingGatewayId !== boundGatewayId) {
      return {
        allowed: false,
        reject: {
          status: 403,
          code: NOT_BOUND_GATEWAY_CODE,
          message: 'Gateway is not the bound production unit for this facility',
        },
      };
    }
  }

  return { allowed: true };
}

export function rejectOperationalSyncIfNotBound(
  req: Request,
  boundGatewayId: string | undefined,
): OperationalSyncReject | null {
  const { sessionRole, gatewayId } = readGatewayProxySessionHeaders(req);
  const verdict = assertBoundGatewayForOperationalSync({
    sessionRole,
    requestingGatewayId: gatewayId,
    boundGatewayId,
  });
  return verdict.allowed ? null : verdict.reject;
}
