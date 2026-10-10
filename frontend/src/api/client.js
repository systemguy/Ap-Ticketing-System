// Central API wrapper. If your auth setup differs (cookie sessions, a
// different localStorage key, a different base URL), change it HERE only.
// Set VITE_API_URL in .env.local to use another backend (e.g. http://localhost:3000).
export const API_BASE = import.meta.env.VITE_API_URL || 'http://159.65.229.254:3000';
export const TOKEN_KEY = 'token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('loggedIn'); // flag read by Home.jsx
  } catch {
    /* ignore */
  }
}

// Backend errors look like { error: "..." } or { error: ["...", "..."] }.
export function errorText(body, fallback) {
  const detail = body?.error ?? body?.message;
  if (Array.isArray(detail)) return detail.join(' ');
  return detail || fallback;
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = errorText(await res.json(), message);
    } catch {
      /* non-JSON error body */
    }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}
