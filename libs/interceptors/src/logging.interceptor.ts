import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const now = Date.now();
    const correlationId = request['correlationId'];
    const requestId = request['requestId'];

    this.logger.log(
      `Incoming request: ${method} ${url}`,
      { correlationId, requestId },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - now;

          this.logger.log(
            `Completed request: ${method} ${url} ${statusCode} - ${duration}ms`,
            { correlationId, requestId, duration },
          );
        },
        error: (error) => {
          const duration = Date.now() - now;
          this.logger.error(
            `Failed request: ${method} ${url} - ${duration}ms`,
            error.stack,
            { correlationId, requestId, duration },
          );
        },
      }),
    );
  }
}
