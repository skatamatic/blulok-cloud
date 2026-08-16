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

const httpHelpers = {
  async get(url: string, config?: AxiosRequestConfig) {
    return get(url, config);
  },
  async post(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return post(url, data, config);
  },
  async put(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return put(url, data, config);
  },
  async delete(url: string, config?: AxiosRequestConfig) {
    return del(url, config);
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
