/** Simulated mobile user — mirrors tenant app onboarding and route-pass flow. */

export type UserDevicePlatform = 'ios' | 'android' | 'web' | 'other';

/** How to tamper with a cached route pass for lock-side simulation. */
export type RoutePassTamperMode = 'none' | 'force_expired' | 'corrupt_signature';

export type CachedRoutePass = {
  facilityId: string;
  facilityName?: string;
  /** Compact JWT string from POST /passes/request. */
  jwt: string;
  fetchedAt: string;
  /** Parsed exp claim (unix seconds) for UI. */
  expiresAt?: number;
  tamper: RoutePassTamperMode;
};

/** Persisted user device — includes private key (main process only). */
export type SimulatedUserDevice = {
  id: string;
  appDeviceId: string;
  platform: UserDevicePlatform;
  deviceName: string;
  /** Standard base64 raw Ed25519 public key (register-key API). */
  publicKeyB64: string;
  /** Base64url raw public key (route pass device_pubkey claim). */
  publicKeyB64Url: string;
  /** Base64url raw private key — never sent to renderer; empty when linked from cloud. */
  privateKeyB64Url: string;
  backendDeviceId?: string;
  registeredAt?: string;
  /** Device row synced from backend (no local private key). */
  linkedFromBackend?: boolean;
  /** False for cloud-linked devices until keys are regenerated locally. */
  hasLocalKeys?: boolean;
  cachedRoutePasses: CachedRoutePass[];
};

/** Full persisted user profile (main process). */
export type UserProfile = {
  id: string;
  label: string;
  backendUrl: string;
  email: string;
  /** Stored for re-login in local dev simulator only (legacy manual users). */
  password?: string;
  cloudUserId?: string;
  role?: string;
  sessionToken?: string;
  /** Unix seconds — cached from JWT exp for session refresh. */
  sessionTokenExpiresAt?: number;
  /** Imported from backend via dev-admin catalog (no password login). */
  importedFromCloud?: boolean;
  opsPublicKeyB64?: string;
  keyGenerationRequired?: boolean;
  isDeviceRegistered?: boolean;
  devices: SimulatedUserDevice[];
  updatedAt: string;
};

/** Renderer-safe device row (no secrets). */
export type UserDeviceState = {
  id: string;
  appDeviceId: string;
  platform: UserDevicePlatform;
  deviceName: string;
  publicKeyB64: string;
  registered: boolean;
  backendDeviceId?: string;
  registeredAt?: string;
  linkedFromBackend?: boolean;
  hasLocalKeys?: boolean;
  cachedRoutePasses: CachedRoutePassState[];
};

export type CachedRoutePassState = {
  facilityId: string;
  facilityName?: string;
  hasPass: boolean;
  jwtPreview: string;
  fetchedAt?: string;
  expiresAt?: number;
  tamper: RoutePassTamperMode;
  aud?: string[];
  sub?: string;
};

export type UserInstanceState = {
  id: string;
  label: string;
  backendUrl: string;
  email: string;
  cloudUserId?: string;
  role?: string;
  loggedIn: boolean;
  opsPublicKeyB64?: string;
  keyGenerationRequired?: boolean;
  devices: UserDeviceState[];
};

export type CreateUserRequest = {
  label: string;
  backendUrl: string;
  email: string;
  password: string;
};

/** Pick an existing backend user to simulate (dev admin session required). */
export type ImportCloudUserRequest = {
  cloudUserId: string;
  label?: string;
};

export type CloudUserSummary = {
  id: string;
  email: string | null;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
};

export type CloudUsersListResponse = {
  users: CloudUserSummary[];
  total: number;
};

export type UpdateUserRequest = {
  label?: string;
  backendUrl?: string;
  email?: string;
  password?: string;
};

export type AddUserDeviceRequest = {
  appDeviceId?: string;
  platform?: UserDevicePlatform;
  deviceName?: string;
};

export type SetRoutePassTamperRequest = {
  facilityId: string;
  tamper: RoutePassTamperMode;
};

export type TryOpenWithUserDeviceRequest = {
  deviceKey: string;
  userId: string;
  appDeviceId: string;
};

export type TryOpenWithUserDeviceResult = {
  granted: boolean;
  message: string;
  denial_reason?: import('./access-events').AccessEventDenialReason;
  lockUpdated: boolean;
};

export type TryOpenWithAccessCodeRequest = {
  deviceKey: string;
  code: string;
};

export type TryOpenWithAccessCodeResult = TryOpenWithUserDeviceResult & {
  schedule_name?: string;
};

/** Full route pass breakdown for simulator inspection (main → renderer). */
export type RoutePassDetails = {
  /** Cached JWT from backend (before tamper). */
  jwt: string;
  /** JWT as presented at the lock (after tamper simulation). */
  presentableJwt: string;
  header: Record<string, unknown>;
  /** Claims decoded from presentableJwt. */
  payload: RoutePassClaims;
  /** Claims decoded from cached jwt before tamper. */
  originalPayload: RoutePassClaims;
  tamper: RoutePassTamperMode;
  fetchedAt?: string;
  expiresAt?: number;
};

export type RoutePassClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  iat?: number;
  exp?: number;
  jti?: string;
  device_pubkey?: string;
  user_role?: string;
  schedules?: unknown[];
};

export type EvaluateRoutePassInput = {
  routePassJwt: string;
  opsPublicKeyB64: string;
  lockSerial: string;
  accessControlCloudId?: string;
  deviceKind: 'lock' | 'access_control';
  nowSec?: number;
  denylistSubs?: string[];
  tamper?: RoutePassTamperMode;
};

export type EvaluateRoutePassResult =
  | { granted: true; claims: RoutePassClaims }
  | { granted: false; reason: import('./access-events').AccessEventDenialReason; message: string };
