/**
 * Maps device API error messages to form field keys for inline validation.
 */
export function mapDeviceApiErrorToFields(message: string): Record<string, string> {
  const lower = message.toLowerCase();

  if (lower.includes('serial') && (lower.includes('already') || lower.includes('in use'))) {
    return { device_serial: message };
  }
  if (lower.includes('relay')) {
    return { relay_channel: message };
  }
  if (lower.includes('unit') && (lower.includes('already') || lower.includes('belong'))) {
    return { unit_id: message };
  }
  if (lower.includes('gateway')) {
    return { gateway_id: message };
  }

  return { submit: message };
}

export function formatMetadataSideEffectsToast(
  sideEffects?: {
    identityChanged?: boolean;
    accessCodesPushed?: boolean;
  } | null
): { title: string; message?: string } {
  if (!sideEffects) {
    return { title: 'Device metadata updated' };
  }

  const parts: string[] = [];
  if (sideEffects.identityChanged) {
    parts.push('Hardware identity was updated');
  }
  if (sideEffects.accessCodesPushed) {
    parts.push('Access codes were pushed to the gateway');
  }

  if (parts.length === 0) {
    return { title: 'Device metadata updated' };
  }

  return {
    title: 'Device metadata updated',
    message: parts.join('. ') + '.',
  };
}
