import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.ts';
import {type NextFunction } from 'express';

const TOKEN_ISSUER = "intelligent-support-routing-api";
const TOKEN_AUDIENCE = "intelligent-support-routing-web";
export function createAccessToken(userId:number):string {
  const token: string = jwt.sign(
    {},
    env.JWT_SECRET,
    { subject: userId.toString(),
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: Number(env.JWT_EXPIRES_IN_MINUTES) * 60 },
  );
  return token;
}

export function verifyAccessToken(token: string): { userId: number } {

  const payload = jwt.verify(
    token,
    env.JWT_SECRET,
    {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    },
  );
   // jwt.verify() can be typed as JwtPayload | string.
  if (typeof payload === 'string') {
    throw new jwt.JsonWebTokenError(
      'Unexpected JWT payload type',
    );
  }

  if (typeof payload.sub !== 'string') {
    throw new jwt.JsonWebTokenError(
      'Token subject is missing',
    );
  }

  const userId = Number(payload.sub);

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new jwt.JsonWebTokenError(
      'Token subject is invalid',
    );
  }

  return { userId : userId };

};