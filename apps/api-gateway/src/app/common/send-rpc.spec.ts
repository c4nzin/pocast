import {
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { of, throwError, TimeoutError } from 'rxjs';
import { sendRpc, toHttpException } from './send-rpc';

function clientReturning(result: ReturnType<ClientProxy['send']>): ClientProxy {
  return { send: jest.fn().mockReturnValue(result) } as unknown as ClientProxy;
}

describe('toHttpException', () => {
  beforeAll(() => jest.spyOn(Logger.prototype, 'error').mockImplementation());

  it('maps an RPC error payload to an HttpException with the same status', () => {
    const error = toHttpException(
      { statusCode: 404, message: 'Podcast x not found' },
      'p',
    );

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(404);
    expect(error.message).toBe('Podcast x not found');
  });

  it('maps an rxjs timeout to 504', () => {
    expect(toHttpException(new TimeoutError(), 'p')).toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('hides unknown errors behind a 500', () => {
    expect(toHttpException(new Error('boom'), 'p')).toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('sendRpc', () => {
  it('sends the pattern and payload and resolves with the reply', async () => {
    const client = clientReturning(of({ id: '1' }));

    await expect(sendRpc(client, 'podcast.find_one', '1')).resolves.toEqual({
      id: '1',
    });
    expect(client.send).toHaveBeenCalledWith('podcast.find_one', '1');
  });

  it('rejects with a mapped HttpException when the service errors', async () => {
    const client = clientReturning(
      throwError(() => ({ statusCode: 400, message: 'bad' })),
    );

    await expect(sendRpc(client, 'p', {})).rejects.toMatchObject({
      status: 400,
      message: 'bad',
    });
  });
});
