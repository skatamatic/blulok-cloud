import { BaseConnection } from './base.connection';
import { GatewayConnectionState } from '../../../types/gateway.types';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as https from 'https';

/**
 * HTTP connection implementation for gateway communication
 * Used for the temporary HTTP-based API before WebSocket implementation
 */
export class HttpConnection extends BaseConnection {
  private httpClient: AxiosInstance;

  constructor(
    public readonly gatewayId: string,
    private readonly _baseUrl: string,
    private readonly _apiKey: string,
    private readonly ignoreSslCert: boolean = false
  ) {
    super();

    this.httpClient = axios.create({
      baseURL: this._baseUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': this._apiKey,
      },
      httpsAgent: this.ignoreSslCert ? new https.Agent({
        rejectUnauthorized: false, // Allow self-signed certificates
      }) : undefined,
    });

    // No authentication interceptor needed - using API key header
  }

  /**
   * Connect to the gateway via HTTP (API key authentication)
   */
  public async connect(): Promise<void> {
    if (this.isConnected()) {
      return;
    }

    this.setState(GatewayConnectionState.CONNECTING);

    try {
      // For Mesh Manager API, authentication is via X-API-KEY header
      // No separate sign-in step required
      this.setState(GatewayConnectionState.CONNECTED);
    } catch (error) {
      this.setState(GatewayConnectionState.ERROR);
      throw error;
    }
  }

  /**
   * Disconnect from the gateway
   */
  public async disconnect(): Promise<void> {
    this.setState(GatewayConnectionState.DISCONNECTED);
  }

  /**
   * Send HTTP request (not used for WebSocket-like sending)
   * This is a no-op for HTTP connections
   */
  public async send(_data: Buffer): Promise<void> {
    // HTTP connections don't send raw buffers like WebSocket
    // This method exists for interface compatibility
    throw new Error('HTTP connections do not support raw buffer sending');
  }

  /**
   * Make an HTTP request (authenticated via API key header)
   */
  public async makeRequest<T = any>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    data?: any,
    params?: Record<string, any>
  ): Promise<T> {
    try {
      console.log(`[HttpConnection] Making ${method} request to: ${this.httpClient.defaults.baseURL}${path}`);
      const response: AxiosResponse<T> = await this.httpClient.request({
        method,
        url: path,
        data,
        params,
      });

      // Record the request as sent
      this.recordSent(JSON.stringify({ method, url: path, data, params }).length);
      return response.data;
    } catch (error: any) {
      this.handleError(new Error(`HTTP request failed: ${method} ${path}: ${error.message || error}`));
      throw error;
    }
  }

  /**
   * Get the HTTP client instance (for advanced usage)
   */
  public getHttpClient(): AxiosInstance {
    return this.httpClient;
  }

  /**
   * Check if authenticated (always true for API key auth)
   */
  public isAuthenticated(): boolean {
    return true;
  }
}
