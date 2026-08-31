import Joi from 'joi';
import {
  PASSWORD_COMPLEXITY_MESSAGE,
  PASSWORD_COMPLEXITY_PATTERN,
  PASSWORD_MIN_LENGTH,
} from '@/constants/password.constants';

const passwordField = Joi.string()
  .min(PASSWORD_MIN_LENGTH)
  .pattern(PASSWORD_COMPLEXITY_PATTERN)
  .required()
  .messages({
    'string.pattern.base': PASSWORD_COMPLEXITY_MESSAGE,
  });

export const loginSchema = Joi.object({
  identifier: Joi.string().trim().min(1).optional(),
  email: Joi.string().email().optional(),
  password: Joi.string().min(6).required(),
}).custom((value, helpers) => {
  if (!value.identifier && !value.email) {
    return helpers.error('any.custom', { message: 'identifier or email is required' });
  }
  return value;
}, 'identifier or email required');

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordField,
});

export const inviteAcceptSchema = Joi.object({
  token: Joi.string().required(),
});

/**
 * Optional profile fields on invite endpoints.
 * Clients often send `firstName: ""` / `null` when the profile step is skipped;
 * treat those as absent so a named account is not blocked by empty placeholders.
 */
const optionalInviteName = Joi.string()
  .trim()
  .empty(['', null])
  .min(1)
  .max(100)
  .optional();
const optionalInviteEmail = Joi.string().trim().empty(['', null]).email().optional();

export const inviteRequestOtpSchema = Joi.object({
  token: Joi.string().required(),
  phone: Joi.string().optional(),
  email: optionalInviteEmail,
  firstName: optionalInviteName,
  lastName: optionalInviteName,
});

export const inviteVerifyOtpSchema = Joi.object({
  token: Joi.string().required(),
  otp: Joi.string().pattern(/^\d{6}$/).required(),
});

export const inviteSetPasswordSchema = Joi.object({
  token: Joi.string().required(),
  otp: Joi.string().pattern(/^\d{6}$/).required(),
  newPassword: passwordField,
  firstName: optionalInviteName,
  lastName: optionalInviteName,
  email: optionalInviteEmail,
});

export const forgotPasswordRequestSchema = Joi.object({
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
}).xor('email', 'phone');

export const forgotPasswordVerifySchema = Joi.object({
  token: Joi.string().required(),
});

export const forgotPasswordResetSchema = Joi.object({
  token: Joi.string().required(),
  newPassword: passwordField,
});
