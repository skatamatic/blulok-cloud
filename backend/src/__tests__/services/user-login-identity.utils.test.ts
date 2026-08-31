import {
  LOGIN_IDENTITY_CODES,
  NEW_IDENTITY_SUBJECT_ID,
  matchUserForFmsTenant,
  planLoginIdentity,
  type IdentityUserSnapshot,
} from '@/services/user-login-identity.utils';

const SHARED_PHONE = '+12504882375';

function user(
  id: string,
  email: string | null,
  phone: string | null,
  login = email || phone,
): IdentityUserSnapshot {
  return {
    id,
    email,
    phone_number: phone,
    login_identifier: login,
    is_placeholder: false,
  };
}

describe('planLoginIdentity', () => {
  it('assigns email logins when many users share a phone and have distinct emails', () => {
    const existing = [
      user('u1', 't1@example.com', SHARED_PHONE),
      user('u2', 't2@example.com', SHARED_PHONE),
      user('u3', 't3@example.com', SHARED_PHONE),
      user('u4', 't4@example.com', SHARED_PHONE),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: NEW_IDENTITY_SUBJECT_ID,
      email: 't5@example.com',
      phone: SHARED_PHONE,
    });
    expect(plan).toMatchObject({
      ok: true,
      loginIdentifier: 't5@example.com',
      isPlaceholder: false,
    });
  });

  it('switches both users to phone login when they share an email and have distinct phones', () => {
    const existing = [user('a', 'shared@example.com', '+15551111111', 'shared@example.com')];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: NEW_IDENTITY_SUBJECT_ID,
      email: 'shared@example.com',
      phone: '+15552222222',
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.loginIdentifier).toBe('+15552222222');
      expect(plan.rebalance).toEqual([{ id: 'a', loginIdentifier: '+15551111111' }]);
    }
  });

  it('rejects a third user with the same email and phone as #1', () => {
    const existing = [
      user('u1', 't1@example.com', SHARED_PHONE),
      user('u2', 't2@example.com', SHARED_PHONE),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: NEW_IDENTITY_SUBJECT_ID,
      email: 't1@example.com',
      phone: SHARED_PHONE,
    });
    expect(plan).toMatchObject({
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
    });
  });

  it('rejects a phone-only third user on a shared phone', () => {
    const existing = [
      user('u1', 't1@example.com', SHARED_PHONE),
      user('u2', 't2@example.com', SHARED_PHONE),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: NEW_IDENTITY_SUBJECT_ID,
      email: null,
      phone: SHARED_PHONE,
    });
    expect(plan).toMatchObject({
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
    });
  });

  it('rejects clearing the only exclusive contact when the phone is shared', () => {
    const existing = [
      user('a', 'a@example.com', SHARED_PHONE),
      user('b', 'b@example.com', SHARED_PHONE),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: 'a',
      email: null,
      phone: SHARED_PHONE,
    });
    expect(plan).toMatchObject({
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
    });
  });

  it('rebalances A to phone when B takes A’s email and both have unique phones', () => {
    const existing = [
      user('a', 'a@example.com', '+15551111111', 'a@example.com'),
      user('b', 'b@example.com', '+15552222222', 'b@example.com'),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: 'b',
      email: 'a@example.com',
      phone: '+15552222222',
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) {
      expect(plan.loginIdentifier).toBe('+15552222222');
      expect(plan.rebalance).toEqual([{ id: 'a', loginIdentifier: '+15551111111' }]);
    }
  });

  it('rejects stealing A’s email when A has no unique phone', () => {
    const existing = [
      user('a', 'a@example.com', SHARED_PHONE, 'a@example.com'),
      user('c', 'c@example.com', SHARED_PHONE, 'c@example.com'),
      user('b', 'b@example.com', '+15552222222', 'b@example.com'),
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: 'b',
      email: 'a@example.com',
      phone: '+15552222222',
    });
    expect(plan).toMatchObject({
      ok: false,
      code: LOGIN_IDENTITY_CODES.NO_UNIQUE_LOGIN_HANDLE,
      peerLabel: 'a@example.com',
    });
  });

  it('lets a phone-only user switch to email so a sibling can store the old phone', () => {
    const existing = [user('a', null, SHARED_PHONE, SHARED_PHONE)];
    const upgrade = planLoginIdentity({
      users: existing,
      subjectId: 'a',
      email: 'a@example.com',
      phone: SHARED_PHONE,
    });
    expect(upgrade).toMatchObject({ ok: true, loginIdentifier: 'a@example.com' });

    const afterUpgrade = [user('a', 'a@example.com', SHARED_PHONE, 'a@example.com')];
    const sibling = planLoginIdentity({
      users: afterUpgrade,
      subjectId: NEW_IDENTITY_SUBJECT_ID,
      email: 'b@example.com',
      phone: SHARED_PHONE,
    });
    expect(sibling).toMatchObject({ ok: true, loginIdentifier: 'b@example.com' });
  });

  it('upgrades a placeholder with unique email and a shared phone', () => {
    const existing = [
      user('peer', 'peer@example.com', SHARED_PHONE),
      {
        id: 'ph',
        email: null,
        phone_number: null,
        login_identifier: 'fms-ph:fac:ext',
        is_placeholder: true,
      },
    ];
    const plan = planLoginIdentity({
      users: existing,
      subjectId: 'ph',
      email: 'new@example.com',
      phone: SHARED_PHONE,
    });
    expect(plan).toMatchObject({ ok: true, loginIdentifier: 'new@example.com' });
  });
});

describe('matchUserForFmsTenant', () => {
  it('does not return the phone’s first owner when the tenant has a unique email', () => {
    const users = [
      user('first', 't3@example.com', SHARED_PHONE),
      user('second', 'other@example.com', SHARED_PHONE),
    ];
    const match = matchUserForFmsTenant(
      { email: 't2@example.com', phone: SHARED_PHONE },
      undefined,
      users,
    );
    expect(match).toEqual({ kind: 'none' });
  });

  it('matches an exclusive email even when the phone is shared', () => {
    const users = [user('t3', 't3@example.com', SHARED_PHONE)];
    const match = matchUserForFmsTenant(
      { email: 't3@example.com', phone: SHARED_PHONE },
      undefined,
      users,
    );
    expect(match.kind).toBe('user');
    if (match.kind === 'user') expect(match.user.id).toBe('t3');
  });

  it('matches exclusive phone only when the tenant has no email', () => {
    const users = [user('phone', null, SHARED_PHONE, SHARED_PHONE)];
    expect(
      matchUserForFmsTenant({ email: null, phone: SHARED_PHONE }, undefined, users).kind,
    ).toBe('user');
    expect(
      matchUserForFmsTenant({ email: 'new@example.com', phone: SHARED_PHONE }, undefined, users).kind,
    ).toBe('none');
  });

  it('reports IDENTITY_CONFLICT when email and phone belong to different users', () => {
    const users = [
      user('email-owner', 'a@example.com', '+15551111111'),
      user('phone-owner', 'b@example.com', '+15552222222'),
    ];
    const match = matchUserForFmsTenant(
      { email: 'a@example.com', phone: '+15552222222' },
      undefined,
      users,
    );
    expect(match).toMatchObject({
      kind: 'conflict',
      code: LOGIN_IDENTITY_CODES.IDENTITY_CONFLICT,
    });
  });
});
