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
export interface RegistrationOptions { clusters: { id: number; name: string; code: string }[]; grade_levels: number[]; sections: { id: number; name: string; label: string; grade_level: number; cluster: number | null }[] }
export async function getRegistrationOptions() { return api<RegistrationOptions>('/auth/registration-options/'); }
export async function registerStudent(payload: { email: string; password: string; name: string; cluster: number; grade_level: number; section: number }) { return api<{ detail: string }>('/auth/register/', { method: 'POST', body: JSON.stringify(payload) }); }
export async function registerTeacher(payload: { email: string; password: string; name: string; cluster: number }) { return api<{ detail: string }>('/auth/register-teacher/', { method: 'POST', body: JSON.stringify(payload) }); }
export function logout() { clearSession(); }
