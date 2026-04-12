import axios, { type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'
import type { NewsArticle, NewsStats, AdminStats } from '../types'

// In production, use the same domain as the admin dashboard (clg-admin-production.up.railway.app)
// In development, use localhost:3000
const API_URL = import.meta.env.VITE_API_URL || 
  (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000')

// Only log in development
if (import.meta.env.DEV) {
  console.log('[Admin API] Development mode - API URL:', API_URL)
}

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Important for cross-domain cookies
})

// Add auth token to requests
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('admin_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: any) => {
    // Only log errors (not every request)
    if (import.meta.env.DEV) {
      console.error('[Admin API] Request failed:', error.config?.url, error.response?.status, error.message)
    }
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ============================================
// NEWS MANAGEMENT API
// ============================================

/**
 * Fetch news articles from cache with optional filters
 */
export async function fetchNewsCache(params?: {
  token?: string
  days?: number
  page?: number
  limit?: number
}): Promise<NewsArticle[]> {
  const { data } = await api.get('/admin/news/cache', { params })
  return data
}

/**
 * Get news cache statistics
 */
export async function fetchNewsStats(): Promise<NewsStats> {
  const { data } = await api.get('/admin/news/stats')
  return data
}

/**
 * Update a news article (title, text, sentiment, etc.)
 */
export async function updateNewsArticle(
  articleUrl: string,
  updates: Partial<Pick<NewsArticle, 'title' | 'text' | 'sentiment' | 'tickers' | 'topics'>>
): Promise<NewsArticle> {
  const { data } = await api.put(`/admin/news/cache/${encodeURIComponent(articleUrl)}`, updates)
  return data
}

/**
 * Delete a news article from cache
 */
export async function deleteNewsArticle(articleUrl: string): Promise<void> {
  await api.delete(`/admin/news/cache/${encodeURIComponent(articleUrl)}`)
}

/**
 * Force refresh news from CoinDesk RSS feed
 */
export async function refreshNewsCache(): Promise<{ added: number; updated: number }> {
  const { data } = await api.post('/admin/news/refresh')
  return data
}

/**
 * Bulk delete news articles
 */
export async function bulkDeleteNews(articleUrls: string[]): Promise<void> {
  await api.post('/admin/news/cache/bulk-delete', { articleUrls })
}

// ============================================
// ALERT MANAGEMENT API
// ============================================

/**
 * Create a new alert
 */
export async function createAlert(alert: {
  token: string
  title: string
  body?: string
  severity: 'critical' | 'warning' | 'info'
  tags?: string[]
  deadline?: string
  source_url?: string  // Add source URL to track which news article this came from
}): Promise<any> {
  const { data } = await api.post('/admin/alerts', alert)
  return data
}

// ============================================
// ADMIN STATS API
// ============================================

/**
 * Get comprehensive admin statistics
 */
export async function fetchAdminStats(): Promise<AdminStats> {
  const { data } = await api.get('/admin/stats')
  return data
}

// ============================================
// AI DRAFTING API
// ============================================

export interface DraftAlertInput {
  text: string
  source_url?: string
  hint_token?: string
  model?: 'openai' | 'anthropic'
}

export interface DraftAlertResponse {
  draft: {
    token: string
    title: string
    body: string
    severity: 'critical' | 'warning' | 'info'
    tags: string[]
    deadline: string | null
    source_type: string
    source_url?: string
    reasoning?: string
  }
  model: string
}

/**
 * Ask the backend AI to draft a ready-to-edit alert from free text or a news article.
 * Server-side call; uses OpenAI / Anthropic keys held on the backend.
 */
export async function draftAlert(input: DraftAlertInput): Promise<DraftAlertResponse> {
  const { data } = await api.post('/admin/ai/draft-alert', input)
  return data
}

export interface QuickCreateAlertInput {
  input: string
  hint_token?: string
}

export interface QuickCreateAlertResponse {
  alert: {
    id: string
    token: string
    title: string
    description: string
    severity: 'critical' | 'warning' | 'info'
    tags: string[]
    deadline: string
    source_type?: string
    source_url?: string
    logo_url?: string
    further_info?: string
  }
  model: string
  reasoning?: string
  fetched?: { url: string; title: string; siteName: string } | null
}

/**
 * One-shot: paste a link or a blob of text and let the backend fetch, draft
 * AND publish the alert in a single request. Returns the created alert.
 */
export async function quickCreateAlert(input: QuickCreateAlertInput): Promise<QuickCreateAlertResponse> {
  const { data } = await api.post('/admin/ai/quick-create-alert', input)
  return data
}
