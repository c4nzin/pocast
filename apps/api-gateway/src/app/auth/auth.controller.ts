import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { Throttle } from '@nestjs/throttler';
import {
  AUTH_PATTERNS,
  AUTH_SERVICE,
  AuthSession,
  AuthTokens,
  LoginCommand,
  LoginDto,
  RefreshCommand,
  RefreshTokenDto,
  RegisterCommand,
  RegisterDto,
  RevokeSessionCommand,
  type SessionSummary,
  USER_AGENT_MAX_LENGTH,
  UserIdCommand,
  type UserProfile,
} from '@pocast/contracts';
import { sendRpc } from '../common/send-rpc';
import type { AuthenticatedUser } from './access-token-verifier';
import { Authenticated, CurrentUser } from './auth.guard';

const MINUTE_MS = 60_000;

function userAgentOf(header: string | undefined): string | undefined {
  return header?.slice(0, USER_AGENT_MAX_LENGTH);
}

const NO_STORE = 'no-store';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly authClient: ClientProxy) {}

  @Post('register')
  @Header('Cache-Control', NO_STORE)
  @Throttle({ default: { limit: 5, ttl: MINUTE_MS } })
  register(
    @Body() body: RegisterDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthSession> {
    const command: RegisterCommand = {
      ...body,
      userAgent: userAgentOf(userAgent),
    };
    return sendRpc(this.authClient, AUTH_PATTERNS.REGISTER, command);
  }

  @Post('login')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: MINUTE_MS } })
  login(
    @Body() body: LoginDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthSession> {
    const command: LoginCommand = {
      ...body,
      userAgent: userAgentOf(userAgent),
    };
    return sendRpc(this.authClient, AUTH_PATTERNS.LOGIN, command);
  }

  @Post('refresh')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
  refresh(
    @Body() body: RefreshTokenDto,
    @Headers('user-agent') userAgent?: string,
  ): Promise<AuthTokens> {
    const command: RefreshCommand = {
      ...body,
      userAgent: userAgentOf(userAgent),
    };
    return sendRpc(this.authClient, AUTH_PATTERNS.REFRESH, command);
  }

  @Post('logout')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.OK)
  logout(@Body() body: RefreshTokenDto): Promise<{ ok: true }> {
    return sendRpc(this.authClient, AUTH_PATTERNS.LOGOUT, body);
  }

  @Post('logout-all')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  logoutAll(@CurrentUser() user: AuthenticatedUser): Promise<{ ok: true }> {
    const command: UserIdCommand = { userId: user.userId };
    return sendRpc(this.authClient, AUTH_PATTERNS.LOGOUT_ALL, command);
  }

  @Get('me')
  @Header('Cache-Control', NO_STORE)
  @Authenticated()
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    const command: UserIdCommand = { userId: user.userId };
    return sendRpc(this.authClient, AUTH_PATTERNS.GET_USER, command);
  }

  @Get('sessions')
  @Header('Cache-Control', NO_STORE)
  @Authenticated()
  listSessions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SessionSummary[]> {
    const command: UserIdCommand = { userId: user.userId };
    return sendRpc(this.authClient, AUTH_PATTERNS.LIST_SESSIONS, command);
  }

  @Delete('sessions/:id')
  @Header('Cache-Control', NO_STORE)
  @HttpCode(HttpStatus.OK)
  @Authenticated()
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<{ ok: true }> {
    const command: RevokeSessionCommand = { userId: user.userId, sessionId };
    return sendRpc(this.authClient, AUTH_PATTERNS.REVOKE_SESSION, command);
  }
}
