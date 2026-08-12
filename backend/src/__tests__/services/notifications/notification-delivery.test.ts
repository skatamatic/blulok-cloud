import {
  deliverAcrossChannels,
  selectDeliveryChannels,
} from '@/services/notifications/notification-delivery';
import { AppError } from '@/middleware/error.middleware';

jest.mock('@/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const plan = (
  channel: 'SMS' | 'email',
  enabled: boolean,
  recipient: string | undefined,
  send: () => Promise<void> = async () => {},
) => ({ channel, enabled, recipient, send });

describe('selectDeliveryChannels', () => {
  it('uses every enabled channel that has a recipient', () => {
    const { targets, usedDisabledChannelFallback } = selectDeliveryChannels([
      plan('SMS', true, '+15550001111'),
      plan('email', true, 'a@b.com'),
    ]);

    expect(targets.map((t) => t.channel)).toEqual(['SMS', 'email']);
    expect(usedDisabledChannelFallback).toBe(false);
  });

  it('ignores enabled channels with no recipient', () => {
    const { targets } = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', true, 'a@b.com'),
    ]);

    expect(targets.map((t) => t.channel)).toEqual(['email']);
  });

  it('falls back to a disabled channel rather than reaching nobody', () => {
    const { targets, usedDisabledChannelFallback } = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', false, 'a@b.com'),
    ]);

    expect(targets.map((t) => t.channel)).toEqual(['email']);
    expect(usedDisabledChannelFallback).toBe(true);
  });

  it('reports no targets when the account has no contact at all', () => {
    const { targets, usedDisabledChannelFallback } = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', true, undefined),
    ]);

    expect(targets).toEqual([]);
    expect(usedDisabledChannelFallback).toBe(false);
  });
});

describe('deliverAcrossChannels', () => {
  it('sends on both channels and reports them', async () => {
    const sms = jest.fn().mockResolvedValue(undefined);
    const email = jest.fn().mockResolvedValue(undefined);

    const outcome = await deliverAcrossChannels('invite', [
      plan('SMS', true, '+15550001111', sms),
      plan('email', true, 'a@b.com', email),
    ]);

    expect(sms).toHaveBeenCalledTimes(1);
    expect(email).toHaveBeenCalledTimes(1);
    expect(outcome.delivered).toEqual(['SMS', 'email']);
    expect(outcome.errors).toEqual([]);
  });

  it('keeps a successful SMS when email fails, and surfaces the failure', async () => {
    const outcome = await deliverAcrossChannels('invite', [
      plan('SMS', true, '+15550001111'),
      plan('email', true, 'a@b.com', async () => {
        throw new Error('550 mailbox unavailable');
      }),
    ]);

    expect(outcome.delivered).toEqual(['SMS']);
    expect(outcome.errors).toHaveLength(1);
    expect(outcome.errors[0]!.channel).toBe('email');
    // Provider detail stays in logs, not in the client-facing message
    expect(outcome.errors[0]!.message).not.toContain('550');
  });

  it('throws a 502 when every channel fails', async () => {
    const failing = async () => {
      throw new Error('transport down');
    };

    await expect(
      deliverAcrossChannels('invite', [
        plan('SMS', true, '+15550001111', failing),
        plan('email', true, 'a@b.com', failing),
      ]),
    ).rejects.toMatchObject({ statusCode: 502 });
  });

  it('throws a 400 instead of silently doing nothing when there is no recipient', async () => {
    const sms = jest.fn();

    await expect(
      deliverAcrossChannels('password reset', [
        plan('SMS', true, undefined, sms),
        plan('email', false, undefined),
      ]),
    ).rejects.toBeInstanceOf(AppError);

    expect(sms).not.toHaveBeenCalled();
  });
});
