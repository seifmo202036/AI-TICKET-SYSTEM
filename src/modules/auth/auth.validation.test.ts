import { describe, expect, it } from 'vitest';

import { loginSchema, signupSchema } from './auth.validation.js';

const validSignup = {
  userName: 'seif_test',
  email: 'Seif@Example.com',
  password: 'Sup3rSecret!',
  role: 'customer' as const,
};

describe('signupSchema', () => {
  it('accepts a valid signup and trims inputs', () => {
    const result = signupSchema.parse(validSignup);

    expect(result.userName).toBe('seif_test');
    expect(result.email).toBe('Seif@Example.com');
    expect(result.role).toBe('customer');
  });

  it('rejects usernames shorter than 3 characters', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, userName: 'ab' }).success,
    ).toBe(false);
  });

  it('rejects usernames longer than 50 characters', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, userName: 'a'.repeat(51) })
        .success,
    ).toBe(false);
  });

  it.each(['has space', 'dash-dash', 'dot.dot', 'exclam!'])(
    'rejects usernames with disallowed characters: %s',
    (userName) => {
      expect(signupSchema.safeParse({ ...validSignup, userName }).success).toBe(
        false,
      );
    },
  );

  it('rejects invalid emails', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rejects passwords shorter than 8 characters', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, password: 'short' }).success,
    ).toBe(false);
  });

  it('rejects passwords longer than 72 bytes (bcrypt limit)', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, password: 'a'.repeat(73) })
        .success,
    ).toBe(false);
  });

  it('accepts a multibyte password within the byte budget', () => {
    const password = `${'é'.repeat(10)}${'a'.repeat(30)}`;

    expect(signupSchema.safeParse({ ...validSignup, password }).success).toBe(
      true,
    );
  });

  it('rejects the admin role at signup', () => {
    expect(
      signupSchema.safeParse({ ...validSignup, role: 'admin' }).success,
    ).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(signupSchema.safeParse({ ...validSignup, extra: 1 })).toEqual(
      expect.objectContaining({ success: false }),
    );
  });
});

describe('loginSchema', () => {
  const validLogin = {
    email: 'user@example.com',
    password: 'whatever-value',
  };

  it('accepts a valid login and trims the email', () => {
    const result = loginSchema.parse({
      ...validLogin,
      email: '  user@example.com  ',
    });

    expect(result.email).toBe('user@example.com');
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ ...validLogin, password: '' }).success).toBe(
      false,
    );
  });

  it('rejects a whitespace-only password', () => {
    expect(
      loginSchema.safeParse({ ...validLogin, password: '   ' }).success,
    ).toBe(false);
  });

  it('rejects unknown properties', () => {
    expect(
      loginSchema.safeParse({ ...validLogin, role: 'admin' }).success,
    ).toBe(false);
  });
});
