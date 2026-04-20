import { MessagePattern } from '@mintjobs/constants';

export interface BaseEvent {
  pattern: MessagePattern;
  data: Record<string, unknown>;
  timestamp: Date;
  correlationId?: string;
  userId?: string;
}
