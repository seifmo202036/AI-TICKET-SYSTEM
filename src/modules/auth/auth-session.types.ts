export type AuthSessionRecord = {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBySessionId: string | null;
  createdAt: Date;
};


export type CreateAuthSessionData = {
  id: string;
  userId: number;
  tokenHash: string;
  expiresAt: Date;
};