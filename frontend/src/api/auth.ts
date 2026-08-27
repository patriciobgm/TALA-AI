import { api, clearSession, setSession } from './client';

export interface AuthUser { id: number; username: string; email: string; name: string; role: 'student' | 'teacher' | 'admin'; class_name: string | null }

export async function login(username: string, password: string) {
  const result = await api<{ access: string; refresh: string; user: AuthUser }>('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) });
  setSession(result.access, result.refresh);
  return result.user;
}

export async function currentUser() { return api<AuthUser>('/auth/me/'); }
export function logout() { clearSession(); }
