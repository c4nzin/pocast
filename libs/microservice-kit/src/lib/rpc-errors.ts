import { HttpStatus, ValidationError, ValidationPipe } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import type { RpcErrorPayload } from '@pocast/contracts';

export function rpcError(
  statusCode: HttpStatus,
  message: string,
): RpcException {
  const payload: RpcErrorPayload = { statusCode, message };
  return new RpcException(payload);
}

export function flattenValidationErrors(
  errors: readonly ValidationError[],
): string {
  return errors
    .flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...(error.children?.length
        ? [flattenValidationErrors(error.children)]
        : []),
    ])
    .filter(Boolean)
    .join(', ');
}

export function createRpcValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      rpcError(HttpStatus.BAD_REQUEST, flattenValidationErrors(errors)),
  });
}
