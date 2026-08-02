import type { UserId } from '../users/user.types.js';

export type AuthSession = {
  id: string;
  userId: UserId;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
};


export type CreateAuthSessionInput = {
  id: string;
  userId: UserId;
  refreshTokenHash: string;
  expiresAt: Date;
};
