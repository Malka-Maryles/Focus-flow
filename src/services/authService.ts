import { apiRequest } from './api';
import { AuthResponse, User } from '../types';

export const authService = {
  async register(data: { email: string; password: string; display_name: string }): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    return apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async logout(): Promise<void> {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('focusflow_token');
      localStorage.removeItem('focusflow_user');
    }
  },

  async getMe(): Promise<User> {
    return apiRequest<User>('/api/auth/me', { method: 'GET' });
  },
};
