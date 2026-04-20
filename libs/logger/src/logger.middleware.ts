import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Middleware to add request ID and correlation ID to requests
 * for distributed tracing across microservices
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] as string || uuidv4();
    const correlationId =
      (req.headers['x-correlation-id'] as string) || uuidv4();

    req['requestId'] = requestId;
    req['correlationId'] = correlationId;

    res.setHeader('x-request-id', requestId);
    res.setHeader('x-correlation-id', correlationId);

    next();
  }
}
