export const ACCESS_EVENT_ACTIONS = [
  'access_granted',
  'access_denied',
  'admin_remote_open',
  'keypad_attempt',
] as const;

export type AccessEventAction = (typeof ACCESS_EVENT_ACTIONS)[number];

export const ACCESS_EVENT_ACTOR_ROLES = [
  'tenant',
  'shared_user',
  'admin',
  'dev_admin',
  'facility_admin',
  'maintenance',
  'system',
  'gateway',
  'unknown',
] as const;

export type AccessEventActorRole = (typeof ACCESS_EVENT_ACTOR_ROLES)[number];

export const ACCESS_EVENT_METHODS = [
  'app',
  'mobile_key',
  'keypad',
  'admin_remote',
  'system',
  'route_pass',
  'unknown',
] as const;

export type AccessEventMethod = (typeof ACCESS_EVENT_METHODS)[number];

export const ACCESS_EVENT_DENIAL_REASONS = [
  'out_of_schedule',
  'route_pass_expired',
  'route_pass_invalid_signature',
  'route_pass_wrong_lock',
  'internal_error',
  'denylist_blocked',
  'insufficient_permissions',
  'invalid_credential',
  'unknown_error',
  'other',
] as const;

export type AccessEventDenialReason = (typeof ACCESS_EVENT_DENIAL_REASONS)[number];

export const ACCESS_EVENT_DEVICE_TYPES = ['blulok', 'access_control'] as const;

export type AccessEventDeviceType = (typeof ACCESS_EVENT_DEVICE_TYPES)[number];

export interface AccessEventActor {
  user_id?: string;
  role: AccessEventActorRole;
  name?: string;
  app_device_id?: string;
}

export interface AccessEventKeypadContext {
  entered_code?: string;
  code_id?: string;
  code_label?: string;
  schedule_id?: string;
  schedule_name?: string;
  zone_id?: string;
  zone_name?: string;
}

export interface AccessEventRoutePassContext {
  route_pass_id?: string;
  issuance_id?: string;
  nonce?: string;
}

export interface AccessEventPayload {
  event_id: string;
  correlation_id?: string;
  occurred_at: string;
  facility_id: string;
  unit_id?: string;
  /** Access device hardware serial / access_id / lock_id (cloud rewrites to device PK when resolved). */
  device_id: string;
  /** Optional hint: steers AC vs BluLok lookup order. Not gate/door/elevator. */
  device_type?: AccessEventDeviceType;
  /** AC relay channel when serial is shared across relays. */
  relay_channel?: number;
  gateway_id?: string;
  action: AccessEventAction;
  method: AccessEventMethod;
  success: boolean;
  denial_reason?: AccessEventDenialReason;
  reason_message?: string;
  actor?: AccessEventActor;
  keypad?: AccessEventKeypadContext;
  route_pass?: AccessEventRoutePassContext;
  metadata?: Record<string, unknown>;
}
