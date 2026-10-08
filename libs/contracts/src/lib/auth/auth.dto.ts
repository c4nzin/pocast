import 'reflect-metadata';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UserRole } from './auth.patterns.js';

export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const REFRESH_TOKEN_MAX_LENGTH = 128;
export const USER_AGENT_MAX_LENGTH = 512;

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

class CredentialsDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}

export class RegisterDto extends CredentialsDto {
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  declare password: string;
}

export class LoginDto extends CredentialsDto {}

export class RefreshTokenDto {
  @IsString()
  @MaxLength(REFRESH_TOKEN_MAX_LENGTH)
  refreshToken!: string;
}

export class RegisterCommand extends RegisterDto {
  @IsOptional()
  @IsString()
  @MaxLength(USER_AGENT_MAX_LENGTH)
  userAgent?: string;
}

export class LoginCommand extends LoginDto {
  @IsOptional()
  @IsString()
  @MaxLength(USER_AGENT_MAX_LENGTH)
  userAgent?: string;
}

export class RefreshCommand extends RefreshTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(USER_AGENT_MAX_LENGTH)
  userAgent?: string;
}

export class UserIdCommand {
  @IsUUID()
  userId!: string;
}

export class RevokeSessionCommand extends UserIdCommand {
  @IsUUID()
  sessionId!: string;
}

export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly emailVerified: boolean;
  readonly createdAt: string;
}

export interface AuthTokens {
  readonly tokenType: 'Bearer';
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

export interface AuthSession {
  readonly user: UserProfile;
  readonly tokens: AuthTokens;
}

export interface SessionSummary {
  readonly id: string;
  readonly userAgent: string | null;
  readonly lastActiveAt: string;
  readonly expiresAt: string;
}
