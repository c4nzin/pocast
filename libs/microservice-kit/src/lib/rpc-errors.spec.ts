import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { flattenValidationErrors, rpcError } from './rpc-errors';

describe('rpcError', () => {
  it('wraps a typed payload the gateway can map to HTTP', () => {
    const error = rpcError(HttpStatus.CONFLICT, 'Email already registered');

    expect(error).toBeInstanceOf(RpcException);
    expect(error.getError()).toEqual({
      statusCode: 409,
      message: 'Email already registered',
    });
  });
});

describe('flattenValidationErrors', () => {
  it('joins constraints, including nested ones', () => {
    const message = flattenValidationErrors([
      {
        property: 'email',
        constraints: { isEmail: 'email must be an email' },
        children: [],
      },
      {
        property: 'profile',
        children: [
          {
            property: 'name',
            constraints: { isString: 'name must be a string' },
            children: [],
          },
        ],
      },
    ]);

    expect(message).toBe('email must be an email, name must be a string');
  });
});
