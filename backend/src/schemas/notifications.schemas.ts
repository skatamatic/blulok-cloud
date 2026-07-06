import Joi from 'joi';
import { strictUuidField, strictUuidFieldOptional } from '@/openapi/common-schemas';
import { IN_APP_NOTIFICATION_TYPES } from '@/constants/in-app-notification.constants';

export const notificationListQuerySchema = Joi.object({
  type: Joi.string()
    .valid(...IN_APP_NOTIFICATION_TYPES)
    .optional(),
  priority: Joi.string().valid('low', 'normal', 'high', 'urgent').optional(),
  isRead: Joi.boolean().optional(),
  facilityId: strictUuidFieldOptional(),
  includeExpired: Joi.boolean().optional(),
  includeHidden: Joi.boolean().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0),
});

export const markMultipleReadSchema = Joi.object({
  notificationIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
});

export const markAllReadSchema = Joi.object({
  facilityId: strictUuidFieldOptional(),
});

export const unreadCountQuerySchema = Joi.object({
  facilityId: strictUuidFieldOptional(),
});

export const notificationIdParamSchema = Joi.object({
  id: strictUuidField(),
});

export const notificationListResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  notifications: Joi.array().items(Joi.object()).required(),
  total: Joi.number().integer().required(),
  unreadCount: Joi.number().integer().required(),
  limit: Joi.number().integer().required(),
  offset: Joi.number().integer().required(),
});

export const unreadCountResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  unreadCount: Joi.number().integer().required(),
});

export const notificationResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  notification: Joi.object().required(),
});

export const markedCountResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  markedCount: Joi.number().integer().required(),
});

export const deleteNotificationResponseSchema = Joi.object({
  success: Joi.boolean().valid(true).required(),
  message: Joi.string().required(),
});
