import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_MAX_LENGTH = 64;
const REQUEST_ID_MIN_LENGTH = 8;
const REQUEST_ID_PATTERN = new RegExp(
  `^[A-Za-z0-9-]{${REQUEST_ID_MIN_LENGTH},${REQUEST_ID_MAX_LENGTH}}$`,
);

const LOG_PATH_MAX_LENGTH = 512;
const CONTROL_CHARS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;

function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

function sanitizeForLog(value: string, maxLen: number): string {
  return value.replace(CONTROL_CHARS, '?').slice(0, maxLen);
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestContextMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();
    const incomingId = req.headers[REQUEST_ID_HEADER];
    const requestId = isValidRequestId(incomingId) ? incomingId : randomUUID();

    res.locals['requestId'] = requestId;

    res.setHeader(REQUEST_ID_HEADER, requestId);

    res.on('finish', () => {
      const entry = {
        requestId,
        method: req.method,
        statusCode: res.statusCode,
        path: sanitizeForLog(req.path, LOG_PATH_MAX_LENGTH),
        ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6),
      };

      if (res.statusCode >= 500) {
        this.logger.error(entry);
      } else if (res.statusCode >= 400) {
        this.logger.warn(entry);
      } else {
        this.logger.log(entry);
      }
    });

    res.on('close', () => {
      if (!res.writableFinished) {
        this.logger.warn({ requestId, path: req.path, aborted: true });
      }
    });

    next();
  }
}
