import { api, clearSession, setSession } from './client';

export interface AuthUser { id: number; username: string; email: string; name: string; role: 'student' | 'teacher' | 'admin'; is_superadmin: boolean; class_name: string | null; must_change_password: boolean; mfa_enabled: boolean; privacy_acknowledgment_required: boolean }

export async function login(username: string, password: string, otp = '') {
  const result = await api<{ access: string; refresh: string; user: AuthUser }>('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password, otp }) });
  setSession(result.access, result.refresh);
  return result.user;
}

export async function currentUser() { return api<AuthUser>('/auth/me/'); }
export async function requestPasswordReset(email: string) { return api<{ detail: string }>('/auth/password-reset/', { method: 'POST', body: JSON.stringify({ email }) }); }
export async function resetPassword(uid: string, token: string, password: string) { return api<{ detail: string }>('/auth/password-reset/confirm/', { method: 'POST', body: JSON.stringify({ uid, token, password }) }); }
export function logout() { clearSession(); }
