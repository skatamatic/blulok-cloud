import Joi from 'joi';

export const devLogsQuerySchema = Joi.object({
  type: Joi.string().valid('all', 'combined', 'error', 'app', 'access').default('all'),
  lines: Joi.string().optional(),
});
