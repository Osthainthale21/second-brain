const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[currentLevel];
}

function formatMessage(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  error(message: string, meta?: unknown): void {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
  warn(message: string, meta?: unknown): void {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  info(message: string, meta?: unknown): void {
    if (shouldLog('info')) console.info(formatMessage('info', message, meta));
  },
  debug(message: string, meta?: unknown): void {
    if (shouldLog('debug')) console.info(formatMessage('debug', message, meta));
  },
};
