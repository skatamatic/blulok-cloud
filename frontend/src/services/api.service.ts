/**
 * API service facade — domain implementations live in `./api/*`.
 * Call sites keep importing `{ apiService }` from this module.
 */
import { AxiosRequestConfig } from 'axios';
import * as authApi from './api/authApi';
import * as usersApi from './api/usersApi';
import * as facilitiesApi from './api/facilitiesApi';
import * as gatewaysApi from './api/gatewaysApi';
import * as devicesApi from './api/devicesApi';
import * as unitsApi from './api/unitsApi';
import * as deviceGroupsApi from './api/deviceGroupsApi';
import * as accessCodesApi from './api/accessCodesApi';
import * as accessHistoryApi from './api/accessHistoryApi';
import * as notificationsApi from './api/notificationsApi';
import * as keySharingApi from './api/keySharingApi';
import * as firmwareApi from './api/firmwareApi';
import * as widgetsApi from './api/widgetsApi';
import * as systemSettingsApi from './api/systemSettingsApi';
import * as adminApi from './api/adminApi';
import { get, post, put, del } from './api/httpClient';

/** Must forward `<T>` — a non-generic wrapper makes Axios infer `{}` and breaks `tsc`. */
const httpHelpers = {
  async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return get<T>(url, config);
  },
  async post<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return post<T>(url, data, config);
  },
  async put<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return put<T>(url, data, config);
  },
  async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return del<T>(url, config);
  },
};

export const apiService = {
  ...authApi,
  ...usersApi,
  ...facilitiesApi,
  ...gatewaysApi,
  ...devicesApi,
  ...unitsApi,
  ...deviceGroupsApi,
  ...accessCodesApi,
  ...accessHistoryApi,
  ...notificationsApi,
  ...keySharingApi,
  ...firmwareApi,
  ...widgetsApi,
  ...systemSettingsApi,
  ...adminApi,
  ...httpHelpers,
};

export type ApiService = typeof apiService;
