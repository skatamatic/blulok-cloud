import {
  emptyNotificationTemplateVars,
  FACILITY_BRANDING_CID,
} from '@/constants/notification-template-variables';
import { DatabaseService } from '@/services/database.service';
import { UserModel, type User } from '@/models/user.model';
import type { EmailInlineImage } from '@/services/notifications/providers/provider.types';
import {
  formatNotificationDate,
  formatNotificationDateTime,
  formatNotificationTime,
} from '@/utils/datetime.utils';
import { formatPhoneDisplay, formatPhoneE164 } from '@/utils/phone.util';
import { logger } from '@/utils/logger';

export interface TemplateFacilityContext {
  name?: string | null;
  address?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  timezone?: string | null;
  brandingImageBase64?: string;
  brandingImageMimeType?: string | null;
}

export interface RecipientTemplateContext {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  unitNames: string[];
  facility?: TemplateFacilityContext;
}

export interface BuildTemplateRenderInput {
  channel: 'sms' | 'email';
  recipient?: RecipientTemplateContext | null;
  deeplink?: string;
  code?: string;
  inviteExpiresAt?: Date;
  now?: Date;
}

export interface NotificationTemplateRender {
  vars: Record<string, string>;
  emailInlineImages: EmailInlineImage[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function asBase64(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (Buffer.isBuffer(value)) {
    const encoded = value.toString('base64');
    return encoded || undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const marker = 'base64,';
    const idx = trimmed.indexOf(marker);
    return idx >= 0 ? trimmed.slice(idx + marker.length) : trimmed;
  }
  return undefined;
}

function brandingImgTag(facilityName: string): string {
  const alt = escapeHtml(facilityName || 'Facility');
  return (
    `<img src="cid:${FACILITY_BRANDING_CID}" alt="${alt}" width="240" ` +
    'style="max-width:240px;height:auto;display:block;border:0;" />'
  );
}

function extensionForMime(mime: string | null | undefined): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

export function sampleRecipientTemplateContext(): RecipientTemplateContext {
  return {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: '+17802656992',
    unitNames: ['100', '109'],
    facility: {
      name: 'Sample Storage',
      address: '123 Main Street, Calgary, AB',
      contactPhone: '+14035550100',
      contactEmail: 'office@samplestorage.example',
      timezone: 'America/Edmonton',
      brandingImageBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      brandingImageMimeType: 'image/png',
    },
  };
}

export function buildNotificationTemplateRender(
  input: BuildTemplateRenderInput,
): NotificationTemplateRender {
  const now = input.now ?? new Date();
  const vars = emptyNotificationTemplateVars();
  const recipient = input.recipient;
  const facility = recipient?.facility;
  const emailInlineImages: EmailInlineImage[] = [];

  vars.deeplink = input.deeplink ?? '';
  vars.code = input.code ?? '';
  vars.user_first_name = recipient?.firstName?.trim() || '';
  vars.user_last_name = recipient?.lastName?.trim() || '';
  vars.user_email = recipient?.email?.trim() || '';
  vars.user_phone = formatPhoneDisplay(recipient?.phone);
  vars.user_phone_e164 = formatPhoneE164(recipient?.phone);
  vars.user_unit_names = (recipient?.unitNames || []).join(', ');
  vars.facility_name = facility?.name?.trim() || '';
  vars.facility_address = facility?.address?.trim() || '';
  vars.facility_contact_phone = formatPhoneDisplay(facility?.contactPhone);
  vars.facility_contact_phone_e164 = formatPhoneE164(facility?.contactPhone);
  vars.facility_contact_email = facility?.contactEmail?.trim() || '';
  const timeZone = facility?.timezone;
  vars.current_date = formatNotificationDate(now, timeZone);
  vars.current_time = formatNotificationTime(now, timeZone);
  vars.invite_expires_at = input.inviteExpiresAt
    ? formatNotificationDateTime(input.inviteExpiresAt, timeZone)
    : '';

  if (
    input.channel === 'email'
    && facility?.brandingImageBase64
  ) {
    try {
      const content = Buffer.from(facility.brandingImageBase64, 'base64');
      if (content.length > 0) {
        const mime = facility.brandingImageMimeType || 'image/png';
        vars.facility_branding_image = brandingImgTag(vars.facility_name);
        emailInlineImages.push({
          cid: FACILITY_BRANDING_CID,
          filename: `facility-branding.${extensionForMime(mime)}`,
          content,
          contentType: mime,
        });
      }
    } catch (error) {
      logger.warn('Notifications: failed to embed facility branding image', error);
    }
  }

  return { vars, emailInlineImages };
}

export function templatesUseBrandingImage(...templates: Array<string | undefined>): boolean {
  return templates.some((template) => template?.includes('{{facility_branding_image}}'));
}

export async function loadRecipientTemplateContext(
  userId: string,
  options: { includeBranding?: boolean } = {},
): Promise<RecipientTemplateContext | null> {
  const user = await UserModel.findById(userId) as User | undefined;
  const db = DatabaseService.getInstance().connection;

  const unitRows = await db('unit_assignments as ua')
    .join('units as u', 'ua.unit_id', 'u.id')
    .where('ua.tenant_id', userId)
    .select('u.unit_number', 'u.facility_id') as Array<{ unit_number: string; facility_id: string }>;

  const unitNames = [...new Set(
    unitRows
      .map((row) => String(row.unit_number || '').trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let facilityId: string | undefined;
  if (unitRows.length > 0) {
    const counts = new Map<string, number>();
    for (const row of unitRows) {
      if (!row.facility_id) continue;
      counts.set(row.facility_id, (counts.get(row.facility_id) || 0) + 1);
    }
    facilityId = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  } else {
    const association = await db('user_facility_associations as ufa')
      .join('facilities as f', 'ufa.facility_id', 'f.id')
      .where('ufa.user_id', userId)
      .select('f.id')
      .orderBy('f.name')
      .first() as { id?: string } | undefined;
    facilityId = association?.id;
  }

  let facility: TemplateFacilityContext | undefined;
  if (facilityId) {
    const columns = ['name', 'address', 'contact_phone', 'contact_email', 'timezone'];
    if (options.includeBranding) {
      columns.push('branding_image', 'image_mime_type');
    }
    const row = await db('facilities')
      .where({ id: facilityId })
      .select(...columns)
      .first();
    if (row) {
      facility = {
        name: row.name,
        address: row.address,
        contactPhone: row.contact_phone,
        contactEmail: row.contact_email,
        timezone: row.timezone,
        brandingImageBase64: options.includeBranding ? asBase64(row.branding_image) : undefined,
        brandingImageMimeType: options.includeBranding ? row.image_mime_type : undefined,
      };
    }
  }

  if (!user && unitNames.length === 0 && !facility) {
    return null;
  }

  return {
    firstName: user?.first_name,
    lastName: user?.last_name,
    email: user?.email,
    phone: user?.phone_number,
    unitNames,
    facility,
  };
}
