/**
 * AI-Assisted Alert Generator
 * Uses OpenAI to analyze news articles and generate smart, pre-populated alerts
 */

import type { NewsArticle } from '../types'

interface AIGeneratedAlert {
  token: string
  title: string
  body: string
  severity: 'critical' | 'warning' | 'info'
  tags: string[]
  deadline?: string
  reasoning?: string
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY

/**
 * Generate a smart alert from a news article using OpenAI
 */
export async function generateAlertFromNews(article: NewsArticle): Promise<AIGeneratedAlert> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured')
  }

  const prompt = `You are a cryptocurrency security analyst. Analyze this news article and generate an alert for crypto investors.

Article Details:
- Title: ${article.title}
- Text: ${article.text || 'No text available'}
- Source: ${article.source_name}
- Sentiment: ${article.sentiment || 'unknown'}
- Tokens: ${article.tickers.join(', ')}
- Date: ${article.date}

Generate a JSON alert with the following structure:
{
  "token": "primary token symbol (e.g., BTC, ETH)",
  "title": "concise alert title (max 80 chars)",
  "body": "detailed alert description with key facts and implications (2-4 sentences)",
  "severity": "critical | warning | info (based on impact and urgency)",
  "tags": ["array", "of", "relevant", "tags"],
  "deadline": "ISO date string if time-sensitive, otherwise null",
  "reasoning": "brief explanation of severity choice"
}

Severity Guidelines:
- critical: Security breaches, exploits, major hacks, exchange failures, regulatory bans
- warning: Price volatility warnings, upcoming deadlines, potential risks, regulatory concerns
- info: General news, updates, new features, partnerships, price movements

Tags should include relevant categories like: security, hack, exploit, price, regulation, upgrade, partnership, etc.

Respond ONLY with valid JSON, no markdown or explanation.`

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a cryptocurrency security analyst who generates concise, actionable alerts. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`OpenAI API error: ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from OpenAI')
    }

    const generatedAlert = JSON.parse(content) as AIGeneratedAlert

    return {
      ...generatedAlert,
      body: generatedAlert.body,  // Use AI body as-is, don't append source URL
      // Fallback to article data if AI didn't provide required fields
      token: generatedAlert.token || article.tickers[0] || 'BTC',
      title: generatedAlert.title || article.title.substring(0, 80),
    }
  } catch (error) {
    console.error('AI alert generation failed:', error)
    
    // Fallback to basic generation if AI fails
    return {
      token: article.tickers[0] || 'BTC',
      title: article.title.substring(0, 80),
      body: article.text || article.title,
      severity: article.sentiment === 'negative' ? 'warning' : 'info',
      tags: ['news', article.sentiment || 'neutral'],
      reasoning: 'AI generation failed, using fallback',
    }
  }
}

/**
 * Check if OpenAI is configured
 */
export function isAIEnabled(): boolean {
  return !!OPENAI_API_KEY && OPENAI_API_KEY !== 'your-openai-api-key-here'
}
