import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AccessTokenSigner } from './crypto/access-token-signer';
import { PasswordHasher } from './crypto/password-hasher';
import { PrismaService } from './prisma/prisma.service';
import { SessionService } from './sessions/session.service';
import { RefreshTokenCleanerService } from './scheduler/refresh-token-cleaner.service';
import { HealthController } from './health/health.controller';
import { HealthService } from './health/health.service';

@Module({
  controllers: [AuthController, HealthController],
  providers: [
    PrismaService,
    PasswordHasher,
    AccessTokenSigner,
    SessionService,
    AuthService,
    RefreshTokenCleanerService,
    HealthService,
  ],
})
export class AppModule {}
