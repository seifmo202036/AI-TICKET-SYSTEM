import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';

import { TEST_PASSWORD } from './db.helper.js';

// All request paths in the specs are written without this prefix
export const API_PREFIX = '/api/v1';

export interface SessionCookies {
  accessCookie: string;
  refreshCookie: string;
}

export interface SignupPayload {
  userName: string;
  email: string;
  password: string;
  role: 'customer' | 'agent';
}

export async function signup(
  request: APIRequestContext,
  payload: SignupPayload,
): Promise<APIResponse> {
  return request.post(`${API_PREFIX}/auth/signup`, { data: payload });
}

function getSetCookieValues(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);
}

function findCookieValue(setCookieHeaders: string[], cookieName: string): string | undefined {
  const cookieHeader = setCookieHeaders.find((header) =>
    header.startsWith(`${cookieName}=`),
  );

  if (!cookieHeader) {
    return undefined;
  }

  return cookieHeader.split(';', 1)[0];
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<{
  response: APIResponse;
  cookies: SessionCookies;
  rawSetCookieHeaders: string[];
}> {
  const response = await request.post(`${API_PREFIX}/auth/login`, {
    data: { email, password },
  });

  const setCookieHeaders = getSetCookieValues(response);
  const accessCookie = findCookieValue(setCookieHeaders, 'accessToken');
  const refreshCookie = findCookieValue(setCookieHeaders, 'refreshToken');

  expect(accessCookie, 'Expected the accessToken Set-Cookie header.').toBeTruthy();
  expect(refreshCookie, 'Expected the refreshToken Set-Cookie header.').toBeTruthy();

  return {
    response,
    cookies: {
      accessCookie: accessCookie as string,
      refreshCookie: refreshCookie as string,
    },
    rawSetCookieHeaders: setCookieHeaders,
  };
}

export async function expectApiError(
  response: APIResponse,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  expect(response.status()).toBe(expectedStatus);

  const body = (await response.json()) as { code?: string; message?: string };

  expect(body.code, `Expected error code ${expectedCode}.`).toBe(expectedCode);
  expect(typeof body.message).toBe('string');
}
