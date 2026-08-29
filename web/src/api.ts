import { ApiError } from './types';

const API = '/api/v1';

async function request<T>(
  path: string,
  options: RequestInit = {},
  retryOnExpired = true,
): Promise<T> {
  const hasFormDataBody =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    headers:
      options.body !== undefined && !hasFormDataBody
        ? { 'content-type': 'application/json' }
        : undefined,
    ...options,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  // Access tokens are short-lived: refresh once and retry transparently
  if (
    response.status === 401 &&
    retryOnExpired &&
    body?.code === 'ACCESS_TOKEN_EXPIRED'
  ) {
    const refreshed = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });

    if (refreshed.ok) {
      return request<T>(path, options, false);
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(body?.code ?? 'UNKNOWN_ERROR'),
      String(body?.message ?? 'Something went wrong. Please try again.'),
    );
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data ?? {}),
    }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, {
      method: 'POST',
      body: formData,
    }),
};
