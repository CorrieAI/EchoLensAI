/**
 * Production-safe logging utility for the frontend
 * In development: logs to console
 * In production: can be configured to send to error tracking service
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  isDevelopment: boolean;
  enableProduction: boolean;
}

const config: LoggerConfig = {
  isDevelopment: process.env.NODE_ENV === 'development',
  enableProduction: false, // Set to true to enable logging in production
};

class Logger {
  private shouldLog(level: LogLevel): boolean {
    if (config.isDevelopment) {
      return true;
    }
    return config.enableProduction;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
    // In production, could send to error tracking service
    // Example: Sentry.captureMessage(message, 'warning');
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error);
    }
    // In production, send to error tracking service
    // Example: Sentry.captureException(error || new Error(message));
  }

  /**
   * Log API request/response for debugging
   */
  api(method: string, url: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(`[API] ${method} ${url}`, data);
    }
  }

  /**
   * Log state changes in components
   */
  state(component: string, state: string, data?: any): void {
    if (this.shouldLog('debug')) {
      console.log(`[STATE] ${component}: ${state}`, data);
    }
  }
}

export const logger = new Logger();

/**
 * Type-safe error message extractor
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'An unknown error occurred';
}
