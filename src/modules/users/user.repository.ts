import { unknown } from 'zod';
import { pool } from '../../db/pool.js';
import { AppError } from '../../errors/app-error.ts';

interface PublicUserRow {
  id: string;
  user_name: string;
  email: string;
  role: PublicRecord['role'];
  account_status: PublicRecord['accountStatus'];
  created_at: Date;
}

import type {
  CreateUserData,
  PublicRecord,
  UserRecord,
} from './user.types.ts';

export async function findUserByEmail(
    email: string,
): Promise<UserRecord | null> {
    try {
    const result = await pool.query<UserRecord>(
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
      'Failed to retrieve user',
      'DATABASE_QUERY_FAILED',
    );
  }
}

export async function findUserByUserName(userName:string):Promise<UserRecord|null>{
    try{const result = await pool.query<UserRecord>(
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
        'Failed to retrieve user',
        'DATABASE_QUERY_FAILED',
    );
    }
    
}



export async function findPublicUserById(
  id: string,
): Promise<PublicRecord | null> {
  try {
    const result = await pool.query<PublicUserRow>(
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
      [id],
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
      'Failed to retrieve user',
      'DATABASE_QUERY_FAILED',
    );
  }
}

interface CreatedUserRow {
  id: string;
  user_name: string;
  email: string;
  role: PublicRecord['role'];
  account_status: PublicRecord['accountStatus'];
  created_at: Date;
}

export async function createUser(
    data: CreateUserData,
): Promise<PublicRecord> {
    try {
    const result = await pool.query<CreatedUserRow>(
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
        'User creation did not return a user',
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
        'Failed to create user',
        'DATABASE_QUERY_FAILED',
    );
    }
}