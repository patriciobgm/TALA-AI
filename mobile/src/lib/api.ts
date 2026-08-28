import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000/api';
const ACCESS_KEY = 'tala_access';
const REFRESH_KEY = 'tala_refresh';

export class ApiError extends Error {
  constructor(public status: number, message: string, public data?: unknown) { super(message); }
}

export async function storeTokens(access: string, refresh: string) {
  await Promise.all([SecureStore.setItemAsync(ACCESS_KEY, access), SecureStore.setItemAsync(REFRESH_KEY, refresh)]);
}

export async function clearTokens() {
  await Promise.all([SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)]);
}

async function refreshAccess() {
  const refresh = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refresh) return false;
  const response = await fetch(`${API_URL}/auth/refresh/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh }) });
  if (!response.ok) { await clearTokens(); return false; }
  const tokens = await response.json();
  await SecureStore.setItemAsync(ACCESS_KEY, tokens.access);
  if (tokens.refresh) await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh);
  return true;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const access = await SecureStore.getItemAsync(ACCESS_KEY);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (access) headers.set('Authorization', `Bearer ${access}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry && await refreshAccess()) return api<T>(path, options, false);
  if (!response.ok) {
    let data: unknown;
    try { data = await response.json(); } catch { data = null; }
    const message = (() => {
      if (!data || typeof data !== 'object') return 'The request could not be completed.';
      if ('detail' in data) return String((data as { detail: unknown }).detail);
      const first = Object.values(data as Record<string, unknown>)[0];
      if (Array.isArray(first)) return first.map(String).join(' ');
      if (typeof first === 'string') return first;
      return 'The request could not be completed.';
    })();
    throw new ApiError(response.status, message, data);
  }
  return response.status === 204 ? undefined as T : response.json();
}
