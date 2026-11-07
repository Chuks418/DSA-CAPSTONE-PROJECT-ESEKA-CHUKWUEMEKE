const TOKEN_KEY = 'eventhub_token';
const USER_KEY = 'eventhub_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser() {
  const storedUser = localStorage.getItem(USER_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    clearSession();
    return null;
  }
}

export function setSession({ token, user }) {
  if (!token || !user) {
    throw new Error('A token and user are required to create a session');
  }

  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getToken());
}

export function getUserRole() {
  return getUser()?.role ?? null;
}

export function logout() {
  clearSession();
  window.location.href = '/';
}