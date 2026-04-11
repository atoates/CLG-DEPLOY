/**
 * AI-Assisted Alert Generator
 *
 * Thin client-side wrapper around the backend `/admin/ai/draft-alert` endpoint.
 * All AI keys live on the server; the browser never touches OpenAI / Anthropic
 * directly.
 */

import type { NewsArticle } from '../types'
import { draftAlert, type DraftAlertResponse } from './api'

export interface AIGeneratedAlert {
  token: string
  title: string
  body: string
  severity: 'critical' | 'warning' | 'info'
  tags: string[]
  deadline?: string | null
  source_type?: string
  source_url?: string
  reasoning?: string
  model?: string
}

/**
 * Generate a smart alert from a news article by calling the backend drafter.
 */
export async function generateAlertFromNews(article: NewsArticle): Promise<AIGeneratedAlert> {
  const text = [
    `Title: ${article.title}`,
    article.text ? `Text: ${article.text}` : null,
    article.source_name ? `Source: ${article.source_name}` : null,
    article.sentiment ? `Sentiment: ${article.sentiment}` : null,
    article.tickers?.length ? `Tokens: ${article.tickers.join(', ')}` : null,
    article.date ? `Date: ${article.date}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const res: DraftAlertResponse = await draftAlert({
      text,
      source_url: (article as any).news_url || (article as any).url,
      hint_token: article.tickers?.[0],
    })

    return {
      ...res.draft,
      model: res.model,
    }
  } catch (error) {
    console.error('AI alert generation failed:', error)

    // Local fallback so the composer still gets useful defaults if the
    // backend is unreachable.
    return {
      token: (article.tickers?.[0] || 'BTC').toUpperCase(),
      title: (article.title || '').substring(0, 120),
      body: article.text || article.title || '',
      severity: article.sentiment === 'negative' ? 'warning' : 'info',
      tags: ['news'],
      source_type: 'mainstream-media',
      source_url: (article as any).news_url || (article as any).url,
      reasoning: 'AI generation failed, using local fallback.',
      model: 'Local fallback',
    }
  }
}

/**
 * Draft an alert from arbitrary free text (tip, DM, tweet, internal note, etc.)
 */
export async function generateAlertFromText(
  text: string,
  opts?: { source_url?: string; hint_token?: string }
): Promise<AIGeneratedAlert> {
  const res = await draftAlert({
    text,
    source_url: opts?.source_url,
    hint_token: opts?.hint_token,
  })
  return { ...res.draft, model: res.model }
}

/**
 * AI is always available on the backend (it degrades to a rule-based fallback
 * if no keys are configured). We still expose this for UI gating.
 */
export function isAIEnabled(): boolean {
  return true
}
