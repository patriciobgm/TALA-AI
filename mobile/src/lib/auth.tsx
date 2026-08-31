import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, clearTokens, storeTokens } from './api';
import type { AuthUser } from './types';

type AuthContextValue = { user: AuthUser | null; loading: boolean; signIn: (email: string, password: string, otp?: string) => Promise<void>; signOut: () => Promise<void>; refreshUser: () => Promise<void> };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<AuthUser>('/auth/me/').then(setUser).catch(() => clearTokens()).finally(() => setLoading(false)); }, []);
  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signIn: async (email, password, otp) => {
      const response = await api<{ access: string; refresh: string; user: AuthUser }>('/auth/login/', { method: 'POST', body: JSON.stringify({ username: email, password, otp }) }, false);
      if (response.user.role !== 'student') throw new Error('The mobile application currently supports student accounts only.');
      await storeTokens(response.access, response.refresh); setUser(response.user);
    },
    signOut: async () => { await clearTokens(); setUser(null); },
    refreshUser: async () => { setUser(await api<AuthUser>('/auth/me/')); },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
