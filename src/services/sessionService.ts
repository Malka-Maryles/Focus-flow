import { apiRequest } from './api';
import { Session, Reading } from '../types';

export const sessionService = {
  async create(contentId: string): Promise<Session> {
    return apiRequest<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ content_id: contentId }),
    });
  },

  async addReading(
    sessionId: string,
    reading: {
      timestamp: string;
      attention_score: number | null;
      face_detected: boolean;
      prediction_source: string;
    }
  ): Promise<Reading> {
    return apiRequest<Reading>(`/api/sessions/${sessionId}/readings`, {
      method: 'POST',
      body: JSON.stringify(reading),
    });
  },

  async end(sessionId: string): Promise<Session> {
    return apiRequest<Session>(`/api/sessions/${sessionId}/end`, {
      method: 'POST',
    });
  },

  async list(): Promise<Session[]> {
    return apiRequest<Session[]>('/api/sessions', { method: 'GET' });
  },

  async get(sessionId: string): Promise<Session> {
    return apiRequest<Session>(`/api/sessions/${sessionId}`, { method: 'GET' });
  },
};
