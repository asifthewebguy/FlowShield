import * as Sentry from '@sentry/nextjs';

type LogLevel = 'info' | 'warn' | 'error';

class Logger {
  private shouldLog(level: LogLevel): boolean {
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
    }
    if (error instanceof Error) {
      Sentry.captureException(error, { extra: { message } });
    } else if (error) {
      Sentry.captureMessage(`${message}: ${String(error)}`, 'error');
    } else {
      Sentry.captureMessage(message, 'error');
    }
  }
}

export const logger = new Logger();
