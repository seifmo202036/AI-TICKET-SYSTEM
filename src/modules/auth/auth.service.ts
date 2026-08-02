import bcrypt from 'bcrypt';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';

import { AppError } from '../../errors/app-error.js';
import { randomUUID } from "node:crypto";

import {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashRefreshToken,
} from './auth.token.js';
import {
  createAuthSession,
  findAuthSessionByRefreshTokenHashForUpdate,
  revokeAndReplaceAuthSession,
  revokeAuthSessionByRefreshTokenHash,
} from './auth-session.repository.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUserName,
} from '../users/user.repository.js';

import type {
  AccountStatus,
  PublicUser,
  LoginResult,
  UserRole,
} from '../users/user.types.js';

import type { LoginInput, SignupInput } from './auth.validation.js';

const BCRYPT_SALT_ROUNDS = env.BCRYPT_SALT_ROUNDS;

export async function signup(
  input: SignupInput,
): Promise<PublicUser> {
  // 1. Normalize input
  const normalizedEmail = input.email
    .trim()
    .toLowerCase();

  const normalizedUserName = input.userName
    .trim()
    .toLowerCase();

  // 2. Check duplicate email
  const existingEmailUser =
    await findUserByEmail(normalizedEmail);

  if (existingEmailUser) {
    throw new AppError(
      409,
      'An account with this email address already exists.',
      'EMAIL_ALREADY_REGISTERED',
    );
  }

  // 3. Check duplicate username
  const existingUserName =
    await findUserByUserName(normalizedUserName);

  if (existingUserName) {
    throw new AppError(
      409,
      'This username is already taken. Please choose another.',
      'USERNAME_ALREADY_TAKEN',
    );
  }

  // 4. Hash password
  const passwordHash = await bcrypt.hash(
    input.password,
    BCRYPT_SALT_ROUNDS,
  );

  // 5. Determine role
  const role: UserRole = input.role;

  // 6. Determine account status
  const accountStatus: AccountStatus =
    role === 'customer'
      ? 'active'
      : 'pending';

  // 7. Insert user
  const user = await createUser({
    userName: normalizedUserName,
    email: normalizedEmail,
    passwordHash,
    role,
    accountStatus,
  });

  // 8. Return safe user
  return user;
}

export async function login(
  input: LoginInput,
): Promise<LoginResult> {
  const normalizedEmail = input.email
    .trim()
    .toLowerCase();

  // 1. Find user
  const user =
    await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AppError(
      401,
      "The email address or password is incorrect.",
      "INVALID_CREDENTIALS",
    );
  }

  // 2. Compare plain password with stored hash
  const passwordMatches =
    await bcrypt.compare(
      input.password,
      user.password_hash,
    );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "The email address or password is incorrect.",
      "INVALID_CREDENTIALS",
    );
  }

  // 3. Check account status
  if (user.account_status === "pending") {
    throw new AppError(
      403,
      "Your account is awaiting approval.",
      "ACCOUNT_PENDING",
    );
  }

  if (user.account_status === "suspended") {
    throw new AppError(
      403,
      "Your account has been suspended.",
      "ACCOUNT_SUSPENDED",
    );
  }

  if (user.account_status !== "active") {
    throw new AppError(
      403,
      "Your account is not active.",
      "ACCOUNT_NOT_ACTIVE",
    );
  }

  // 4. Create tokens
  const accessToken =
    createAccessToken(user.id);

  const refreshToken =
    createRefreshToken();

  const refreshTokenHash =
    hashRefreshToken(refreshToken);

  // 5. Store refresh session
  await createAuthSession({
    id: randomUUID(),
    userId: user.id,
    refreshTokenHash,
    expiresAt:
      getRefreshTokenExpiresAt(),
  });

  // 6. Return result
  return {
    user: {
      id: user.id,
      userName: user.user_name,
      email: user.email,
      role: user.role,
      accountStatus:
        user.account_status,
      createdAt: user.created_at,
    },
    accessToken,
    refreshToken,
  };
}

export async function refreshAuthentication(
  currentRefreshToken: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const currentRefreshTokenHash =
    hashRefreshToken(currentRefreshToken);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const currentSession =
      await findAuthSessionByRefreshTokenHashForUpdate(
        client,
        currentRefreshTokenHash,
      );

    if (!currentSession) {
      throw new AppError(
        401,
        'The refresh token is invalid. Please sign in again.',
        'INVALID_REFRESH_TOKEN',
      );
    }

    if (currentSession.revokedAt) {
      throw new AppError(
        401,
        'This refresh token has already been used or revoked. Please sign in again.',
        'REFRESH_TOKEN_REVOKED',
      );
    }

    if (currentSession.expiresAt.getTime() <= Date.now()) {
      throw new AppError(
        401,
        'The refresh token has expired. Please sign in again.',
        'REFRESH_TOKEN_EXPIRED',
      );
    }

    const currentUser = await findUserById(
      currentSession.userId,
      client,
    );

    if (!currentUser) {
      throw new AppError(
        401,
        'The authenticated user no longer exists. Please sign in again.',
        'INVALID_AUTHENTICATION',
      );
    }

    if (currentUser.accountStatus === 'suspended') {
      throw new AppError(
        403,
        'Your account has been suspended.',
        'ACCOUNT_SUSPENDED',
      );
    }

    if (currentUser.accountStatus !== 'active') {
      throw new AppError(
        403,
        'Your account is not active.',
        'ACCOUNT_NOT_ACTIVE',
      );
    }

    const newAccessToken = createAccessToken(
      currentUser.id,
    );
    const newRefreshToken = createRefreshToken();
    const newRefreshTokenHash =
      hashRefreshToken(newRefreshToken);
    const newSessionId = randomUUID();

    await createAuthSession(
      {
        id: newSessionId,
        userId: currentUser.id,
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: getRefreshTokenExpiresAt(),
      },
      client,
    );

    await revokeAndReplaceAuthSession(
      client,
      currentSession.id,
      newSessionId,
    );

    await client.query('COMMIT');

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error(
        'Failed to roll back refresh-token rotation:',
        rollbackError,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function logout(
  refreshToken: string,
): Promise<void> {
  const refreshTokenHash =
    hashRefreshToken(refreshToken);

  await revokeAuthSessionByRefreshTokenHash(
    refreshTokenHash,
  );
}
