import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { getApiBaseUrl } from '../appConfig';
import { websocketService } from '../websocket.service';

const API_BASE_URL = getApiBaseUrl();

function createHttpClient(): AxiosInstance {
  const api = axios.create({
    baseURL: `${API_BASE_URL}/api/v1`,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  api.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
        delete config.headers['Content-Type'];
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  api.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        try {
          websocketService.disconnect();
        } catch {
          /* ignore */
        }
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return api;
}

export const httpClient = createHttpClient();

export async function get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = config
    ? await httpClient.get(url, config)
    : await httpClient.get(url);
  return response.data;
}

export async function post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  let response;
  if (config) {
    response = await httpClient.post(url, data, config);
  } else if (data !== undefined) {
    response = await httpClient.post(url, data);
  } else {
    response = await httpClient.post(url);
  }
  return response.data;
}

export async function put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = config
    ? await httpClient.put(url, data, config)
    : await httpClient.put(url, data);
  return response.data;
}

export async function del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = config
    ? await httpClient.delete(url, config)
    : await httpClient.delete(url);
  return response.data;
}

export async function patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const response = config
    ? await httpClient.patch(url, data, config)
    : await httpClient.patch(url, data);
  return response.data;
}
