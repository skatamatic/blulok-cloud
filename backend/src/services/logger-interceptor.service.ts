import { WebSocketService } from './websocket.service';
import { logger } from '@/utils/logger';

export class LoggerInterceptorService {
  private static instance: LoggerInterceptorService;
  private wsService: WebSocketService;
  private originalMethods!: {
    error: (...args: any[]) => any;
    warn: (...args: any[]) => any;
    info: (...args: any[]) => any;
    debug: (...args: any[]) => any;
  };
  private isIntercepting = false; // Re-entrancy guard

  private constructor() {
    this.wsService = WebSocketService.getInstance();
    this.setupInterceptor();
  }

  public static getInstance(): LoggerInterceptorService {
    if (!LoggerInterceptorService.instance) {
      LoggerInterceptorService.instance = new LoggerInterceptorService();
    }
    return LoggerInterceptorService.instance;
  }

  private setupInterceptor(): void {
    // Store original methods to avoid circular calls
    this.originalMethods = {
      error: logger.error.bind(logger),
      warn: logger.warn.bind(logger),
      info: logger.info.bind(logger),
      debug: logger.debug.bind(logger)
    };

    // Intercept specific level methods
    const levels = ['error', 'warn', 'info', 'debug'];
    levels.forEach(level => {
      (logger as any)[level] = (message: any, ...args: any[]) => {
        // Call the original method
        const result = this.originalMethods[level as keyof typeof this.originalMethods](message, ...args);
        
        // Broadcast to WebSocket clients (with re-entrancy guard)
        if (!this.isIntercepting) {
          this.broadcastLogEntry(level, message, args);
        }
        
        // Return the result to maintain Winston's return type
        return result;
      };
    });

    // Logger interceptor initialized
  }

  private broadcastLogEntry(level: string, message: any, args: any[]): void {
    if (this.isIntercepting) return; // Re-entrancy guard
    
    this.isIntercepting = true;
    try {
      // Handle Error objects specially
      let messageStr: string;
      let stack: string | undefined;
      
      if (message instanceof Error) {
        messageStr = message.message;
        stack = message.stack;
      } else {
        messageStr = typeof message === 'string' ? message : String(message);
      }
      
      // Format the log entry similar to Winston's format
      const logEntry = {
        level,
        message: messageStr,
        timestamp: new Date().toISOString(),
        stack,
        args: args.length > 0 ? args.map(arg => typeof arg === 'string' ? arg : String(arg)) : undefined
      };


      // Broadcast to WebSocket clients
      this.wsService.broadcastLogUpdate('logs/combined.log', JSON.stringify(logEntry) + '\n');
    } catch (error) {
      // Don't log anything in the interceptor - just use console.error to avoid circular reference
      console.error('Error in logger interceptor:', error);
    } finally {
      this.isIntercepting = false;
    }
  }

  public destroy(): void {
    // Restore original methods
    if (this.originalMethods) {
      logger.error = this.originalMethods.error;
      logger.warn = this.originalMethods.warn;
      logger.info = this.originalMethods.info;
      logger.debug = this.originalMethods.debug;
    }
    // Logger interceptor destroyed
  }
}
