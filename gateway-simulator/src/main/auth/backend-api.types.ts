export type CloudUserSummary = {
  id: string;
  email: string | null;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
};

export type CloudUserDeviceRecord = {
  id: string;
  app_device_id: string;
  platform: 'ios' | 'android' | 'web' | 'other';
  device_name?: string | null;
  public_key?: string | null;
  status?: string;
  updated_at?: string;
  created_at?: string;
};

export type CloudUserDetail = {
  id: string;
  email: string | null;
  phoneNumber?: string | null;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  devices?: CloudUserDeviceRecord[];
};

export type MintUserSessionResult = {
  token: string;
  expiresAt?: number;
  user: { id: string; email: string | null; firstName: string; lastName: string; role: string };
  opsPublicKeyB64?: string;
};

export type FmsConfigRecord = {
  id: string;
  facility_id: string;
  facility_name?: string | null;
  provider_type: string;
  is_enabled: boolean;
  config: {
    providerType?: string;
    customSettings?: { facilityId?: string };
    features?: { supportsWebhooks?: boolean };
    syncSettings?: {
      webhookAuthMode?: 'hmac' | 'header_secret' | 'none';
      webhookSecret?: string;
      webhookAuthHeader?: string;
      webhookSignatureHeader?: string;
    };
  };
};
