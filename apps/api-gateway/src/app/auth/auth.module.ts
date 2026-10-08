import { Global, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import {
  AUTH_QUEUE,
  AUTH_SERVICE,
  DEFAULT_RABBITMQ_URL,
} from '@pocast/contracts';
import { AccessTokenVerifier } from './access-token-verifier';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: AUTH_SERVICE,
        useFactory: () => ({
          transport: Transport.RMQ,
          options: {
            urls: [process.env['RABBITMQ_URL'] ?? DEFAULT_RABBITMQ_URL],
            queue: AUTH_QUEUE,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AccessTokenVerifier, AuthGuard],
  exports: [AccessTokenVerifier, AuthGuard],
})
export class AuthModule {}
