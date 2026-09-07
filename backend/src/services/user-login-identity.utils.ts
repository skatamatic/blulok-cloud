import { toE164 } from '@/utils/phone.util';
import { isFmsPlaceholderLoginIdentifier } from '@/services/fms/fms-placeholder-user.utils';

export const LOGIN_IDENTITY_CODES = {
  NO_UNIQUE_LOGIN_HANDLE: 'NO_UNIQUE_LOGIN_HANDLE',
  IDENTITY_CONFLICT: 'IDENTITY_CONFLICT',
  AMBIGUOUS_CONTACT: 'AMBIGUOUS_CONTACT',
} as const;

export type LoginIdentityCode =
  (typeof LOGIN_IDENTITY_CODES)[keyof typeof LOGIN_IDENTITY_CODES];

export type IdentityUserSnapshot = {
  id: string;
  email?: string | null;
  phone_number?: string | null;
  login_identifier?: string | null;
  is_placeholder?: boolean | number | null;
  is_active?: boolean | number | null;
  first_name?: string | null;
  last_name?: string | null;
};

export const NEW_IDENTITY_SUBJECT_ID = '__new__';

export function normalizeIdentityEmail(raw?: string | null): string | null {
  const value = raw?.trim().toLowerCase() || '';
  return value || null;
}

export function normalizeIdentityPhone(raw?: string | null): string | null {
  const value = raw?.trim() || '';
  if (!value) return null;
  const e164 = toE164(value, 'US');
  if (!e164) return null;
  return e164.toLowerCase();
}

export function identityUserLabel(user: IdentityUserSnapshot): string {
  return (
    user.email?.trim() ||
    user.phone_number?.trim() ||
    user.login_identifier?.trim() ||
    [user.first_name, user.last_name].filter(Boolean).join(' ').trim() ||
    'another user'
  );
}

function isPlaceholderSnapshot(user: IdentityUserSnapshot): boolean {
  if (user.is_placeholder === true || user.is_placeholder === 1) return true;
  return isFmsPlaceholderLoginIdentifier(user.login_identifier);
}

/** Contact values that count toward exclusivity (skips reserved placeholder logins). */
export function contactKeysForUser(user: IdentityUserSnapshot): string[] {
  const keys = new Set<string>();
  const email = normalizeIdentityEmail(user.email);
  const phone = normalizeIdentityPhone(user.phone_number);
  if (email) keys.add(email);
  if (phone) keys.add(phone);
  const login = user.login_identifier?.trim().toLowerCase() || '';
  if (login && !isFmsPlaceholderLoginIdentifier(login)) {
    keys.add(login);
  }
  return [...keys];
}

export function buildContactOwnerIndex(
  users: IdentityUserSnapshot[],
): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();
  for (const user of users) {
    if (isPlaceholderSnapshot(user) && !normalizeIdentityEmail(user.email) && !normalizeIdentityPhone(user.phone_number)) {
      continue;
    }
    for (const key of contactKeysForUser(user)) {
      const owners = index.get(key) ?? new Set<string>();
      owners.add(user.id);
      index.set(key, owners);
    }
  }
  return index;
}

export function exclusiveOwnerId(
  value: string | null | undefined,
  index: Map<string, Set<string>>,
): string | null {
  if (!value) return null;
  const owners = index.get(value);
  if (!owners || owners.size !== 1) return null;
  return [...owners][0];
}

export function isExclusiveContact(
  value: string | null | undefined,
  userId: string,
  index: Map<string, Set<string>>,
): boolean {
  return exclusiveOwnerId(value, index) === userId;
}

export function chooseLoginIdentifier(
  email: string | null,
  phone: string | null,
  userId: string,
  index: Map<string, Set<string>>,
): string | null {
  if (email && isExclusiveContact(email, userId, index)) return email;
  if (phone && isExclusiveContact(phone, userId, index)) return phone;
  return null;
}

export function applyProposedUser(
  users: IdentityUserSnapshot[],
  subjectId: string,
  email: string | null,
  phone: string | null,
): IdentityUserSnapshot[] {
  const next = users.map((user) => ({ ...user }));
  const existing = next.find((user) => user.id === subjectId);
  if (existing) {
    existing.email = email;
    existing.phone_number = phone;
    return next;
  }
  next.push({
    id: subjectId,
    email,
    phone_number: phone,
    login_identifier: null,
    is_placeholder: false,
  });
  return next;
}

export type LoginIdentityPlan =
  | {
      ok: true;
      loginIdentifier: string;
      isPlaceholder: false;
      rebalance: Array<{ id: string; loginIdentifier: string }>;
    }
  | {
      ok: true;
      loginIdentifier: string;
      isPlaceholder: true;
      rebalance: [];
    }
  | {
      ok: false;
      code: typeof LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE | typeof LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT;
      message: string;
      peerLabel?: string;
    };

function formatNoUniqueHandleMessage(email: string | null, phone: string | null): string {
  const parts = [email, phone].filter((part): part is string => Boolean(part));
  const listed = parts.length > 0 ? parts.join(' and ') : 'these contacts';
  return (
    `${listed} ${parts.length === 1 ? 'is' : 'are'} already used by other BluLok users. ` +
    'Each account needs a unique email or a unique phone to log in.'
  );
}

/**
 * Plan login_identifier for a create/update, including peer rebalance.
 * `users` is the current snapshot (subject included if they already exist).
 */
export function planLoginIdentity(options: {
  users: IdentityUserSnapshot[];
  subjectId: string;
  email: string | null;
  phone: string | null;
  allowPlaceholder?: boolean;
}): LoginIdentityPlan {
  const email = normalizeIdentityEmail(options.email);
  const phone = normalizeIdentityPhone(options.phone);
  const subjectId = options.subjectId;

  const beforeIndex = buildContactOwnerIndex(options.users);
  const emailOwnerBefore = exclusiveOwnerId(email, beforeIndex);
  const phoneOwnerBefore = exclusiveOwnerId(phone, beforeIndex);
  if (
    emailOwnerBefore &&
    phoneOwnerBefore &&
    emailOwnerBefore !== phoneOwnerBefore &&
    emailOwnerBefore !== subjectId &&
    phoneOwnerBefore !== subjectId
  ) {
    return {
      ok: false,
      code: LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT,
      message: 'Email and phone belong to different existing users',
    };
  }

  if (!email && !phone) {
    if (options.allowPlaceholder) {
      return {
        ok: true,
        loginIdentifier: '',
        isPlaceholder: true,
        rebalance: [],
      };
    }
    return {
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
      message: 'Add a unique email or a unique phone number so this account can log in.',
    };
  }

  const working = applyProposedUser(options.users, subjectId, email, phone);
  const afterIndex = buildContactOwnerIndex(working);
  const loginIdentifier = chooseLoginIdentifier(email, phone, subjectId, afterIndex);
  if (!loginIdentifier) {
    return {
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
      message: formatNoUniqueHandleMessage(email, phone),
    };
  }

  const rebalance: Array<{ id: string; loginIdentifier: string }> = [];
  for (const peer of working) {
    if (peer.id === subjectId) continue;
    if (isPlaceholderSnapshot(peer)) continue;
    const peerEmail = normalizeIdentityEmail(peer.email);
    const peerPhone = normalizeIdentityPhone(peer.phone_number);
    const nextLogin = chooseLoginIdentifier(peerEmail, peerPhone, peer.id, afterIndex);
    const currentLogin = peer.login_identifier?.trim().toLowerCase() || '';
    if (!nextLogin) {
      return {
        ok: false,
        code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
        message: `This change would leave ${identityUserLabel(peer)} without a unique email or phone to log in.`,
        peerLabel: identityUserLabel(peer),
      };
    }
    if (nextLogin !== currentLogin) {
      rebalance.push({ id: peer.id, loginIdentifier: nextLogin });
    }
  }

  return {
    ok: true,
    loginIdentifier,
    isPlaceholder: false,
    rebalance,
  };
}

export type FmsTenantMatch<T extends IdentityUserSnapshot> =
  | { kind: 'user'; user: T }
  | { kind: 'none' }
  | { kind: 'conflict'; code: typeof LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT; message: string };

/** Resolve an existing user for an incoming FMS tenant using exclusive-handle rules. */
export function matchUserForFmsTenant<T extends IdentityUserSnapshot>(
  fmsTenant: { email?: string | null; phone?: string | null },
  mapping: { internal_id: string } | undefined,
  users: T[],
): FmsTenantMatch<T> {
  const usersById = new Map(users.map((user) => [user.id, user]));
  if (mapping) {
    const mapped = usersById.get(mapping.internal_id);
    if (mapped) return { kind: 'user', user: mapped };
  }

  const email = normalizeIdentityEmail(fmsTenant.email);
  const phone = normalizeIdentityPhone(fmsTenant.phone);
  const loginUsers = (value: string | null) =>
    users.filter((user) => {
      const login = user.login_identifier?.trim().toLowerCase() || '';
      if (!login || isFmsPlaceholderLoginIdentifier(login)) return false;
      return Boolean(value) && login === value;
    });

  const byEmailLogin = loginUsers(email);
  const byPhoneLogin = email ? [] : loginUsers(phone);
  if (byEmailLogin.length > 1 || byPhoneLogin.length > 1) {
    return {
      kind: 'conflict',
      code: LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT,
      message: 'Email and phone belong to different existing users',
    };
  }

  const index = buildContactOwnerIndex(users);
  const emailOwner = exclusiveOwnerId(email, index);
  const phoneOwner = exclusiveOwnerId(phone, index);
  if (emailOwner && phoneOwner && emailOwner !== phoneOwner) {
    return {
      kind: 'conflict',
      code: LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT,
      message: 'Email and phone belong to different existing users',
    };
  }
  if (byEmailLogin.length === 1) {
    return { kind: 'user', user: byEmailLogin[0] };
  }
  if (byPhoneLogin.length === 1) {
    return { kind: 'user', user: byPhoneLogin[0] };
  }
  if (email && emailOwner) {
    const user = usersById.get(emailOwner);
    if (user) return { kind: 'user', user };
  }
  if (!email && phone && phoneOwner) {
    const user = usersById.get(phoneOwner);
    if (user) return { kind: 'user', user };
  }
  return { kind: 'none' };
}

export function tenantHasUniqueLoginHandle(
  fmsTenant: { email?: string | null; phone?: string | null },
  users: IdentityUserSnapshot[],
): boolean {
  const plan = planLoginIdentity({
    users,
    subjectId: NEW_IDENTITY_SUBJECT_ID,
    email: fmsTenant.email ?? null,
    phone: fmsTenant.phone ?? null,
    allowPlaceholder: !normalizeIdentityEmail(fmsTenant.email) && !normalizeIdentityPhone(fmsTenant.phone),
  });
  return plan.ok;
}

export function formatNoUniqueLoginHandleReview(email?: string | null, phone?: string | null): string {
  return formatNoUniqueHandleMessage(normalizeIdentityEmail(email), normalizeIdentityPhone(phone));
}

export class LoginIdentityError extends Error {
  public readonly code: LoginIdentityCode;
  public readonly statusCode: number;

  constructor(code: LoginIdentityCode, message: string, statusCode = 400) {
    super(message);
    this.name = 'LoginIdentityError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
