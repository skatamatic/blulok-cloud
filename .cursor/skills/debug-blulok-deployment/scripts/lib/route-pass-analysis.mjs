export function pickLiveIssuance(history, { deviceId, appDeviceId, devices } = {}) {
  const list = Array.isArray(history) ? history : history?.data ?? [];
  const now = Date.now();
  const isExpired = (row) => {
    if (row?.isExpired === true) return true;
    if (row?.isExpired === false) return false;
    const exp = row?.expiresAt ?? row?.expires_at;
    return exp ? new Date(exp).getTime() <= now : false;
  };
  const deviceIds = new Set();
  if (deviceId) deviceIds.add(deviceId);
  if (appDeviceId && devices?.length) {
    for (const d of devices) {
      if (d.app_device_id === appDeviceId || d.id === appDeviceId) deviceIds.add(d.id);
    }
  }
  let candidates = list;
  if (deviceIds.size) {
    const filtered = list.filter((row) => deviceIds.has(row.deviceId ?? row.device_id));
    if (filtered.length) candidates = filtered;
  }
  const live = candidates.find((row) => !isExpired(row));
  return {
    live: live ?? null,
    latest: candidates[0] ?? null,
    expiredOnly: Boolean(candidates.length && !live),
  };
}

export function expectedAudFromDetails(userDetails) {
  const expected = [];
  for (const fac of userDetails?.facilities ?? []) {
    for (const unit of fac.units ?? []) {
      const serial = unit.device?.device_serial;
      if (serial) expected.push(`lock:${serial}`);
    }
  }
  return [...new Set(expected)];
}

export function analyzeRoutePassEntitlements({
  user,
  userDetails,
  routePassHistory,
  jwtDecoded,
} = {}) {
  const findings = [];
  const role = user?.role ?? jwtDecoded?.payload?.user_role;
  const history = routePassHistory?.data ?? routePassHistory ?? [];
  const expected = expectedAudFromDetails(userDetails);
  const issuedAt = jwtDecoded?.payload?.iat_iso
    ? new Date(jwtDecoded.payload.iat_iso)
    : null;
  const aud = jwtDecoded?.payload?.aud;
  const audEmpty = jwtDecoded
    ? Array.isArray(aud)
      ? aud.length === 0
      : !aud
    : null;

  if (['admin', 'dev_admin', 'facility_admin'].includes(String(role))) {
    if (audEmpty) {
      findings.push({
        severity: 'info',
        code: 'privileged_empty_aud',
        message:
          'Empty aud is expected for admin/dev_admin/facility_admin — devices authorize via user_role.',
      });
    }
    return { findings, expectedAud: expected };
  }

  if (audEmpty) {
    findings.push({
      severity: 'warning',
      code: 'tenant_empty_aud',
      message:
        'Tenant/maintenance pass has empty aud[] — unlock will fail on hardware that checks audience.',
    });
  }

  const units = (userDetails?.facilities ?? []).flatMap((f) =>
    (f.units ?? []).map((u) => ({ ...u, facilityName: f.facility_name })),
  );
  if (units.length === 0 && userDetails) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'no_unit_access',
      message: 'User has no units in /users/:id/details.',
    });
  }

  const unitsWithoutLock = units.filter((u) => !u.device?.device_serial);
  if (unitsWithoutLock.length) {
    findings.push({
      severity: 'likely_root_cause',
      code: 'assignment_without_lock',
      message: `${unitsWithoutLock.length} assigned unit(s) have no blulok_devices row.`,
    });
  }

  if (history.length && history.every((h) => !h.audiences?.length)) {
    findings.push({
      severity: expected.length ? 'warning' : 'info',
      code: 'history_all_empty',
      message: expected.length
        ? 'All logged issuances have empty audiences[], but locks exist now — re-fetch pass on an active device.'
        : 'All logged issuances for this user have empty audiences[].',
    });
  }

  const latest = history[0];
  if (latest && !latest.audiences?.length && expected.length && !jwtDecoded) {
    findings.push({
      severity: 'warning',
      code: 'stale_empty_pass',
      message: `Latest route pass (${latest.issuedAt ?? 'unknown'}) has empty aud; expected today: ${expected.join(', ')}.`,
    });
  }

  const logJti = jwtDecoded?.payload?.jti;
  if (logJti && history.length && !history.some((h) => h.jti === logJti)) {
    findings.push({
      severity: 'info',
      code: 'jti_not_in_log',
      message: 'JWT jti not found in route_pass_issuance_log (retention or logging gap).',
    });
  }

  const devices = userDetails?.devices ?? [];
  const revoked = devices.filter((d) => d.status === 'revoked');
  if (revoked.length) {
    findings.push({
      severity: 'warning',
      code: 'revoked_devices',
      message: `${revoked.length} revoked app device(s) — a stale route pass may still bind that key.`,
    });
  }

  const devicePub = jwtDecoded?.payload?.device_pubkey;
  const matching = devices.find((d) => d.public_key === devicePub);
  if (matching?.status === 'revoked') {
    findings.push({
      severity: 'warning',
      code: 'revoked_device_key',
      message: `JWT device_pubkey matches revoked app device ${matching.app_device_id}.`,
    });
  }

  return { findings, expectedAud: expected, issuedAt };
}
