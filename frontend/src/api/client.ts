const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api';

export function normalizeProtectedUrl(url: string) {
  const mediaUrl = new URL(url, window.location.origin);
  const apiUrl = new URL(API_URL, window.location.origin);
  return `${apiUrl.origin}${mediaUrl.pathname}${mediaUrl.search}`;
}

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
  if (data.refresh) sessionStorage.setItem('tala_refresh', data.refresh);
  return true;
}

function errorMessage(data: unknown, status: number) {
  if (typeof data === 'object' && data) {
    if ('detail' in data) return String((data as { detail: unknown }).detail);
    for (const [field, value] of Object.entries(data)) {
      const message = Array.isArray(value) ? value[0] : value;
      if (typeof message === 'string') return `${field.replaceAll('_', ' ')}: ${message}`;
    }
  }
  return status >= 500 ? 'The server encountered an error. Try again or check the backend log.' : 'The request could not be completed.';
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = sessionStorage.getItem('tala_access');
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && await refreshAccess()) return api<T>(path, options, false);
  if (!response.ok) {
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    throw new ApiError(response.status, errorMessage(data, response.status), data);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export async function protectedBlob(url: string, retry = true): Promise<Blob> {
  const token = sessionStorage.getItem('tala_access');
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(normalizeProtectedUrl(url), { headers });
  if (response.status === 401 && retry && await refreshAccess()) return protectedBlob(url, false);
  if (!response.ok) throw new ApiError(response.status, `The document could not be loaded (${response.status}).`);
  return response.blob();
}
