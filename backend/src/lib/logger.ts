import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';

const { combine, timestamp, json, errors, printf, colorize } = winston.format;

const requestFormat = printf(({ level, message, timestamp, requestId, ...meta }) => {
  return JSON.stringify({
    timestamp,
    level,
    requestId: requestId || 'N/A',
    message,
    ...meta
  });
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    errors({ stack: true }),
    json()
  ),
  defaultMeta: {
    service: 'front-desk-ai-backend',
    version: process.env.npm_package_version
  },
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        requestFormat
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' })
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' })
  ]
});

// Add request context
export const createRequestLogger = (requestId: string) => {
  return {
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, { requestId, ...meta });
    },
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(message, { requestId, ...meta });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, { requestId, ...meta });
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, { requestId, ...meta });
    }
  };
};

export default logger;
