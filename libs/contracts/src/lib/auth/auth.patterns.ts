export const AUTH_SERVICE = 'AUTH_SERVICE';
export const AUTH_QUEUE = 'auth_queue';

export const AUTH_PATTERNS = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  REFRESH: 'auth.refresh',
  LOGOUT: 'auth.logout',
  LOGOUT_ALL: 'auth.logout_all',
  GET_USER: 'auth.user.get',
  LIST_SESSIONS: 'auth.session.list',
  REVOKE_SESSION: 'auth.session.revoke',
} as const;

export const JWT_ISSUER = 'pocast-auth';
export const JWT_AUDIENCE = 'pocast-api';
export const JWT_ALGORITHM = 'EdDSA';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;

export const USER_ROLES = ['LISTENER', 'CREATOR', 'EDITOR', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AccessTokenClaims {
  readonly sub: string;
  readonly role: UserRole;
}
