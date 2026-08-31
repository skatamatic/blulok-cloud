import {
  deliverAcrossChannels,
  normalizeChannelPreference,
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

describe('normalizeChannelPreference', () => {
  it('defaults unknown values to both', () => {
    expect(normalizeChannelPreference(undefined)).toBe('both');
    expect(normalizeChannelPreference('nope')).toBe('both');
  });

  it('keeps valid preferences', () => {
    expect(normalizeChannelPreference('prefer_sms')).toBe('prefer_sms');
    expect(normalizeChannelPreference('prefer_email')).toBe('prefer_email');
    expect(normalizeChannelPreference('both')).toBe('both');
  });
});

describe('selectDeliveryChannels', () => {
  it('uses every enabled channel that has a recipient when preference is both', () => {
    const targets = selectDeliveryChannels([
      plan('SMS', true, '+15550001111'),
      plan('email', true, 'a@b.com'),
    ]);

    expect(targets.map((t) => t.channel)).toEqual(['SMS', 'email']);
  });

  it('ignores enabled channels with no recipient', () => {
    const targets = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', true, 'a@b.com'),
    ]);

    expect(targets.map((t) => t.channel)).toEqual(['email']);
  });

  it('never falls back to a disabled channel', () => {
    const targets = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', false, 'a@b.com'),
    ]);

    expect(targets).toEqual([]);
  });

  it('prefers SMS when both channels are reachable', () => {
    const targets = selectDeliveryChannels(
      [plan('SMS', true, '+15550001111'), plan('email', true, 'a@b.com')],
      'prefer_sms',
    );

    expect(targets.map((t) => t.channel)).toEqual(['SMS']);
  });

  it('prefers email when both channels are reachable', () => {
    const targets = selectDeliveryChannels(
      [plan('SMS', true, '+15550001111'), plan('email', true, 'a@b.com')],
      'prefer_email',
    );

    expect(targets.map((t) => t.channel)).toEqual(['email']);
  });

  it('uses the other enabled channel when the preferred one has no recipient', () => {
    const targets = selectDeliveryChannels(
      [plan('SMS', true, undefined), plan('email', true, 'a@b.com')],
      'prefer_sms',
    );

    expect(targets.map((t) => t.channel)).toEqual(['email']);
  });

  it('reports no targets when the account has no contact at all', () => {
    const targets = selectDeliveryChannels([
      plan('SMS', true, undefined),
      plan('email', true, undefined),
    ]);

    expect(targets).toEqual([]);
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

  it('throws a 400 when the only contact sits on a disabled channel', async () => {
    const email = jest.fn();

    await expect(
      deliverAcrossChannels('invite', [
        plan('SMS', true, undefined),
        plan('email', false, 'a@b.com', email),
      ]),
    ).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/no enabled notification channel/i),
    });

    expect(email).not.toHaveBeenCalled();
  });

  it('sends only SMS when preference is prefer_sms', async () => {
    const sms = jest.fn().mockResolvedValue(undefined);
    const email = jest.fn().mockResolvedValue(undefined);

    const outcome = await deliverAcrossChannels(
      'invite',
      [plan('SMS', true, '+15550001111', sms), plan('email', true, 'a@b.com', email)],
      'prefer_sms',
    );

    expect(sms).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
    expect(outcome.delivered).toEqual(['SMS']);
  });

  it('sends only email when preference is prefer_email', async () => {
    const sms = jest.fn().mockResolvedValue(undefined);
    const email = jest.fn().mockResolvedValue(undefined);

    const outcome = await deliverAcrossChannels(
      'OTP',
      [plan('SMS', true, '+15550001111', sms), plan('email', true, 'a@b.com', email)],
      'prefer_email',
    );

    expect(email).toHaveBeenCalledTimes(1);
    expect(sms).not.toHaveBeenCalled();
    expect(outcome.delivered).toEqual(['email']);
  });
});
