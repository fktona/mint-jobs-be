import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ApiResponse,
  ApiPaginatedResponse,
  ApiCursorPaginatedResponse,
} from '@mintjobs/utils';

/**
 * Transform interceptor that ensures all responses follow the standard format
 * If response is already formatted (has success, timestamp), it returns as-is
 * Otherwise, it wraps the response in the standard format
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | ApiPaginatedResponse<T> | ApiCursorPaginatedResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | ApiPaginatedResponse<T> | ApiCursorPaginatedResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If response is already in standard format, return as-is
        if (
          data &&
          typeof data === 'object' &&
          'success' in data &&
          'timestamp' in data
        ) {
          return data;
        }

        // If response is null or undefined, wrap it
        if (data === null || data === undefined) {
          return {
            success: true,
            data: data as T,
            timestamp: new Date().toISOString(),
          };
        }

        // Wrap plain data in standard format
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
