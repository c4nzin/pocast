import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { RpcErrorPayload } from '@pocast/contracts';

export interface Cursor {
  readonly at: Date;
  readonly id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(
    JSON.stringify({ t: cursor.at.toISOString(), i: cursor.id }),
  ).toString('base64url');
}

function invalidCursor(): RpcException {
  const payload: RpcErrorPayload = {
    statusCode: HttpStatus.BAD_REQUEST,
    message: 'Invalid cursor',
  };
  return new RpcException(payload);
}

export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(raw, 'base64url').toString('utf8'),
    ) as {
      t?: unknown;
      i?: unknown;
    };
    const at = typeof parsed.t === 'string' ? new Date(parsed.t) : null;
    if (
      !at ||
      Number.isNaN(at.getTime()) ||
      typeof parsed.i !== 'string' ||
      !UUID_PATTERN.test(parsed.i)
    ) {
      throw invalidCursor();
    }
    return { at, id: parsed.i };
  } catch {
    throw invalidCursor();
  }
}

export function toPage<T>(
  rows: readonly T[],
  limit: number,
  positionOf: (row: T) => Cursor,
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(positionOf(last)) : null,
  };
}
