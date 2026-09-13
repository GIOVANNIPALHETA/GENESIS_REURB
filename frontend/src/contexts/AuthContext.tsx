import React, { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';

type User = { id: string; name: string; email: string; role: string } | null;

type AuthContextValue = {
  token: string | null;
  user: User;
  login: (payload: { token: string; refreshToken?: string; user?: User }, remember?: boolean) => void;
  logout: () => void;
  isAuthenticated: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token') || sessionStorage.getItem('token'));
  const [user, setUser] = useState<User>(() => {
    const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    else delete axios.defaults.headers.common.Authorization;
  }, [token]);

  // Global axios response interceptor to handle 401 (invalid/expired token)
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (error) => {
        const status = error?.response?.status;
        const msg = error?.response?.data?.message;
        if (status === 401) {
          // If token invalid or expired, clear auth and redirect to login
          logout();
          try {
            window.location.href = '/login';
          } catch (e) {
            // ignore
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(id);
    };
  }, []);

  function login(payload: { token: string; refreshToken?: string; user?: User }, remember = true) {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem('token', payload.token);
    if (payload.refreshToken) storage.setItem('refreshToken', payload.refreshToken);
    if (payload.user) storage.setItem('user', JSON.stringify(payload.user));
    // set axios header immediately to avoid race with subsequent requests
    axios.defaults.headers.common.Authorization = `Bearer ${payload.token}`;
    setToken(payload.token);
    setUser(payload.user ?? null);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
    delete axios.defaults.headers.common.Authorization;
    setToken(null);
    setUser(null);
  }

  const value: AuthContextValue = {
    token,
    user,
    login,
    logout,
    isAuthenticated: !!token,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
