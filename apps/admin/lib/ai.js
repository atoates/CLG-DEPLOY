// lib/ai.js - AI utilities module
// Extracted from server.js to separate AI concerns

const crypto = require('crypto');
const { trackAPICall } = require('./db');
const log = require('./logger');

// AI API keys (trimmed to remove whitespace/newlines)
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();
const ANTHROPIC_API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const XAI_API_KEY = (process.env.XAI_API_KEY || process.env.XAI_APIKEY || process.env.XAI_TOKEN || '').trim();

// Prompt version for tracking summary generations
const ALERT_SUMMARY_PROMPT_VERSION = 1;

/* -------- Alert Summary Helper Functions -------- */

/**
 * Build a deterministic hash of alert properties for staleness detection
 */
function buildAlertSourceHash(alert) {
  const payload = JSON.stringify({
    v: ALERT_SUMMARY_PROMPT_VERSION,
    token: alert.token || '',
    title: alert.title || '',
    description: alert.description || '',
    further_info: alert.further_info || '',
    severity: alert.severity || '',
    tags: Array.isArray(alert.tags) ? alert.tags.slice().sort() : [],
    deadline: alert.deadline || ''
  });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

/**
 * Build a detailed prompt for AI to analyze a single alert
 */
function buildAlertSummaryPrompt(alert) {
  const token = alert.token || 'the token';
  const lines = [
    `I'm reading an alert on Crypto Lifeguard about ${token}. Here are the details:`,
    '',
    `Title: ${alert.title || ''}`,
    `Severity: ${alert.severity || 'info'}`,
    alert.description ? `Summary: ${alert.description}` : '',
    alert.further_info ? `Background: ${alert.further_info}` : '',
    alert.deadline ? `Deadline: ${new Date(alert.deadline).toISOString()}` : '',
    Array.isArray(alert.tags) && alert.tags.length ? `Tags: ${alert.tags.join(', ')}` : '',
    '',
    `Give me a tight analysis of this alert in 3 short paragraphs:`,
    `1. What is happening, in plain English, and why it matters right now.`,
    `2. Who is affected and what concrete actions (if any) a holder should consider.`,
    `3. Any wider context from recent news or market moves.`,
    '',
    `Keep it calm, concrete, and avoid financial advice. Use UK English spelling.`
  ].filter(Boolean);
  return lines.join('\n');
}

/* -------- Alert Summary API Callers -------- */

/**
 * Call OpenAI to generate alert summary
 */
async function callOpenAISummary(prompt) {
  if (!OPENAI_API_KEY) throw new Error('no-openai');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.4,
      max_tokens: 700
    })
  });
  try { await trackAPICall('OpenAI', '/v1/chat/completions'); } catch (_) {}
  if (!r.ok) throw new Error(`openai ${r.status}`);
  const d = await r.json();
  const content = d.choices?.[0]?.message?.content || '';
  return { content, model: 'openai:gpt-4o-mini' };
}

/**
 * Call Anthropic to generate alert summary
 */
async function callAnthropicSummary(prompt) {
  if (!ANTHROPIC_API_KEY) throw new Error('no-anthropic');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 700,
      system: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.',
      messages: [{ role: 'user', content: prompt }]
    })
  });
  try { await trackAPICall('Anthropic', '/v1/messages'); } catch (_) {}
  if (!r.ok) throw new Error(`anthropic ${r.status}`);
  const d = await r.json();
  const content = (d.content && d.content[0] && d.content[0].text) || '';
  return { content, model: 'anthropic:claude-3-5-sonnet' };
}

/**
 * Call xAI (Grok) to generate alert summary
 */
async function callXAISummary(prompt) {
  if (!XAI_API_KEY) throw new Error('no-xai');
  const model = 'grok-4.20-0309-reasoning';
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are Sentinel AI, a calm crypto-security analyst. Write clear, concrete analysis in plain English. Never give financial advice. Use UK English spelling.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 700
    })
  });
  try { await trackAPICall('xAI', '/v1/chat/completions'); } catch (_) {}
  if (!r.ok) throw new Error(`xai ${r.status}`);
  const d = await r.json();
  const content = d.choices?.[0]?.message?.content || '';
  return { content, model: `xai:${model}` };
}

/**
 * Generate alert summary content by trying multiple AI providers
 * Tries xAI first, then OpenAI, then Anthropic
 */
async function generateAlertSummaryContent(alert) {
  const prompt = buildAlertSummaryPrompt(alert);
  const attempts = [callXAISummary, callOpenAISummary, callAnthropicSummary];
  let lastErr = null;

  for (const fn of attempts) {
    try {
      const out = await fn(prompt);
      if (out && out.content && out.content.trim().length > 20) {
        return out;
      }
    } catch (e) {
      lastErr = e;
      log.warn('[alert-summary] provider failed:', e && e.message);
    }
  }
  throw new Error(lastErr ? (lastErr.message || 'ai_unavailable') : 'ai_unavailable');
}

/* -------- Portfolio Summary API Callers -------- */

/**
 * Call OpenAI for portfolio summary
 * Uses gpt-4o model for comprehensive analysis
 */
async function callOpenAI(prompt) {
  const model = 'gpt-4o';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3
    })
  });

  await trackAPICall('OpenAI', '/v1/chat/completions');

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content.trim(),
    model: `OpenAI ${model}`,
    usage: data.usage
  };
}

/**
 * Call Anthropic for portfolio summary
 * Uses claude-3-5-sonnet model
 */
async function callAnthropic(prompt) {
  const model = 'claude-3-5-sonnet-20241022';
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  await trackAPICall('Anthropic', '/v1/messages');

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.content[0].text.trim(),
    model: `Anthropic ${model}`,
    usage: data.usage
  };
}

/**
 * Call xAI (Grok) for portfolio summary
 */
async function callXAI(prompt) {
  const model = 'grok-4.20-0309-reasoning';
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000
    })
  });

  await trackAPICall('xAI', '/v1/chat/completions');

  if (!response.ok) throw new Error(`xAI API error: ${response.status}`);
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';
  return {
    content: content.trim(),
    model: `xAI ${model}`,
    usage: data.usage || null
  };
}

/**
 * Generate AI summary for portfolio alerts
 * Respects user-selected model preference, falls back to available providers
 */
async function generateAISummary(alerts, tokens, sevFilter, tagFilter, selectedModel) {
  // Prepare alerts data for AI analysis
  const alertsData = alerts.map(alert => ({
    token: alert.token,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    deadline: alert.deadline,
    tags: Array.isArray(alert.tags) ? alert.tags : (alert.tags ? JSON.parse(alert.tags) : [])
  }));

  const prompt = `You are a crypto portfolio assistant. Analyze these alerts and recent news to provide a comprehensive summary for a user monitoring these tokens: ${tokens.join(', ')}.

Current alerts (${alerts.length} total):
${alertsData.map(a => `- ${a.token}: ${a.title} (${a.severity}) - ${a.description} [Deadline: ${a.deadline}]`).join('\n')}

Please provide:
1. **Executive Summary** (2-3 sentences): Key takeaways and urgent actions needed
2. **Critical Actions** (if any): Time-sensitive items requiring immediate attention
3. **Token-Specific Insights**: Brief analysis for each token
4. **Timeline Overview**: Key dates and deadlines to watch

Keep it concise, actionable, and focused on portfolio management decisions.`;

  // Respect user-selected model if provided, default to OpenAI
  // 'auto' is treated as 'openai' for consistency
  const prefer = (selectedModel || 'openai').toLowerCase();
  const normalizedPrefer = prefer === 'auto' ? 'openai' : prefer;

  log.debug(`[generateAISummary] selectedModel="${selectedModel}", prefer="${prefer}", normalized="${normalizedPrefer}"`);

  try {
    if (normalizedPrefer === 'xai' || normalizedPrefer === 'grok') {
      if (!XAI_API_KEY) throw new Error('no-xai');
      const result = await callXAI(prompt);
      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    }
    if (normalizedPrefer === 'openai') {
      if (!OPENAI_API_KEY) throw new Error('no-openai');
      const result = await callOpenAI(prompt);
      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    }
    if (normalizedPrefer === 'anthropic') {
      if (!ANTHROPIC_API_KEY) throw new Error('no-anthropic');
      const result = await callAnthropic(prompt);
      return {
        content: result.content,
        model: result.model,
        usage: result.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    }
  } catch (e) {
    log.warn('Preferred model failed, falling back:', e.message);
  }

  // Auto order: OpenAI -> Anthropic -> xAI
  if (OPENAI_API_KEY) {
    try {
      const response = await callOpenAI(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      log.warn('OpenAI failed, trying Anthropic:', error.message);
    }
  }

  if (ANTHROPIC_API_KEY) {
    try {
      const response = await callAnthropic(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      log.warn('Anthropic API error:', error.message);
    }
  }

  if (XAI_API_KEY) {
    try {
      const response = await callXAI(prompt);
      return {
        content: response.content,
        model: response.model,
        usage: response.usage,
        alertCount: alerts.length,
        tokenCount: tokens.length
      };
    } catch (error) {
      log.warn('xAI API error:', error.message);
    }
  }

  // Fallback to rule-based summary
  return {
    content: generateFallbackSummary(alerts, tokens),
    model: 'Fallback (Rule-based)',
    usage: null,
    alertCount: alerts.length,
    tokenCount: tokens.length
  };
}

/**
 * Fallback summary generation when all AI providers fail
 */
function generateFallbackSummary(alerts, tokens) {
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  const infoCount = alerts.filter(a => a.severity === 'info').length;

  const upcomingDeadlines = alerts
    .filter(a => new Date(a.deadline) > new Date())
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 3);

  const tokenSummary = tokens.map(token => {
    const tokenAlerts = alerts.filter(a => a.token === token);
    const urgent = tokenAlerts.filter(a => a.severity === 'critical').length;
    return `${token}: ${tokenAlerts.length} alert${tokenAlerts.length !== 1 ? 's' : ''}${urgent ? ` (${urgent} critical)` : ''}`;
  }).join(', ');

  return `**Executive Summary**
You have ${alerts.length} active alerts across ${tokens.length} tokens. ${criticalCount} critical items require immediate attention.

**Critical Actions**
${criticalCount > 0 ? `${criticalCount} critical alerts need immediate review.` : 'No critical actions required at this time.'}

**Token-Specific Insights**
${tokenSummary || 'No specific token insights available.'}

**Timeline Overview**
${upcomingDeadlines.length > 0 ?
  upcomingDeadlines.map(a => `${a.token}: ${a.title} by ${new Date(a.deadline).toLocaleDateString()}`).join('\n') :
  'No upcoming deadlines in the near term.'
}

*Note: This is an automated summary. AI-powered analysis requires API configuration.*`;
}

/**
 * Generate follow-up question suggestions for chat conversations
 */
async function generateSuggestionsAI({ assistantText, userMessage, context, profile }) {
  try {
    // Build a compact context string for the suggestion model
    const holdings = profile ? (typeof profile.holdings === 'string'
      ? JSON.parse(profile.holdings || '[]') : (profile.holdings || [])) : [];
    const holdingsStr = holdings.length ? holdings.map(h => h.token).join(', ') : 'none';

    const prompt = `You generate 2-3 short follow-up question suggestions for a crypto chat assistant called Sentinel AI.

Given the user's last message and the assistant's response, suggest 2-3 natural follow-up questions the user might want to ask next. Each must be directly relevant to what was just discussed.

Rules:
- Each suggestion must be a short question or request (under 50 characters)
- Each must have an emoji icon
- They must flow naturally from the conversation
- Do NOT suggest things already covered in the assistant's response
- Return ONLY valid JSON: an array of objects with "icon" and "text" fields
- If the user has holdings (${holdingsStr}), occasionally reference them

User said: "${(userMessage || '').slice(0, 200)}"
Assistant said: "${(assistantText || '').slice(0, 500)}"

Return JSON array only, no other text:`;

    // Use a fast, cheap model for this
    let result = null;
    if (OPENAI_API_KEY) {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 200
        })
      });
      await trackAPICall('OpenAI', '/v1/chat/completions (suggestions)');
      if (r.ok) {
        const data = await r.json();
        const raw = data.choices?.[0]?.message?.content || '';
        // Extract JSON array from response (handle markdown code blocks)
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      }
    } else if (XAI_API_KEY) {
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${XAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-4.20-0309-reasoning',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 200
        })
      });
      await trackAPICall('xAI', '/v1/chat/completions (suggestions)');
      if (r.ok) {
        const data = await r.json();
        const raw = data.choices?.[0]?.message?.content || '';
        const jsonMatch = raw.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0]);
        }
      }
    }

    if (Array.isArray(result) && result.length > 0) {
      return result
        .filter(s => s && typeof s.text === 'string' && s.text.length > 0)
        .slice(0, 3)
        .map(s => ({ icon: s.icon || '💬', text: s.text.slice(0, 60) }));
    }
  } catch (e) {
    log.warn('[suggestions] AI generation failed:', e.message);
  }

  // Fallback: return empty (no suggestions is better than irrelevant ones)
  return [];
}

/* -------- Module Exports -------- */
module.exports = {
  // Constants
  OPENAI_API_KEY,
  ANTHROPIC_API_KEY,
  XAI_API_KEY,
  ALERT_SUMMARY_PROMPT_VERSION,

  // Alert summary helpers
  buildAlertSourceHash,
  buildAlertSummaryPrompt,

  // Alert summary API callers
  callOpenAISummary,
  callAnthropicSummary,
  callXAISummary,
  generateAlertSummaryContent,

  // Portfolio summary API callers
  callOpenAI,
  callAnthropic,
  callXAI,
  generateAISummary,
  generateFallbackSummary,

  // Suggestions
  generateSuggestionsAI
};
