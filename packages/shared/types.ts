// Shared TypeScript types for Crypto Lifeguard

export interface Alert {
  id: number;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  tokens: string[];
  source_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface NewsArticle {
  url: string;
  title: string;
  content: string;
  source: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  published_at: number;
  tokens: string[];
  image_url?: string;
  alert_created?: boolean;
  cached_at?: number;
}

export interface TokenRequest {
  id: number;
  user_id?: string;
  token_symbol: string;
  token_name: string;
  blockchain: string;
  contract_address?: string;
  reason?: string;
  additional_info?: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'spam';
  submitted_at: string;
  reviewed_at?: string;
  reviewed_by?: string;
  admin_notes?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
