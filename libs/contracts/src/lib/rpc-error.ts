export interface RpcErrorPayload {
  readonly statusCode: number;
  readonly message: string;
}

export function isRpcErrorPayload(value: unknown): value is RpcErrorPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RpcErrorPayload).statusCode === 'number' &&
    typeof (value as RpcErrorPayload).message === 'string'
  );
}
