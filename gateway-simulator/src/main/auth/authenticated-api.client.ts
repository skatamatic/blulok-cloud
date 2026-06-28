import { apiBaseUrl } from '@protocol/constants';
import { extractErrorMessage, readJsonBody, unwrapEnvelope } from './backend-http.utils';

export type FetchFn = typeof fetch;

export type AuthenticatedApiClientConfig = {
  backendUrl: string;
  token: string | null;
  fetchFn?: FetchFn;
};

/** Authenticated JSON API transport — no domain-specific route knowledge. */
export class AuthenticatedApiClient {
  private backendUrl: string;
  private token: string | null;
  private readonly fetchFn: FetchFn;

  constructor(config: AuthenticatedApiClientConfig) {
    this.backendUrl = config.backendUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.fetchFn = config.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getBackendUrl(): string {
    return this.backendUrl;
  }

  getToken(): string | null {
    return this.token;
  }

  setBackendUrl(backendUrl: string): void {
    this.backendUrl = backendUrl.replace(/\/+$/, '');
  }

  setToken(token: string | null): void {
    this.token = token;
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.token) throw new Error('Not logged in');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${apiBaseUrl(this.backendUrl)}${normalizedPath}`;
    const res = await this.fetchFn(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const responseBody = await readJsonBody(res);
    if (!res.ok) {
      throw new Error(extractErrorMessage(responseBody, res.status));
    }
    return unwrapEnvelope<T>(responseBody);
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
}
