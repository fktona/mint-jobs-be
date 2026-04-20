import {
  PaginationOptions,
  PaginationMeta,
  PaginatedResponse,
  CursorPaginationOptions,
  CursorPaginationMeta,
  CursorPaginatedResponse,
} from '@mintjobs/types';

/**
 * Calculate pagination metadata
 */
export function calculatePaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    meta: calculatePaginationMeta(total, page, limit),
  };
}

/**
 * Create cursor paginated response
 */
export function createCursorPaginatedResponse<T extends { id: string | number }>(
  data: T[],
  cursor?: string,
  limit: number = 20,
): CursorPaginatedResponse<T> {
  const hasNext = data.length > limit;
  const items = hasNext ? data.slice(0, limit) : data;
  const nextCursor = hasNext && items.length > 0 ? String(items[items.length - 1].id) : undefined;

  return {
    data: items,
    meta: {
      cursor: nextCursor,
      hasNext,
      limit,
    },
  };
}

/**
 * Parse pagination options from query
 */
export function parsePaginationOptions(
  page?: string | number,
  limit?: string | number,
): PaginationOptions {
  const parsedPage = page ? Number(page) : 1;
  const parsedLimit = limit ? Number(limit) : 20;

  return {
    page: parsedPage > 0 ? parsedPage : 1,
    limit: parsedLimit > 0 && parsedLimit <= 100 ? parsedLimit : 20,
  };
}
