import winston from 'winston';

const { combine, timestamp, json, printf, colorize, errors } = winston.format;

// Custom format for development (human-readable)
const devFormat = printf((info) => {
  const { level, message, timestamp: ts, ...metadata } = info;
  let msg = `${String(ts)} [${String(level)}]: ${String(message)}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

// Determine format based on environment
const isProduction = process.env.NODE_ENV === 'production';
const logFormat = isProduction
  ? combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      json()
    )
  : combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      errors({ stack: true }),
      devFormat
    );

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      stderrLevels: ['error'],
    }),
  ],
  exitOnError: false,
});

