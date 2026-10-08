import {
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { isRpcErrorPayload } from '@pocast/contracts';
import {
  catchError,
  firstValueFrom,
  throwError,
  timeout,
  TimeoutError,
} from 'rxjs';

export const RPC_TIMEOUT_MS = 5000;

const logger = new Logger('Rpc');

export function toHttpException(
  error: unknown,
  pattern: string,
): HttpException {
  if (error instanceof TimeoutError) {
    return new GatewayTimeoutException(`Upstream did not answer "${pattern}"`);
  }
  if (isRpcErrorPayload(error)) {
    return new HttpException(error.message, error.statusCode);
  }
  logger.error(`Unexpected RPC failure for "${pattern}"`, error);
  return new InternalServerErrorException();
}

export function sendRpc<TResult, TInput = unknown>(
  client: ClientProxy,
  pattern: string,
  payload: TInput,
  timeoutMs: number = RPC_TIMEOUT_MS,
): Promise<TResult> {
  return firstValueFrom(
    client.send<TResult, TInput>(pattern, payload).pipe(
      timeout(timeoutMs),
      catchError((error: unknown) =>
        throwError(() => toHttpException(error, pattern)),
      ),
    ),
  );
}
