import { UserModel, User } from '@/models/user.model';
import { FirstTimeUserService } from '@/services/first-time-user.service';
import { InviteService } from '@/services/invite.service';
import { NotificationService } from '@/services/notifications/notification.service';
import { DatabaseService } from '@/services/database.service';
import bcrypt from 'bcrypt';

describe('FirstTimeUserService', () => {
  const svc = FirstTimeUserService.getInstance();
  const invites = InviteService.getInstance();
  const db = DatabaseService.getInstance().connection;

  test('sendInvite creates invite and dispatches notification with deeplink containing token and phone', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: 'tenant1@example.com',
      email: 'tenant1@example.com',
      phone_number: '+1 (555) 000-1234',
      first_name: 'Tenant',
      last_name: 'One',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const spy = jest.spyOn(NotificationService.getInstance() as any, 'sendInvite').mockResolvedValue(undefined);
    await svc.sendInvite(user);

    const rows = await db('user_invites').where({ user_id: user.id });
    expect(rows.length).toBe(1);
    expect(rows[0].token_hash).toBeTruthy();
    expect(rows[0].expires_at).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    const args = spy.mock.calls[0][0] as any;
    expect(args.deeplink).toContain('token=');
    expect(args.deeplink).toContain('phone=');
    spy.mockRestore();
  });

  test('requestOtp with phone validates ownership and inserts OTP row', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: '+15550001235',
      email: 'tenant2@example.com',
      phone_number: '+1 555-000-1235',
      first_name: 'Tenant',
      last_name: 'Two',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const { token, inviteId } = await invites.createInvite(user.id);
    const res = await svc.requestOtp({ token, phone: '+15550001235' });
    expect(res.inviteId).toBe(inviteId);

    const otps = await db('user_otps').where({ user_id: user.id });
    expect(otps.length).toBe(1);
    expect(otps[0].delivery_method).toBe('sms');
  });

  test('requestOtp with wrong phone is rejected', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: '+15550009999',
      email: 'tenant3@example.com',
      phone_number: '+1 555-000-9999',
      first_name: 'Tenant',
      last_name: 'Three',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const { token } = await invites.createInvite(user.id);
    await expect(svc.requestOtp({ token, phone: '+15550000000' })).rejects.toThrow('Phone does not match');
  });

  test('requestOtp via email path when no phone', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: 'tenant4@example.com',
      email: 'tenant4@example.com',
      phone_number: null,
      first_name: 'Tenant',
      last_name: 'Four',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const { token } = await invites.createInvite(user.id);
    const res = await svc.requestOtp({ token, email: 'tenant4@example.com' });
    expect(res.userId).toBe(user.id);

    const otps = await db('user_otps').where({ user_id: user.id });
    expect(otps.length).toBe(1);
    expect(otps[0].delivery_method).toBe('email');
  });

  test('verifyOtp success with pre-inserted known code', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: '+15550006666',
      email: 'tenant6@example.com',
      phone_number: '+1 555-000-6666',
      first_name: 'Tenant',
      last_name: 'Six',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const { token, inviteId } = await invites.createInvite(user.id);
    const code = '123456';
    const code_hash = await bcrypt.hash(code, 10);
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);
    await db('user_otps').insert({ user_id: user.id, invite_id: inviteId, code_hash, expires_at: expires, attempts: 0, delivery_method: 'sms', last_sent_at: now });

    const ok = await svc.verifyOtp({ token, otp: code });
    expect(ok).toBe(true);
  });

  test('setPassword consumes invite and clears requires_password_reset', async () => {
    const user = await UserModel.create({
      id: undefined as any,
      login_identifier: 'tenant7@example.com',
      email: 'tenant7@example.com',
      phone_number: null,
      first_name: 'Tenant',
      last_name: 'Seven',
      role: 'tenant',
      password_hash: await bcrypt.hash('TempPass!23', 10),
      is_active: true,
      requires_password_reset: true,
    }) as User;

    const { token, inviteId } = await invites.createInvite(user.id);
    const code = '654321';
    const code_hash = await bcrypt.hash(code, 10);
    const now = new Date();
    const expires = new Date(now.getTime() + 5 * 60 * 1000);
    await db('user_otps').insert({ user_id: user.id, invite_id: inviteId, code_hash, expires_at: expires, attempts: 0, delivery_method: 'email', last_sent_at: now });

    await svc.setPassword({ token, otp: code, newPassword: 'NewStrong!23' });

    const updated = await UserModel.findById(user.id) as User;
    expect(updated.requires_password_reset).toBe(false);
    const inviteRow = await db('user_invites').where({ id: inviteId }).first();
    expect(inviteRow.consumed_at).not.toBeNull();
  });
});


