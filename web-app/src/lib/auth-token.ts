export function getToken(): string | null {
  return localStorage.getItem('token') ?? sessionStorage.getItem('token');
}

export function setToken(token: string, remember: boolean): void {
  if (remember) {
    localStorage.setItem('token', token);
    sessionStorage.removeItem('token');
  } else {
    sessionStorage.setItem('token', token);
    localStorage.removeItem('token');
  }
}

export function removeToken(): void {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
}

export function getUserData(): Record<string, unknown> | null {
  const raw = localStorage.getItem('user') ?? sessionStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function setUserData(user: unknown, remember: boolean): void {
  const value = JSON.stringify(user);
  if (remember) {
    localStorage.setItem('user', value);
    sessionStorage.removeItem('user');
  } else {
    sessionStorage.setItem('user', value);
    localStorage.removeItem('user');
  }
}

export function removeUserData(): void {
  localStorage.removeItem('user');
  sessionStorage.removeItem('user');
}
