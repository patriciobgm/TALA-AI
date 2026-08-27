const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

export function setSession(access: string, refresh: string) {
  sessionStorage.setItem('tala_access', access);
  sessionStorage.setItem('tala_refresh', refresh);
}

export function clearSession() {
  sessionStorage.removeItem('tala_access');
  sessionStorage.removeItem('tala_refresh');
}

async function refreshAccess() {
  const refresh = sessionStorage.getItem('tala_refresh');
  if (!refresh) return false;
  const response = await fetch(`${API_URL}/auth/refresh/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }) });
  if (!response.ok) { clearSession(); return false; }
  const data = await response.json();
  sessionStorage.setItem('tala_access', data.access);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = sessionStorage.getItem('tala_access');
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && await refreshAccess()) return api<T>(path, options, false);
  if (!response.ok) {
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    const message = typeof data === 'object' && data && 'detail' in data ? String((data as { detail: unknown }).detail) : 'The request could not be completed.';
    throw new ApiError(response.status, message, data);
  }
  return response.status === 204 ? undefined as T : response.json();
}
