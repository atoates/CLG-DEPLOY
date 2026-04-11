import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Newspaper,
  RefreshCw,
  Trash2,
  Edit2,
  Search,
  X,
  Save,
  Bell,
  CheckCircle2,
  Sparkles,
  Wand2,
  Loader2,
  ExternalLink,
  Clock,
} from 'lucide-react'
import {
  fetchNewsCache,
  fetchNewsStats,
  updateNewsArticle,
  deleteNewsArticle,
  refreshNewsCache,
  createAlert,
} from '../lib/api'
import { generateAlertFromNews, type AIGeneratedAlert } from '../lib/aiAlertGenerator'
import type { NewsArticle } from '../types'

const VALID_TAGS = [
  'price-change',
  'migration',
  'hack',
  'fork',
  'scam',
  'airdrop',
  'whale',
  'news',
  'community',
  'exploit',
  'privacy',
  'community-vote',
  'token-unlocks',
] as const

type AlertComposer = {
  token: string
  title: string
  body: string
  severity: 'critical' | 'warning' | 'info'
  tags: string[]
  deadline: string
  source_url: string
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDeadline(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(23, 59, 0, 0)
  return toLocalInput(d)
}

export function NewsFeed() {
  const queryClient = useQueryClient()
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null)
  const [editForm, setEditForm] = useState({
    title: '',
    text: '',
    sentiment: '' as 'positive' | 'neutral' | 'negative' | '',
    tickers: [] as string[],
  })
  const [creatingAlert, setCreatingAlert] = useState<NewsArticle | null>(null)
  const [alertForm, setAlertForm] = useState<AlertComposer>({
    token: '',
    title: '',
    body: '',
    severity: 'info',
    tags: [],
    deadline: defaultDeadline(7),
    source_url: '',
  })
  const [aiLoading, setAiLoading] = useState(false)
  const [aiModel, setAiModel] = useState('')
  const [aiReasoning, setAiReasoning] = useState('')
  const [successToast, setSuccessToast] = useState('')

  const { data: articles = [], isLoading } = useQuery<NewsArticle[]>({
    queryKey: ['news-cache', selectedToken],
    queryFn: () => fetchNewsCache({ token: selectedToken || undefined, days: 120 }),
  })

  const { data: stats } = useQuery({
    queryKey: ['news-stats'],
    queryFn: fetchNewsStats,
  })

  const refreshMutation = useMutation({
    mutationFn: refreshNewsCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      queryClient.invalidateQueries({ queryKey: ['news-stats'] })
      setSuccessToast('News cache refreshed')
      setTimeout(() => setSuccessToast(''), 2500)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ url, updates }: { url: string; updates: any }) => updateNewsArticle(url, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      setEditingArticle(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteNewsArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      queryClient.invalidateQueries({ queryKey: ['news-stats'] })
    },
  })

  const createAlertMutation = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      setCreatingAlert(null)
      setSuccessToast('Alert created from article')
      setTimeout(() => setSuccessToast(''), 2500)
    },
  })

  const filteredArticles = useMemo(() => {
    if (!searchQuery) return articles
    const q = searchQuery.toLowerCase()
    return articles.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.text?.toLowerCase().includes(q) ||
        a.source_name?.toLowerCase().includes(q)
    )
  }, [articles, searchQuery])

  const tokens = stats?.byToken?.map((t: any) => t.token) || []

  function openAlertComposer(article: NewsArticle) {
    setCreatingAlert(article)
    setAlertForm({
      token: article.tickers[0]?.toUpperCase() || '',
      title: article.title.substring(0, 120),
      body: article.text || '',
      severity: article.sentiment === 'negative' ? 'warning' : 'info',
      tags: ['news'],
      deadline: defaultDeadline(7),
      source_url: article.article_url,
    })
    setAiReasoning('')
    setAiModel('')
  }

  async function handleGenerateAI() {
    if (!creatingAlert) return
    setAiLoading(true)
    try {
      const draft: AIGeneratedAlert = await generateAlertFromNews(creatingAlert)
      setAlertForm({
        token: draft.token || alertForm.token,
        title: draft.title || alertForm.title,
        body: draft.body || alertForm.body,
        severity: draft.severity || 'info',
        tags: draft.tags || ['news'],
        deadline: draft.deadline ? toLocalInput(new Date(draft.deadline)) : alertForm.deadline,
        source_url: draft.source_url || alertForm.source_url,
      })
      setAiModel(draft.model || '')
      setAiReasoning(draft.reasoning || '')
    } catch (err) {
      console.error(err)
    } finally {
      setAiLoading(false)
    }
  }

  function handleCreateAlertSubmit() {
    if (!alertForm.token || !alertForm.title) return
    createAlertMutation.mutate({
      token: alertForm.token.toUpperCase(),
      title: alertForm.title,
      body: alertForm.body,
      severity: alertForm.severity,
      tags: alertForm.tags,
      deadline: new Date(alertForm.deadline).toISOString(),
      source_url: alertForm.source_url,
    })
  }

  const sentimentClass = (s?: string | null) =>
    s === 'negative'
      ? 'badge-critical'
      : s === 'positive'
      ? 'badge-teal'
      : 'badge-soft'

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header + stats */}
      <div className="glass-card p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-blue-600 shadow-glow-teal">
              <Newspaper className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="section-title">News Triage</div>
              <h2 className="font-display text-2xl font-bold text-white">
                CoinDesk cache{stats ? ` (${stats.totalCached})` : ''}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="btn-ghost"
            >
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total cached" value={stats?.totalCached || 0} />
          <Stat label="Expiring ≤7d" value={stats?.expiringSoon || 0} accent="amber" />
          <Stat
            label="Avg age"
            value={stats?.avgAgeSeconds ? `${Math.round(stats.avgAgeSeconds / 86400)}d` : '0d'}
          />
          <Stat label="Unique tokens" value={stats?.byToken?.length || 0} />
        </div>

        {successToast && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
            <CheckCircle2 className="h-4 w-4" />
            {successToast}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="glass-card flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
            <Search className="h-4 w-4" />
          </span>
          <input
            className="input pl-10"
            placeholder="Search headline, body or source"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input md:w-48"
          value={selectedToken}
          onChange={(e) => setSelectedToken(e.target.value)}
        >
          <option value="">All tokens</option>
          {tokens.map((t: string) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Articles */}
      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-500">Loading news…</div>
      ) : filteredArticles.length === 0 ? (
        <div className="glass-card py-16 text-center">
          <Newspaper className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <div className="text-sm text-slate-400">No articles match your filter.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredArticles.map((a) => (
            <article
              key={a.article_url}
              className="glass-card flex flex-col gap-3 p-5 transition-all hover:border-teal-400/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="badge badge-soft">{a.source_name}</span>
                  {a.sentiment && (
                    <span className={`badge ${sentimentClass(a.sentiment)}`}>{a.sentiment}</span>
                  )}
                  {a.alert_created && (
                    <span className="badge badge-teal">
                      <CheckCircle2 className="h-3 w-3" /> Alerted
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <a
                    href={a.article_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-teal-300"
                    title="Open source"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    onClick={() => {
                      setEditingArticle(a)
                      setEditForm({
                        title: a.title,
                        text: a.text || '',
                        sentiment: a.sentiment || '',
                        tickers: a.tickers,
                      })
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-teal-300"
                    title="Edit"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this article?')) deleteMutation.mutate(a.article_url)
                    }}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <h3 className="line-clamp-2 text-base font-semibold leading-snug text-white">
                {a.title}
              </h3>
              {a.text && <p className="line-clamp-3 text-sm text-slate-400">{a.text}</p>}
              {a.tickers?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {a.tickers.slice(0, 6).map((t) => (
                    <span key={t} className="badge badge-teal text-[10px]">
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/5 pt-3">
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <Clock className="h-3 w-3" />
                  {a.date ? new Date(a.date).toLocaleString() : '—'}
                </div>
                <button onClick={() => openAlertComposer(a)} className="btn-primary px-3 py-1.5 text-xs">
                  <Bell className="h-3.5 w-3.5" />
                  Create alert
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Edit article modal */}
      {editingArticle && (
        <Modal title="Edit article" onClose={() => setEditingArticle(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Body</label>
              <textarea
                className="input h-32 resize-none"
                value={editForm.text}
                onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Sentiment</label>
                <select
                  className="input"
                  value={editForm.sentiment}
                  onChange={(e) =>
                    setEditForm({ ...editForm, sentiment: e.target.value as any })
                  }
                >
                  <option value="">—</option>
                  <option value="positive">positive</option>
                  <option value="neutral">neutral</option>
                  <option value="negative">negative</option>
                </select>
              </div>
              <div>
                <label className="label">Tickers (comma-separated)</label>
                <input
                  className="input"
                  value={editForm.tickers.join(', ')}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      tickers: e.target.value
                        .split(',')
                        .map((t) => t.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                className="btn-primary flex-1"
                onClick={() =>
                  updateMutation.mutate({
                    url: editingArticle.article_url,
                    updates: {
                      title: editForm.title,
                      text: editForm.text,
                      sentiment: editForm.sentiment || null,
                      tickers: editForm.tickers,
                    },
                  })
                }
              >
                <Save className="h-4 w-4" /> Save
              </button>
              <button className="btn-ghost" onClick={() => setEditingArticle(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create alert from article modal */}
      {creatingAlert && (
        <Modal title="Create alert from article" onClose={() => setCreatingAlert(null)}>
          <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Source article
            </div>
            <div className="text-sm font-semibold text-white">{creatingAlert.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
              <span>{creatingAlert.source_name}</span>
              <span>·</span>
              <a
                href={creatingAlert.article_url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-teal-300 hover:underline"
              >
                open <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerateAI}
            disabled={aiLoading}
            className="btn-primary mb-4 w-full"
          >
            {aiLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Drafting with AI…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> Auto-fill with AI
              </>
            )}
          </button>

          {aiModel && (
            <div className="mb-4 rounded-xl border border-teal-400/30 bg-teal-500/10 p-3 text-xs">
              <div className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-wider text-teal-300">
                <Sparkles className="h-3 w-3" /> {aiModel}
              </div>
              {aiReasoning && <p className="text-slate-300">{aiReasoning}</p>}
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Token</label>
                <input
                  className="input"
                  value={alertForm.token}
                  onChange={(e) =>
                    setAlertForm({ ...alertForm, token: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Severity</label>
                <select
                  className="input"
                  value={alertForm.severity}
                  onChange={(e) =>
                    setAlertForm({
                      ...alertForm,
                      severity: e.target.value as 'critical' | 'warning' | 'info',
                    })
                  }
                >
                  <option value="critical">critical</option>
                  <option value="warning">warning</option>
                  <option value="info">info</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={alertForm.title}
                onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Body</label>
              <textarea
                className="input h-28 resize-none"
                value={alertForm.body}
                onChange={(e) => setAlertForm({ ...alertForm, body: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Tags</label>
              <div className="flex flex-wrap gap-2">
                {VALID_TAGS.map((tag) => {
                  const active = alertForm.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() =>
                        setAlertForm({
                          ...alertForm,
                          tags: active
                            ? alertForm.tags.filter((t) => t !== tag)
                            : [...alertForm.tags, tag],
                        })
                      }
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="label">Deadline</label>
              <input
                type="datetime-local"
                className="input"
                value={alertForm.deadline}
                onChange={(e) => setAlertForm({ ...alertForm, deadline: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                className="btn-primary flex-1"
                disabled={createAlertMutation.isPending}
                onClick={handleCreateAlertSubmit}
              >
                {createAlertMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" /> Publish alert
                  </>
                )}
              </button>
              <button className="btn-ghost" onClick={() => setCreatingAlert(null)}>
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: React.ReactNode
  accent?: 'amber'
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={`mt-1 font-display text-2xl font-bold ${
          accent === 'amber' ? 'text-amber-300' : 'text-white'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm">
      <div className="glass-card-solid my-10 w-full max-w-2xl p-6 shadow-glow-soft">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
