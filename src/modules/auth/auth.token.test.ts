import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

import {
  ACCESS_TOKEN_COOKIE_MAX_AGE,
  REFRESH_TOKEN_COOKIE_MAX_AGE,
  createAccessToken,
  createRefreshToken,
  getRefreshTokenExpiresAt,
  hashRefreshToken,
  verifyAccessToken,
} from './auth.token.js';
import { env } from '../../config/env.js';

const TOKEN_ISSUER = 'ai-ticket-system-api';
const TOKEN_AUDIENCE = 'ai-ticket-system-web';

function signCustomToken(
  payload: string | Record<string, unknown>,
  options: jwt.SignOptions,
): string {
  return jwt.sign(payload, env.JWT_SECRET, options);
}

describe('createAccessToken / verifyAccessToken', () => {
  it('round-trips a user id', () => {
    const token = createAccessToken('42');

    expect(verifyAccessToken(token)).toEqual({ userId: '42' });
  });

  it('rejects an expired access token', () => {
    const token = signCustomToken(
      {},
      {
        subject: '42',
        algorithm: 'HS256',
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn: -1,
      },
    );

    expect(() => verifyAccessToken(token)).toThrowError(jwt.TokenExpiredError);
  });

  it('rejects a token with the wrong issuer', () => {
    const token = signCustomToken(
      {},
      {
        subject: '42',
        algorithm: 'HS256',
        issuer: 'other-issuer',
        audience: TOKEN_AUDIENCE,
      },
    );

    expect(() => verifyAccessToken(token)).toThrowError(jwt.JsonWebTokenError);
  });

  it('rejects a token with the wrong audience', () => {
    const token = signCustomToken(
      {},
      {
        subject: '42',
        algorithm: 'HS256',
        issuer: TOKEN_ISSUER,
        audience: 'other-audience',
      },
    );

    expect(() => verifyAccessToken(token)).toThrowError(jwt.JsonWebTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = jwt.sign({}, 'a-different-secret-value-at-least-32-chars', {
      subject: '42',
      algorithm: 'HS256',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifyAccessToken(token)).toThrowError(jwt.JsonWebTokenError);
  });

  it('rejects a token whose payload is a plain string', () => {
    // jsonwebtoken validates claims before exposing the payload, so this
    // defensive branch is exercised by stubbing the library response.
    const verifySpy = vi
      .spyOn(jwt, 'verify')
      .mockReturnValueOnce('plain-string-payload' as never);

    try {
      const token = createAccessToken('42');

      expect(() => verifyAccessToken(token)).toThrowError(
        /Unexpected JWT payload type/,
      );
    } finally {
      verifySpy.mockRestore();
    }
  });

  it.each(['abc', '', '0', '-1', '1.5', '12ab'])(
    'rejects a malformed subject: %s',
    (subject) => {
      const token = signCustomToken(
        {},
        {
          subject,
          algorithm: 'HS256',
          issuer: TOKEN_ISSUER,
          audience: TOKEN_AUDIENCE,
        },
      );

      expect(() => verifyAccessToken(token)).toThrowError(
        /Token subject is (missing|invalid)/,
      );
    },
  );
});

describe('refresh token helpers', () => {
  it('creates a URL-safe refresh token with sufficient entropy', () => {
    const token = createRefreshToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{80,}$/);
  });

  it('produces distinct refresh tokens', () => {
    expect(createRefreshToken()).not.toBe(createRefreshToken());
  });

  it('hashes refresh tokens with SHA-256 as lowercase hex', () => {
    expect(hashRefreshToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('computes the refresh expiry from the configured day count', () => {
    const before = Date.now();
    const expiresAt = getRefreshTokenExpiresAt().getTime();
    const after = Date.now();
    const expectedMs = env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;

    expect(expiresAt - before).toBeGreaterThanOrEqual(expectedMs);
    expect(expiresAt - after).toBeLessThanOrEqual(expectedMs);
  });

  it('derives cookie max ages from the environment', () => {
    expect(ACCESS_TOKEN_COOKIE_MAX_AGE).toBe(
      env.ACCESS_TOKEN_EXPIRES_IN_MINUTES * 60 * 1000,
    );
    expect(REFRESH_TOKEN_COOKIE_MAX_AGE).toBe(
      env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );
  });
});
