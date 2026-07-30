import bcrypt from 'bcrypt';
import {env} from '../../config/env.ts';

import { AppError } from '../../errors/app-error.js';
import { randomUUID } from "node:crypto";

import {
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiration,
  hashRefreshToken,
} from "../auth/auth.token.ts";
import {createSession} from "../auth/auth-session.repository.ts";
import {
  createUser,
  findUserByEmail,
  findUserByUserName,
} from '../users/user.repository.js';

import type {
  AccountStatus,
  PublicRecord,
  LoginResult,
  UserRole,
} from '../users/user.types.js';

import type { SignupInput , SigninInput } from './auth.validation.js';

const PASSWORD_SALT_ROUNDS = env.BCRYPT_ROUNDS;

export async function signup(
  input: SignupInput,
): Promise<PublicRecord> {
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
      'Email is already registered',
      'EMAIL_ALREADY_REGISTERED',
    );
  }

  // 3. Check duplicate username
  const existingUserName =
    await findUserByUserName(normalizedUserName);

  if (existingUserName) {
    throw new AppError(
      409,
      'Username is already taken',
      'USERNAME_ALREADY_TAKEN',
    );
  }

  // 4. Hash password
  const passwordHash = await bcrypt.hash(
    input.password,
    PASSWORD_SALT_ROUNDS,
  );

  // 5. Determine role
  const role: UserRole = input.accountType;

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
  input: SigninInput,
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
      "Invalid email or password",
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
      "Invalid email or password",
      "INVALID_CREDENTIALS",
    );
  }

  // 3. Check account status
  if (user.account_status === "pending") {
    throw new AppError(
      403,
      "Account is pending approval",
      "ACCOUNT_PENDING",
    );
  }

  if (user.account_status === "suspended") {
    throw new AppError(
      403,
      "Account is suspended",
      "ACCOUNT_SUSPENDED",
    );
  }

  if (user.account_status !== "active") {
    throw new AppError(
      403,
      "Account is not active",
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
  await createSession({
    id: randomUUID(),
    userId: user.id,
    tokenHash: refreshTokenHash,
    expiresAt:
      getRefreshTokenExpiration(),
  });

  // 6. Return result
  return {
    user: {
      id: user.id.toString(),
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