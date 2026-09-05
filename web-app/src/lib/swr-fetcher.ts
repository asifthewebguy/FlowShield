import { getToken, removeToken, removeUserData } from '@/lib/auth-token';

/**
 * Shared SWR fetcher for authenticated GET requests.
 *
 * - No token → redirect to login.
 * - 401 → clear stored auth and redirect to login (expired session).
 * - Any other non-ok response → throw, so SWR surfaces it as `error`.
 */
export const authFetcher = (url: string) => {
  const token = getToken();
  if (!token) {
    window.location.href = '/auth/login';
    throw new Error('No token');
  }

  return fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  }).then(async res => {
    if (res.status === 401) {
      removeToken();
      removeUserData();
      window.location.href = '/auth/login';
      throw new Error('Session expired');
    }
    if (!res.ok) {
      throw new Error('An error occurred while fetching the data.');
    }
    return res.json();
  });
};
