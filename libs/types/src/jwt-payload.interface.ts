import { Role } from '@mintjobs/constants';

export interface JwtPayload {
  sub: string; // User ID
  email?: string;
  role?: Role;
  iat?: number;
  exp?: number;
}

export interface JwtRefreshPayload {
  sub: string; // User ID
  tokenId: string; // Refresh token ID
  iat?: number;
  exp?: number;
}
