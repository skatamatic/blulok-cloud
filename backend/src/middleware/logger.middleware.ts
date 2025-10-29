import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

/**
 * Request Logging Middleware
 *
 * Express middleware that logs all incoming HTTP requests and their responses.
 * Provides comprehensive request/response logging for monitoring, debugging, and analytics.
 *
 * Key Features:
 * - Request logging with method, URL, and client IP
 * - Response logging with status code and processing duration
 * - Performance monitoring through request timing
 * - Structured logging format for log aggregation systems
 * - Non-blocking logging that doesn't affect request processing
 *
 * Log Format:
 * - Request: "METHOD URL - CLIENT_IP"
 * - Response: "METHOD URL - STATUS_CODE - DURATIONms"
 *
 * Use Cases:
 * - API usage analytics and monitoring
 * - Performance bottleneck identification
 * - Security monitoring and intrusion detection
 * - Debugging and troubleshooting request issues
 * - Compliance auditing and access logging
 *
 * Security Considerations:
 * - IP address logging for security monitoring
 * - Request timing analysis to detect anomalies
 * - Status code monitoring for error rate tracking
 * - No sensitive data logging (handled by other middleware)
 *
 * Integration:
 * - Works with Winston logger for structured output
 * - Compatible with log aggregation systems (ELK, Splunk, etc.)
 * - Supports log level filtering and routing
 */

/**
 * Request Logger Middleware
 *
 * Logs all HTTP requests and responses with timing information.
 * Must be registered early in the middleware chain to capture all requests.
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  // Capture request start time for duration calculation
  const start = Date.now();

  // Log incoming request details
  logger.info(`${req.method} ${req.url} - ${req.ip}`);

  // Attach response listener to log completion details
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
  });

  // Continue to next middleware
  next();
};
