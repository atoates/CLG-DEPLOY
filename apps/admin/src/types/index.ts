// Type definitions for Crypto Lifeguard Admin Panel

export interface NewsArticle {
  article_url: string          // Primary key
  title: string
  text: string | null
  source_name: string           // e.g., 'CoinDesk'
  date: string                  // ISO datetime string (converted from Unix timestamp)
  sentiment: 'positive' | 'neutral' | 'negative' | null
  tickers: string[]             // Array of token symbols ["BTC", "ETH"]
  topics: string[]              // Array of topics (future use)
  image_url: string | null
  expires_at: string            // ISO datetime
  created_at: string            // ISO datetime
  alert_created?: boolean       // Whether an alert has been created from this article
}

export interface Alert {
  id: number
  token: string                 // e.g., 'BTC', 'ETH', 'SOL'
  title: string
  body: string | null
  severity: 'critical' | 'warning' | 'info'
  tags: string[]                // Array of tags ["hack", "exploit"]
  deadline: string | null       // ISO datetime
  created_at: string
  updated_at: string
}

export interface AdminStats {
  alerts: {
    total: number
    critical: number
    warning: number
    info: number
    byToken: Record<string, number>
  }
  news: {
    totalCached: number
    freshToday: number
    expiringIn7Days: number
    topSources: Array<{ name: string; count: number }>
    byToken: Record<string, number>
  }
  users: {
    total: number
    activeToday: number
    watchlistTokens: Record<string, number>
  }
}

export interface NewsStats {
  totalCached: number
  byToken: Array<{ token: string; count: number }>
  avgAgeSeconds: number
  expiringSoon: number
  oldestArticle: string | null
  newestArticle: string | null
}

export interface AdminInfo {
  counts: {
    alerts: number
    users: number
    user_prefs: number
    news_articles?: number
  }
  dataDir?: string
  backupDir?: string
}
