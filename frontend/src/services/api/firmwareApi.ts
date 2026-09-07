import { get, post, del, httpClient } from './httpClient';

export async function uploadFirmware(file: File, metadata: { version: string; target_type?: string; description?: string; release_notes?: string; compatible_models?: string; minimum_version?: string }) {
  const initPayload = {
    phase: 'prepare' as const,
    version: metadata.version,
    target_type: metadata.target_type,
    filename: file.name,
    size_bytes: file.size,
    description: metadata.description,
    release_notes: metadata.release_notes,
    compatible_models: metadata.compatible_models,
    minimum_version: metadata.minimum_version,
  };

  const initResponse = await httpClient.post('/firmware/upload', initPayload);
  const initData = initResponse.data?.data;

  if (initData?.upload_mode === 'signed_url') {
    const putResponse = await fetch(initData.upload_url, {
      method: 'PUT',
      headers: initData.upload_headers,
      body: file,
    });
    if (!putResponse.ok) {
      const detail = await putResponse.text().catch(() => '');
      throw new Error(
        detail
          ? `Direct storage upload failed (${putResponse.status}): ${detail}`
          : `Direct storage upload failed (${putResponse.status})`,
      );
    }

    const completeResponse = await httpClient.post('/firmware/upload', {
      ...initPayload,
      phase: 'finalize',
      upload_id: initData.upload_id,
    });
    return completeResponse.data;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('version', metadata.version);
  if (metadata.target_type) formData.append('target_type', metadata.target_type);
  if (metadata.description) formData.append('description', metadata.description);
  if (metadata.release_notes) formData.append('release_notes', metadata.release_notes);
  if (metadata.compatible_models) formData.append('compatible_models', metadata.compatible_models);
  if (metadata.minimum_version) formData.append('minimum_version', metadata.minimum_version);
  const response = await httpClient.post('/firmware/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 0,
  });
  return response.data;
}

export async function listFirmware(targetType?: string) {
  const params: Record<string, string> = {};
  if (targetType) params.target_type = targetType;
  return get('/firmware', { params });
}

export async function getFirmwareById(id: string) {
  return get(`/firmware/${id}`);
}

export async function deleteFirmware(id: string) {
  return del(`/firmware/${id}`);
}

export async function pushFirmware(
  firmwareId: string,
  gatewayId: string,
  options?: { deliveryMode?: 'v1' | 'v2' },
) {
  const body: Record<string, string> = {};
  if (options?.deliveryMode) {
    body.delivery_mode = options.deliveryMode;
  }
  return post(`/firmware/${firmwareId}/push/${gatewayId}`, body);
}

export async function getFirmwareDeliveryCapabilities() {
  return get('/firmware/delivery-capabilities');
}

export async function getFirmwarePushStatus(gatewayId: string, targetType?: string, includeEvents = true) {
  const params: Record<string, string> = {};
  if (targetType) params.target_type = targetType;
  if (!includeEvents) params.include_events = 'false';
  return get(`/firmware/push-status/${gatewayId}`, { params });
}

export async function getFirmwarePushHistory(gatewayId: string, targetType?: string, limit = 50, offset = 0) {
  const params: Record<string, string> = {};
  if (targetType) params.target_type = targetType;
  if (limit !== 50) params.limit = String(limit);
  if (offset > 0) params.offset = String(offset);
  return get(`/firmware/push-history/${gatewayId}`, { params });
}

export async function cancelFirmwarePush(pushId: string) {
  return post(`/firmware/push/${pushId}/cancel`);
}

export async function getFirmwarePushEvents(pushId: string, limit = 50, offset = 0, eventType?: string) {
  const params: Record<string, string> = {};
  if (limit !== 50) params.limit = String(limit);
  if (offset > 0) params.offset = String(offset);
  if (eventType) params.event_type = eventType;
  return get(`/firmware/push/${pushId}/events`, { params });
}
