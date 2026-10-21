import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('focusflow_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('focusflow_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function verifyAuth() {
      const storedToken = localStorage.getItem('focusflow_token');
      if (!storedToken) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const currentUser = await authService.getMe();
        setUser(currentUser);
        localStorage.setItem('focusflow_user', JSON.stringify(currentUser));
      } catch {
        setUser(null);
        setToken(null);
        localStorage.removeItem('focusflow_token');
        localStorage.removeItem('focusflow_user');
      } finally {
        setIsLoading(false);
      }
    }

    verifyAuth();

    const handleLogoutEvent = () => {
      setUser(null);
      setToken(null);
    };

    window.addEventListener('focusflow_auth_logout', handleLogoutEvent);
    return () => window.removeEventListener('focusflow_auth_logout', handleLogoutEvent);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const resp = await authService.login({ email, password });
      setToken(resp.access_token);
      setUser(resp.user);
      localStorage.setItem('focusflow_token', resp.access_token);
      localStorage.setItem('focusflow_user', JSON.stringify(resp.user));
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, displayName: string) => {
    setIsLoading(true);
    try {
      const resp = await authService.register({
        email,
        password,
        display_name: displayName,
      });
      setToken(resp.access_token);
      setUser(resp.user);
      localStorage.setItem('focusflow_token', resp.access_token);
      localStorage.setItem('focusflow_user', JSON.stringify(resp.user));
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setToken(null);
      localStorage.removeItem('focusflow_token');
      localStorage.removeItem('focusflow_user');
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
