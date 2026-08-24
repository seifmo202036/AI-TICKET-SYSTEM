import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';
import type { PoolClient } from 'pg'; // used for transaction to reserve one DB connection until the end of that transaction

interface DbUserRow {
  id: string;
  user_name: string;
  email: string;
  role: PublicUser['role'];
  account_status: PublicUser['accountStatus'];
  created_at: Date;
}

import type {
  AccountStatus,
  CreateUserInput,
  DbUser,
  PublicUser,
  UserId,
} from './user.types.js';

type UniqueViolation = {
  code: '23505';
  constraint: string | null;
};

function isUniqueViolation(error: unknown): error is UniqueViolation {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === '23505'
  );
}

export function mapUniqueViolationToConflict(
  violation: UniqueViolation,
): AppError {
  if (violation.constraint === 'users_email_key') {
    return new AppError(
      409,
      'An account with this email address already exists.',
      'EMAIL_ALREADY_REGISTERED',
    );
  }

  if (violation.constraint === 'users_user_name_key') {
    return new AppError(
      409,
      'This username is already taken. Please choose another.',
      'USERNAME_ALREADY_TAKEN',
    );
  }

  return new AppError(
    409,
    'This value conflicts with an existing record.',
    'UNIQUE_CONSTRAINT_CONFLICT',
  );
}

export async function findUserByEmail(email: string): Promise<DbUser | null> {
  try {
    const result = await pool.query<DbUser>(
      `
        SELECT
            id,
            user_name,
            email,
            password_hash,
            role,
            account_status,
            created_at,
            updated_at
            FROM users
            WHERE email = $1
            LIMIT 1
      `,
      [email],
    );

    return result.rows[0] ?? null;
  } catch (error) {
    throw new AppError(
      500,
      'Unable to retrieve the user by email. Please try again later.',
      'DATABASE_QUERY_FAILED',
      { cause: error },
    );
  }
}

export async function findUserByUserName(
  userName: string,
): Promise<DbUser | null> {
  try {
    const result = await pool.query<DbUser>(
      `SELECT
        id,
        user_name,
        email,
        password_hash,
        role,
        account_status,
        created_at,
        updated_at
        FROM users
        WHERE user_name = $1
        LIMIT 1`,
      [userName],
    );
    return result.rows[0] ?? null;
  } catch (error) {
    throw new AppError(
      500,
      'Unable to retrieve the user by username. Please try again later.',
      'DATABASE_QUERY_FAILED',
      { cause: error },
    );
  }
}

export async function findUserById(
  userId: UserId,
  client?: PoolClient,
): Promise<PublicUser | null> {
  try {
    const database = client ?? pool;

    const result = await database.query<DbUserRow>(
      `
        SELECT
          id,
          user_name,
          email,
          role,
          account_status,
          created_at
        FROM users
        WHERE id = $1
        LIMIT 1
      `,
      [userId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userName: row.user_name,
      email: row.email,
      role: row.role,
      accountStatus: row.account_status,
      createdAt: row.created_at,
    };
  } catch (error) {
    throw new AppError(
      500,
      'Unable to retrieve the user profile. Please try again later.',
      'DATABASE_QUERY_FAILED',
      { cause: error },
    );
  }
}

export async function createUser(data: CreateUserInput): Promise<PublicUser> {
  try {
    const result = await pool.query<DbUserRow>(
      `
        INSERT INTO users (
            user_name,
            email,
            password_hash,
            role,
            account_status
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
            id,
            user_name,
            email,
            role,
            account_status,
            created_at
        `,
      [
        data.userName,
        data.email,
        data.passwordHash,
        data.role,
        data.accountStatus,
      ],
    );

    const row = result.rows[0];

    if (!row) {
      throw new AppError(
        500,
        'The account could not be created because no user record was returned.',
        'USER_CREATION_FAILED',
      );
    }

    return {
      id: row.id,
      userName: row.user_name,
      email: row.email,
      role: row.role,
      accountStatus: row.account_status,
      createdAt: row.created_at,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    if (isUniqueViolation(error)) {
      throw mapUniqueViolationToConflict(error);
    }

    throw new AppError(
      500,
      'Unable to create the user account. Please try again later.',
      'DATABASE_QUERY_FAILED',
      { cause: error },
    );
  }
}

export async function updateUserAccountStatus(
  userId: UserId,
  accountStatus: AccountStatus,
  client?: PoolClient,
): Promise<PublicUser | null> {
  try {
    const database = client ?? pool;

    const result = await database.query<DbUserRow>(
      `
        UPDATE users
        SET
          account_status = $2,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          user_name,
          email,
          role,
          account_status,
          created_at
      `,
      [userId, accountStatus],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      userName: row.user_name,
      email: row.email,
      role: row.role,
      accountStatus: row.account_status,
      createdAt: row.created_at,
    };
  } catch (error) {
    throw new AppError(
      500,
      'Unable to update the user account status. Please try again later.',
      'DATABASE_QUERY_FAILED',
      { cause: error },
    );
  }
}
