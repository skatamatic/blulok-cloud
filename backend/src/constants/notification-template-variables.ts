/**
 * Outbound SMS/email template placeholders (`{{key}}`).
 * Keep keys in sync with the Settings → Notifications variables modal.
 */

export const FACILITY_BRANDING_CID = 'facility-branding';

export type NotificationTemplateChannel = 'sms' | 'email' | 'both';
export type NotificationTemplateGroup = 'message' | 'facility' | 'recipient' | 'time';

export interface NotificationTemplateVariableDef {
  key: string;
  label: string;
  group: NotificationTemplateGroup;
  channels: NotificationTemplateChannel;
  description: string;
}

export const NOTIFICATION_TEMPLATE_VARIABLES: readonly NotificationTemplateVariableDef[] = [
  {
    key: 'deeplink',
    label: 'Deeplink',
    group: 'message',
    channels: 'both',
    description: 'Invite or password-reset link from the configured deeplink base.',
  },
  {
    key: 'code',
    label: 'Verification code',
    group: 'message',
    channels: 'both',
    description: 'Six-digit OTP. Blank on password-reset messages.',
  },
  {
    key: 'facility_name',
    label: 'Facility name',
    group: 'facility',
    channels: 'both',
    description: 'Recipient’s primary facility. Blank if they have none.',
  },
  {
    key: 'facility_address',
    label: 'Facility address',
    group: 'facility',
    channels: 'both',
    description: 'Street address of that facility.',
  },
  {
    key: 'facility_contact_phone',
    label: 'Facility contact phone',
    group: 'facility',
    channels: 'both',
    description: 'Facility contact phone in readable form (1-403-555-0100).',
  },
  {
    key: 'facility_contact_phone_e164',
    label: 'Facility contact phone (E.164)',
    group: 'facility',
    channels: 'both',
    description: 'Facility contact phone in E.164 (+14035550100).',
  },
  {
    key: 'facility_contact_email',
    label: 'Facility contact email',
    group: 'facility',
    channels: 'both',
    description: 'Facility contact email.',
  },
  {
    key: 'facility_branding_image',
    label: 'Facility branding image',
    group: 'facility',
    channels: 'email',
    description: 'Embeds the facility logo as an inline image. Email only; blank in SMS.',
  },
  {
    key: 'user_first_name',
    label: 'First name',
    group: 'recipient',
    channels: 'both',
    description: 'Recipient’s first name.',
  },
  {
    key: 'user_last_name',
    label: 'Last name',
    group: 'recipient',
    channels: 'both',
    description: 'Recipient’s last name.',
  },
  {
    key: 'user_email',
    label: 'User email',
    group: 'recipient',
    channels: 'both',
    description: 'Recipient’s email, or blank if they have none.',
  },
  {
    key: 'user_phone',
    label: 'User phone',
    group: 'recipient',
    channels: 'both',
    description: 'Recipient’s phone in readable form (1-780-265-6992). Blank if none.',
  },
  {
    key: 'user_phone_e164',
    label: 'User phone (E.164)',
    group: 'recipient',
    channels: 'both',
    description: 'Recipient’s phone in E.164 (+17802656992). Blank if none.',
  },
  {
    key: 'user_unit_names',
    label: 'Unit names',
    group: 'recipient',
    channels: 'both',
    description: 'Assigned unit numbers, comma-separated (e.g. 100, 109).',
  },
  {
    key: 'current_date',
    label: 'Current date',
    group: 'time',
    channels: 'both',
    description: 'Send date in the facility timezone (Pacific / Vancouver if none is set).',
  },
  {
    key: 'current_time',
    label: 'Current time',
    group: 'time',
    channels: 'both',
    description: 'Send time in the facility timezone, with abbreviation (e.g. 11:05 AM MDT).',
  },
  {
    key: 'invite_expires_at',
    label: 'Invite expiry',
    group: 'time',
    channels: 'both',
    description: 'Invite expiry in the facility timezone. Blank on password reset and OTP without an invite.',
  },
] as const;

export function emptyNotificationTemplateVars(): Record<string, string> {
  return Object.fromEntries(
    NOTIFICATION_TEMPLATE_VARIABLES.map((item) => [item.key, '']),
  );
}
