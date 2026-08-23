import type { UserId, UserRole } from '../modules/users/user.types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: UserId;
        role: UserRole;
      };
    }
  }
}

export {};
