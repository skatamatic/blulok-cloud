/** Mirrors backend access-event.types.ts for gateway simulator payloads. */

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

export type AccessEventActor = {
  user_id?: string;
  role: AccessEventActorRole;
  name?: string;
};

export type AccessEventPayload = {
  event_id: string;
  occurred_at: string;
  facility_id: string;
  unit_id?: string;
  device_id: string;
  gateway_id?: string;
  action: AccessEventAction;
  method: AccessEventMethod;
  success: boolean;
  denial_reason?: AccessEventDenialReason;
  reason_message?: string;
  actor?: AccessEventActor;
  keypad?: { entered_code?: string; code_label?: string };
};

export type SimulateAccessEventRequest = {
  deviceKey: string;
  action: AccessEventAction;
  method: AccessEventMethod;
  success: boolean;
  denial_reason?: AccessEventDenialReason;
  unit_id?: string;
  actor?: AccessEventActor;
  keypad?: { entered_code?: string; code_label?: string };
};

export type AccessEventPreset = {
  id: string;
  label: string;
  description: string;
  request: Omit<SimulateAccessEventRequest, 'deviceKey'>;
};

export const ACCESS_EVENT_PRESETS: AccessEventPreset[] = [
  {
    id: 'app-granted',
    label: 'App unlock',
    description: 'Tenant granted access via mobile app',
    request: {
      action: 'access_granted',
      method: 'app',
      success: true,
      actor: { role: 'tenant', name: 'Sim Tenant' },
    },
  },
  {
    id: 'keypad-denied',
    label: 'Keypad denied',
    description: 'Invalid keypad code — out of schedule',
    request: {
      action: 'access_denied',
      method: 'keypad',
      success: false,
      denial_reason: 'out_of_schedule',
      actor: { role: 'unknown', name: 'Keypad User' },
    },
  },
  {
    id: 'route-pass-denied',
    label: 'Route pass denied',
    description: 'Shared user route pass signature invalid',
    request: {
      action: 'access_denied',
      method: 'route_pass',
      success: false,
      denial_reason: 'route_pass_invalid_signature',
      actor: { role: 'shared_user', name: 'Shared Guest' },
    },
  },
  {
    id: 'admin-open',
    label: 'Admin remote open',
    description: 'Facility admin remote unlock',
    request: {
      action: 'admin_remote_open',
      method: 'admin_remote',
      success: true,
      actor: { role: 'facility_admin', name: 'Facility Admin' },
    },
  },
  {
    id: 'keypad-granted',
    label: 'Keypad granted',
    description: 'Valid keypad code entered',
    request: {
      action: 'keypad_attempt',
      method: 'keypad',
      success: true,
      actor: { role: 'tenant', name: 'Keypad Tenant' },
    },
  },
];
