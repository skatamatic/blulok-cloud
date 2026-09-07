import { loadDeployConfig } from './load-deploy-config.mjs';

let cachedToken = null;
let cachedTokenKey = null;

export class ApiError extends Error {
  constructor(message, { status, body, method, path } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.method = method;
    this.path = path;
  }
}

export async function apiFetch(baseUrl, pathSuffix, { token, method = 'GET', body, headers: extraHeaders } = {}) {
  const headers = { Accept: 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${pathSuffix}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json.message || json.error || res.statusText;
    throw new ApiError(`${method} ${pathSuffix} → ${res.status}: ${msg}`, {
      status: res.status,
      body: json,
      method,
      path: pathSuffix,
    });
  }
  return json;
}

export async function login(config) {
  const cacheKey = `${config.apiBase}:${config.adminIdentifier}`;
  if (cachedToken && cachedTokenKey === cacheKey) return cachedToken;

  const body = {
    identifier: config.adminIdentifier,
    password: config.adminPassword,
  };
  const res = await apiFetch(config.apiBase, '/auth/login', { method: 'POST', body });
  const token = res.token ?? res.data?.token;
  if (!token) throw new Error('Login succeeded but no token in response');
  cachedToken = token;
  cachedTokenKey = cacheKey;
  return token;
}

export async function withAuth(options = {}, fn) {
  const config = loadDeployConfig(options);
  const token = await login(config);
  return fn({ config, token, api: (pathSuffix, opts = {}) => apiFetch(config.apiBase, pathSuffix, { token, ...opts }) });
}

export function buildQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  const qs = new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
  return `?${qs}`;
}
