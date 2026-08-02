
import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.js';
import type { PoolClient } from 'pg';

interface DbUserRow {
  id: string;
  user_name: string;
  email: string;
  role: PublicUser['role'];
  account_status: PublicUser['accountStatus'];
  created_at: Date;
}

import type {
  CreateUserInput,
  DbUser,
  PublicUser,
  UserId,
} from './user.types.js';

export async function findUserByEmail(
    email: string,
): Promise<DbUser | null> {
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
    );
  }
}

export async function findUserByUserName(userName:string):Promise<DbUser|null>{
    try{const result = await pool.query<DbUser>(
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
    return result.rows[0] ?? null ;}
    catch(error){
        throw new AppError(
        500,
        'Unable to retrieve the user by username. Please try again later.',
        'DATABASE_QUERY_FAILED',
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
    );
  }
}

export async function createUser(
    data: CreateUserInput,
): Promise<PublicUser> {
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

    throw new AppError(
        500,
        'Unable to create the user account. Please try again later.',
        'DATABASE_QUERY_FAILED',
    );
    }
}
