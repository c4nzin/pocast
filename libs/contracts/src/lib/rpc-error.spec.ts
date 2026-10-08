import { isRpcErrorPayload } from './rpc-error.js';

describe('isRpcErrorPayload', () => {
  it('accepts an object with numeric statusCode and string message', () => {
    expect(isRpcErrorPayload({ statusCode: 404, message: 'Not found' })).toBe(
      true,
    );
  });

  it.each([
    null,
    undefined,
    'error',
    { statusCode: '404', message: 'x' },
    { statusCode: 404 },
    { message: 'x' },
  ])('rejects %p', (value) => {
    expect(isRpcErrorPayload(value)).toBe(false);
  });
});
