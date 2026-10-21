export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export type ContentType = 'text' | 'youtube';

export interface ContentItem {
  id: string;
  user_id: string;
  title: string;
  content_type: ContentType;
  text?: string;
  url?: string;
  created_at: string;
}

export type SessionStatus = 'active' | 'completed';

export interface Reading {
  id: string;
  session_id: string;
  timestamp: string;
  attention_score: number | null;
  face_detected: boolean;
  prediction_source: string;
}

export interface Session {
  id: string;
  user_id: string;
  content_id: string;
  content_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: SessionStatus;
  average_attention: number | null;
  valid_readings_count: number;
  total_readings_count: number;
  readings?: Reading[];
}
