// VisionLab – Authentication context and hook

import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, TOKEN_KEY } from '../services/api';
import type { UserOut } from '../types/api';

interface AuthContextValue {
  user: UserOut | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState<string | null>(
    localStorage.getItem(TOKEN_KEY)
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (token) {
      authApi
        .me()
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem(TOKEN_KEY);
          setToken(null);
        })
        .finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token]);

  // When the axios interceptor fires 'visionlab:auth-expired', clear local auth
  // state so the ProtectedRoute redirects to /login without a full page reload.
  useEffect(() => {
    const handleExpiry = () => {
      localStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
    };
    window.addEventListener('visionlab:auth-expired', handleExpiry);
    return () => window.removeEventListener('visionlab:auth-expired', handleExpiry);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password);
    const { access_token } = res.data;
    setToken(access_token);
    const meRes = await authApi.me();
    setUser(meRes.data);
  };

  const register = async (username: string, email: string, password: string) => {
    await authApi.register(username, email, password);
    await login(username, password);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
