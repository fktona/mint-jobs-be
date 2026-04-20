import { MessagePattern } from '@mintjobs/constants';

/**
 * Request message for RPC-style communication
 */
export interface RequestMessage<T = Record<string, unknown>> {
  pattern: MessagePattern;
  data: T;
  requestId: string;
  correlationId?: string;
  timestamp: Date;
}

/**
 * Response message for RPC-style communication
 */
export interface ResponseMessage<T = unknown> {
  pattern: MessagePattern;
  requestId: string;
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    statusCode?: number;
  };
  timestamp: Date;
}
