import {
  createHash,
  randomBytes,
} from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import type { UserId } from "../users/user.types.js";


const TOKEN_ISSUER = "ai-ticket-system-api";
const TOKEN_AUDIENCE = "ai-ticket-system-web";
export function createAccessToken(userId: UserId): string {
  const token: string = jwt.sign(
    {},
    env.JWT_SECRET,
    { subject: userId,
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN_MINUTES * 60 },
  );
  return token;
}

export function verifyAccessToken(token: string): { userId: UserId } {

  const payload = jwt.verify(
    token,
    env.JWT_SECRET,
    {
      algorithms: ["HS256"],
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    },
  );
   // jwt.verify() can be typed as JwtPayload Object| string so Validate
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

  const userId = payload.sub;

  if (!/^[1-9]\d*$/.test(userId)) {
    throw new jwt.JsonWebTokenError(
      'Token subject is invalid',
    );
  }

  return { userId };

};

export function createRefreshToken():string{
  return randomBytes(64).toString("base64url");
};
export function hashRefreshToken (token:string):string{
  return createHash('sha256').update(token).digest("hex");
}

export function getRefreshTokenExpiresAt(): Date {
  return new Date((Date.now())+(env.REFRESH_TOKEN_EXPIRES_IN_DAYS*24 *60*60*1000));
}
export const REFRESH_TOKEN_COOKIE_MAX_AGE =
  env.REFRESH_TOKEN_EXPIRES_IN_DAYS*24*60*60 *1000;
export const ACCESS_TOKEN_COOKIE_MAX_AGE =
  env.ACCESS_TOKEN_EXPIRES_IN_MINUTES*60*1000;
