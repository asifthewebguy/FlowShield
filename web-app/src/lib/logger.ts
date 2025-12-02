/**
 * Server-side logging utility
 * In production, this could be extended to send logs to a logging service
 */

type LogLevel = 'info' | 'warn' | 'error';

class Logger {
  private shouldLog(level: LogLevel): boolean {
    // Only log errors in production, all in development
    if (process.env.NODE_ENV === 'production') {
      return level === 'error';
    }
    return true;
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  error(message: string, error?: any): void {
    if (this.shouldLog('error')) {
      console.error(`[ERROR] ${message}`, error);
      // In production, you could send this to a logging service
      // Example: sendToLoggingService({ level: 'error', message, error });
    }
  }
}

export const logger = new Logger();
