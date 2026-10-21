import { apiRequest } from './api';
import { ContentItem, ContentType } from '../types';

export interface CreateContentPayload {
  title: string;
  content_type: ContentType;
  text?: string;
  url?: string;
}

export const contentService = {
  async list(): Promise<ContentItem[]> {
    return apiRequest<ContentItem[]>('/api/content', { method: 'GET' });
  },

  async get(id: string): Promise<ContentItem> {
    return apiRequest<ContentItem>(`/api/content/${id}`, { method: 'GET' });
  },

  async create(payload: CreateContentPayload): Promise<ContentItem> {
    return apiRequest<ContentItem>('/api/content', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async delete(id: string): Promise<{ message: string; id: string }> {
    return apiRequest<{ message: string; id: string }>(`/api/content/${id}`, {
      method: 'DELETE',
    });
  },
};
