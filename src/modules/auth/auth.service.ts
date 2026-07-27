import bcrypt from 'bcrypt';
import {env} from '../../config/env.ts';

import { AppError } from '../../errors/app-error.js';

import {
  createUser,
  findUserByEmail,
  findUserByUserName,
} from '../users/user.repository.js';

import type {
  AccountStatus,
  PublicRecord,
  UserRole,
} from '../users/user.types.js';

import type { SignupInput } from './auth.validation.js';

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