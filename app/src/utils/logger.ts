/**
 * Custom logger with configurable levels
 * Automatically silences debug/info logs in production
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;
type LogLevelValue = typeof LOG_LEVELS[LogLevel];

// Configure level based on environment
const currentLevel: LogLevelValue = import.meta.env.DEV 
  ? LOG_LEVELS.DEBUG   // Show everything in dev
  : LOG_LEVELS.WARN;   // Only warnings & errors in prod

class Logger {
  private level: LogLevelValue = currentLevel;

  debug(...args: unknown[]) {
    if (this.level <= LOG_LEVELS.DEBUG) {
      console.log('🐛', ...args);
    }
  }

  info(...args: unknown[]) {
    if (this.level <= LOG_LEVELS.INFO) {
      console.info('ℹ️', ...args);
    }
  }

  warn(...args: unknown[]) {
    if (this.level <= LOG_LEVELS.WARN) {
      console.warn('⚠️', ...args);
    }
  }

  error(...args: unknown[]) {
    if (this.level <= LOG_LEVELS.ERROR) {
      console.error('❌', ...args);
    }
  }

  /**
   * Change log level at runtime (useful for debugging)
   * Example in console: logger.setLevel('ERROR')
   */
  setLevel(level: LogLevel) {
    this.level = LOG_LEVELS[level];
    console.log(`🔧 Log level set to: ${level}`);
  }

  /**
   * Get current log level
   */
  getLevel(): LogLevel {
    const entry = Object.entries(LOG_LEVELS).find(([, val]) => val === this.level);
    return entry ? (entry[0] as LogLevel) : 'NONE';
  }
}

export const logger = new Logger();

// Expose logger globally in dev mode for runtime debugging
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).logger = logger;
  console.log('🔧 Logger available globally - try: logger.setLevel("ERROR")');
}

// Type declaration for global logger (TypeScript autocomplete)
declare global {
  interface Window {
    logger?: Logger;
  }
}
