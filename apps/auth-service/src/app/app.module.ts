import { Module } from '@nestjs/common';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AccessTokenSigner } from './crypto/access-token-signer';
import { PasswordHasher } from './crypto/password-hasher';
import { PrismaService } from './prisma/prisma.service';
import { SessionService } from './sessions/session.service';
import { RefreshTokenCleanerService } from './scheduler/refresh-token-cleaner.service';

@Module({
  controllers: [AuthController],
  providers: [
    PrismaService,
    PasswordHasher,
    AccessTokenSigner,
    SessionService,
    AuthService,
    RefreshTokenCleanerService,
  ],
})
export class AppModule {}
