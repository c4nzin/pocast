import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import {
  AUTH_PATTERNS,
  AuthSession,
  AuthTokens,
  ChangePasswordCommand,
  LoginCommand,
  RefreshCommand,
  RefreshTokenDto,
  RegisterCommand,
  RevokeSessionCommand,
  type SessionSummary,
  UserIdCommand,
  type UserProfile,
} from '@pocast/contracts';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.REGISTER)
  register(@Payload() command: RegisterCommand): Promise<AuthSession> {
    return this.auth.register(command);
  }

  @MessagePattern(AUTH_PATTERNS.LOGIN)
  login(@Payload() command: LoginCommand): Promise<AuthSession> {
    return this.auth.login(command);
  }

  @MessagePattern(AUTH_PATTERNS.REFRESH)
  refresh(@Payload() command: RefreshCommand): Promise<AuthTokens> {
    return this.auth.refresh(command);
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT)
  async logout(@Payload() command: RefreshTokenDto): Promise<{ ok: true }> {
    await this.auth.logout(command.refreshToken);
    return { ok: true };
  }

  @MessagePattern(AUTH_PATTERNS.LOGOUT_ALL)
  async logoutAll(@Payload() command: UserIdCommand): Promise<{ ok: true }> {
    await this.auth.logoutAll(command.userId);
    return { ok: true };
  }

  @MessagePattern(AUTH_PATTERNS.GET_USER)
  getUser(@Payload() command: UserIdCommand): Promise<UserProfile> {
    return this.auth.getUser(command.userId);
  }

  @MessagePattern(AUTH_PATTERNS.LIST_SESSIONS)
  listSessions(@Payload() command: UserIdCommand): Promise<SessionSummary[]> {
    return this.auth.listSessions(command.userId);
  }

  @MessagePattern(AUTH_PATTERNS.REVOKE_SESSION)
  async revokeSession(
    @Payload() command: RevokeSessionCommand,
  ): Promise<{ ok: true }> {
    await this.auth.revokeSession(command.userId, command.sessionId);
    return { ok: true };
  }

  @MessagePattern(AUTH_PATTERNS.CHANGE_PASSWORD)
  changePassword(
    @Payload() command: ChangePasswordCommand,
  ): Promise<AuthSession> {
    return this.auth.changePassword(command);
  }
}
