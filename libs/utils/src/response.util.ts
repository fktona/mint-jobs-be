import { HttpStatus } from '@nestjs/common';
import {
  PaginatedResponse,
  PaginationMeta,
  CursorPaginatedResponse,
} from '@mintjobs/types';

/**
 * Standard API response format
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
  statusCode?: number;
}

/**
 * Paginated API response format
 */
export interface ApiPaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
  message?: string;
  timestamp: string;
  statusCode?: number;
}

/**
 * Cursor paginated API response format
 */
export interface ApiCursorPaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    cursor?: string;
    hasNext: boolean;
    limit: number;
  };
  message?: string;
  timestamp: string;
  statusCode?: number;
}

/**
 * Response utility class for standardizing API responses
 */
export class ResponseUtil {
  /**
   * Create a successful response
   */
  static success<T>(
    data: T,
    message?: string,
    statusCode: number = HttpStatus.OK,
  ): ApiResponse<T> {
    return {
      success: true,
      data,
      message,
      timestamp: new Date().toISOString(),
      statusCode,
    };
  }

  /**
   * Create a successful response with pagination
   */
  static paginated<T>(
    data: T[],
    meta: PaginationMeta,
    message?: string,
    statusCode: number = HttpStatus.OK,
  ): ApiPaginatedResponse<T> {
    return {
      success: true,
      data,
      meta,
      message,
      timestamp: new Date().toISOString(),
      statusCode,
    };
  }

  /**
   * Create a successful response with cursor pagination
   */
  static cursorPaginated<T>(
    data: T[],
    meta: {
      cursor?: string;
      hasNext: boolean;
      limit: number;
    },
    message?: string,
    statusCode: number = HttpStatus.OK,
  ): ApiCursorPaginatedResponse<T> {
    return {
      success: true,
      data,
      meta,
      message,
      timestamp: new Date().toISOString(),
      statusCode,
    };
  }

  /**
   * Create a created response (201)
   */
  static created<T>(
    data: T,
    message?: string,
  ): ApiResponse<T> {
    return this.success(data, message, HttpStatus.CREATED);
  }

  /**
   * Create a no content response (204)
   */
  static noContent(): ApiResponse<null> {
    return {
      success: true,
      data: null,
      timestamp: new Date().toISOString(),
      statusCode: HttpStatus.NO_CONTENT,
    };
  }

  /**
   * Create a response with custom status
   */
  static withStatus<T>(
    data: T,
    statusCode: number,
    message?: string,
  ): ApiResponse<T> {
    return {
      success: statusCode >= 200 && statusCode < 300,
      data,
      message,
      timestamp: new Date().toISOString(),
      statusCode,
    };
  }
}
