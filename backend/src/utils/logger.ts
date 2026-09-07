import winston from 'winston';
import { config } from '@/config/environment';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  }),
];

// File transports keep handles open and prevent Jest workers from exiting cleanly.
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: logFormat,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: logFormat,
    })
  );
}

export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  transports,
  exceptionHandlers:
    process.env.NODE_ENV === 'test'
      ? []
      : [new winston.transports.File({ filename: 'logs/exceptions.log' })],
  rejectionHandlers:
    process.env.NODE_ENV === 'test'
      ? []
      : [new winston.transports.File({ filename: 'logs/rejections.log' })],
});
