import {
  buildNotificationTemplateRender,
  sampleRecipientTemplateContext,
  templatesUseBrandingImage,
} from '@/services/notifications/notification-template-context';
import { FACILITY_BRANDING_CID } from '@/constants/notification-template-variables';

describe('buildNotificationTemplateRender', () => {
  const now = new Date('2026-09-06T17:05:00.000Z');
  const inviteExpiresAt = new Date('2026-09-07T17:05:00.000Z');

  it('fills facility, user, date, and invite expiry fields', () => {
    const { vars, emailInlineImages } = buildNotificationTemplateRender({
      channel: 'sms',
      recipient: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        phone: '+17802656992',
        unitNames: ['109', '100'],
        facility: {
          name: 'HQ Storage',
          address: '1 Warehouse Rd',
          contactPhone: '4035550100',
          contactEmail: 'office@hq.example',
        },
      },
      deeplink: 'blulok://invite?token=abc',
      code: '123456',
      inviteExpiresAt,
      now,
    });

    expect(vars.deeplink).toBe('blulok://invite?token=abc');
    expect(vars.code).toBe('123456');
    expect(vars.user_first_name).toBe('Ada');
    expect(vars.user_last_name).toBe('Lovelace');
    expect(vars.user_email).toBe('ada@example.com');
    expect(vars.user_phone).toBe('1-780-265-6992');
    expect(vars.user_phone_e164).toBe('+17802656992');
    expect(vars.user_unit_names).toBe('109, 100');
    expect(vars.facility_name).toBe('HQ Storage');
    expect(vars.facility_address).toBe('1 Warehouse Rd');
    expect(vars.facility_contact_phone).toBe('1-403-555-0100');
    expect(vars.facility_contact_phone_e164).toBe('+14035550100');
    expect(vars.facility_contact_email).toBe('office@hq.example');
    expect(vars.current_date).toBe('September 6, 2026');
    expect(vars.current_time).toMatch(/^10:05 AM /);
    expect(vars.invite_expires_at).toMatch(/^September 7, 2026 at 10:05 AM /);
    expect(vars.facility_branding_image).toBe('');
    expect(emailInlineImages).toHaveLength(0);
  });

  it('leaves optional fields blank when the recipient has no profile or facility', () => {
    const { vars } = buildNotificationTemplateRender({
      channel: 'email',
      recipient: { unitNames: [] },
      now,
    });
    expect(vars.user_first_name).toBe('');
    expect(vars.user_email).toBe('');
    expect(vars.user_phone).toBe('');
    expect(vars.user_phone_e164).toBe('');
    expect(vars.user_unit_names).toBe('');
    expect(vars.facility_name).toBe('');
    expect(vars.invite_expires_at).toBe('');
  });

  it('embeds branding as a CID image for email only', () => {
    const recipient = sampleRecipientTemplateContext();
    const email = buildNotificationTemplateRender({
      channel: 'email',
      recipient,
      now,
    });
    const sms = buildNotificationTemplateRender({
      channel: 'sms',
      recipient,
      now,
    });

    expect(email.vars.facility_branding_image).toContain(`cid:${FACILITY_BRANDING_CID}`);
    expect(email.emailInlineImages).toHaveLength(1);
    expect(email.emailInlineImages[0].cid).toBe(FACILITY_BRANDING_CID);
    expect(sms.vars.facility_branding_image).toBe('');
    expect(sms.emailInlineImages).toHaveLength(0);
  });

  it('formats dates in the facility timezone', () => {
    const { vars } = buildNotificationTemplateRender({
      channel: 'sms',
      recipient: {
        unitNames: [],
        facility: { timezone: 'America/Edmonton' },
      },
      inviteExpiresAt,
      now,
    });
    expect(vars.current_date).toBe('September 6, 2026');
    expect(vars.current_time).toMatch(/^11:05 AM /);
    expect(vars.invite_expires_at).toMatch(/^September 7, 2026 at 11:05 AM /);
  });

  it('detects branding tokens only when present', () => {
    expect(templatesUseBrandingImage('Hello {{user_first_name}}')).toBe(false);
    expect(templatesUseBrandingImage(undefined, 'Logo {{facility_branding_image}}')).toBe(true);
  });
});
