import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@mintjobs/config';
import pino from 'pino';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: pino.Logger;

  constructor(private configService: ConfigService) {
    const isDevelopment = this.configService.app.env === 'development';

    this.logger = pino({
      level: isDevelopment ? 'debug' : 'info',
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      formatters: {
        level: (label) => {
          return { level: label };
        },
      },
    });
  }

  log(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.info({ context, ...meta }, message);
  }

  error(
    message: string,
    trace?: string,
    context?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.error({ context, trace, ...meta }, message);
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.warn({ context, ...meta }, message);
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.debug({ context, ...meta }, message);
  }

  verbose(message: string, context?: string, meta?: Record<string, unknown>) {
    this.logger.trace({ context, ...meta }, message);
  }

  /**
   * Log with correlation ID for distributed tracing
   */
  logWithCorrelation(
    message: string,
    correlationId: string,
    context?: string,
    meta?: Record<string, unknown>,
  ) {
    this.logger.info({ context, correlationId, ...meta }, message);
  }
}
