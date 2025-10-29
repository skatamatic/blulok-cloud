import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { config } from '@/config/environment';

/**
 * Error Handling Middleware
 *
 * Comprehensive error handling and response formatting for the BluLok API.
 * Provides structured error responses, logging, and graceful error recovery.
 *
 * Key Features:
 * - Structured error responses with consistent format
 * - Error classification (operational vs programming errors)
 * - Environment-specific error details (development vs production)
 * - Comprehensive error logging with request context
 * - Async route handler wrapper for automatic error catching
 *
 * Error Types:
 * - Operational Errors: Expected errors (validation, authentication, etc.)
 * - Programming Errors: Unexpected errors (bugs, database failures, etc.)
 *
 * Error Response Format:
 * ```json
 * {
 *   "success": false,
 *   "message": "Error description",
 *   "stack": "Error stack (development only)"
 * }
 * ```
 *
 * Security Considerations:
 * - Error message sanitization to prevent information leakage
 * - Stack trace exposure limited to development environment
 * - Request context logging for debugging without exposing sensitive data
 * - Rate limiting consideration for error responses
 *
 * Usage:
 * - Wrap async route handlers with `asyncHandler()` for automatic error catching
 * - Throw `AppError` for operational errors with specific status codes
 * - Let programming errors bubble up for automatic 500 responses
 */

/**
 * API Error Interface
 *
 * Extends the standard Error interface with HTTP status code and operational classification.
 * Used for type-safe error handling throughout the application.
 */
export interface ApiError extends Error {
  /** HTTP status code for the error response */
  statusCode?: number;
  /** Whether this is an operational error (expected) vs programming error (unexpected) */
  isOperational?: boolean;
}

/**
 * Application Error Class
 *
 * Custom error class for operational errors with built-in HTTP status codes.
 * Provides structured error creation with automatic stack trace capture.
 */
export class AppError extends Error implements ApiError {
  /** HTTP status code for this error type */
  public readonly statusCode: number;
  /** Operational error classification */
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Capture stack trace for debugging
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global Error Handler Middleware
 *
 * Express error handling middleware that formats and logs all application errors.
 * Provides consistent error responses and comprehensive error logging.
 */
export const errorHandler = (
  error: ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const { statusCode = 500, message, stack } = error;

  // Log error with request context for debugging
  logger.error(`${req.method} ${req.url} - ${statusCode} - ${message} - ${req.ip}`);

  // Send structured error response
  const errorResponse = {
    success: false,
    message: statusCode === 500 ? 'Internal Server Error' : message,
    // Include stack trace only in development environment
    ...(config.nodeEnv === 'development' && { stack }),
  };

  res.status(statusCode).json(errorResponse);
};

/**
 * Async Handler Wrapper
 *
 * Higher-order function that wraps async route handlers to automatically catch
 * and forward errors to the Express error handling middleware.
 *
 * Usage:
 * ```typescript
 * router.get('/endpoint', asyncHandler(async (req, res) => {
 *   // Async operations that might throw
 * }));
 * ```
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Resolve the promise and catch any errors, forwarding to next middleware
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
