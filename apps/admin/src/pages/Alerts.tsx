import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  Search,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Info,
  AlertCircle,
  X,
  Upload,
  Sparkles,
  Wand2,
  Send,
  Clock,
  Tag as TagIcon,
  Link as LinkIcon,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  RefreshCw,
} from 'lucide-react'
import { api, draftAlert } from '../lib/api'

interface Alert {
  id: string
  token: string
  title: string
  description: string
  severity: 'info' | 'warning' | 'critical'
  deadline: string
  tags?: string[]
  further_info?: string
  source_type?: string
  source_url?: string
  created_at?: string
}

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

const SOURCE_TYPES = [
  'anonymous',
  'mainstream-media',
  'trusted-source',
  'social-media',
  'dev-team',
] as const

const SEVERITIES: Array<'critical' | 'warning' | 'info'> = ['critical', 'warning', 'info']

type ComposerState = {
  token: string
  title: string
  description: string
  severity: 'critical' | 'warning' | 'info'
  tags: string[]
  deadline: string
  source_type: string
  source_url: string
  further_info: string
}

const emptyComposer = (): ComposerState => ({
  token: '',
  title: '',
  description: '',
  severity: 'info',
  tags: [],
  deadline: defaultDeadline(7),
  source_type: '',
  source_url: '',
  further_info: '',
})

function defaultDeadline(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(23, 59, 0, 0)
  return toLocalInput(d)
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function Alerts() {
  const queryClient = useQueryClient()

  // composer
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiModel, setAiModel] = useState<string>('')
  const [aiError, setAiError] = useState('')
  const [aiReasoning, setAiReasoning] = useState('')
  const [composer, setComposer] = useState<ComposerState>(emptyComposer())
  const [publishSuccess, setPublishSuccess] = useState(false)

  // feed
  const [searchTerm, setSearchTerm] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null)
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')

  const { data: alerts, isLoading } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => (await api.get('/api/alerts')).data,
  })

  const createAlertMutation = useMutation({
    mutationFn: async (payload: ComposerState) => {
      const body = {
        token: payload.token.toUpperCase(),
        title: payload.title,
        description: payload.description,
        severity: payload.severity,
        tags: payload.tags,
        deadline: new Date(payload.deadline).toISOString(),
        source_type: payload.source_type || undefined,
        source_url: payload.source_url || undefined,
        further_info: payload.further_info || undefined,
      }
      const { data } = await api.post('/api/alerts', body)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setPublishSuccess(true)
      setComposer(emptyComposer())
      setAiInput('')
      setAiReasoning('')
      setAiModel('')
      setTimeout(() => setPublishSuccess(false), 2600)
    },
  })

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/alerts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })

  const updateAlertMutation = useMutation({
    mutationFn: async (alert: Alert) => api.put(`/api/alerts/${alert.id}`, alert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setEditingAlert(null)
    },
  })

  const bulkUploadMutation = useMutation({
    mutationFn: async (list: Partial<Alert>[]) => (await api.post('/api/alerts/bulk', { alerts: list })).data,
    onSuccess: (data: any) => {
      setUploadStatus('success')
      setUploadMessage(`Imported ${data.imported || 0} alerts`)
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setTimeout(() => {
        setIsUploadOpen(false)
        setUploadStatus('idle')
        setUploadFile(null)
      }, 2500)
    },
    onError: (err: any) => {
      setUploadStatus('error')
      setUploadMessage(err.response?.data?.error || 'Failed to import')
    },
  })

  async function handleAiDraft() {
    if (aiInput.trim().length < 8) {
      setAiError('Enter a bit more context (headline, tweet, article, tip).')
      return
    }
    setAiError('')
    setAiLoading(true)
    try {
      const { draft, model } = await draftAlert({
        text: aiInput.trim(),
        hint_token: composer.token || undefined,
        source_url: composer.source_url || undefined,
      })
      setComposer((prev) => ({
        token: draft.token || prev.token || '',
        title: draft.title || prev.title,
        description: draft.body || prev.description,
        severity: draft.severity || 'info',
        tags: draft.tags || [],
        deadline: draft.deadline ? toLocalInput(new Date(draft.deadline)) : prev.deadline || defaultDeadline(7),
        source_type: draft.source_type || prev.source_type || '',
        source_url: draft.source_url || prev.source_url || '',
        further_info: prev.further_info,
      }))
      setAiModel(model || '')
      setAiReasoning(draft.reasoning || '')
    } catch (e: any) {
      setAiError(e.response?.data?.error || e.message || 'AI drafting failed')
    } finally {
      setAiLoading(false)
    }
  }

  function handlePublish(e: React.FormEvent) {
    e.preventDefault()
    if (!composer.token || !composer.title || !composer.deadline) return
    createAlertMutation.mutate(composer)
  }

  const filteredAlerts = useMemo(() => {
    if (!alerts) return []
    const term = searchTerm.trim().toLowerCase()
    return alerts
      .filter((a) => {
        const matchSearch =
          !term ||
          a.title?.toLowerCase().includes(term) ||
          a.token?.toLowerCase().includes(term) ||
          a.description?.toLowerCase().includes(term)
        const matchSev = severityFilter === 'all' || a.severity === severityFilter
        return matchSearch && matchSev
      })
      .sort((a, b) =>
        (b.created_at || b.deadline || '').localeCompare(a.created_at || a.deadline || '')
      )
  }, [alerts, searchTerm, severityFilter])

  const sevIcon = (s: string) =>
    s === 'critical' ? (
      <ShieldAlert className="h-3.5 w-3.5" />
    ) : s === 'warning' ? (
      <AlertTriangle className="h-3.5 w-3.5" />
    ) : (
      <Info className="h-3.5 w-3.5" />
    )

  const sevClass = (s: string) =>
    s === 'critical' ? 'badge-critical' : s === 'warning' ? 'badge-warning' : 'badge-info'

  // file upload handler
  async function handleUpload() {
    if (!uploadFile) return
    setUploadStatus('uploading')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        let list: Partial<Alert>[] = []
        if (uploadFile.name.endsWith('.json')) {
          list = JSON.parse(text)
        } else if (uploadFile.name.endsWith('.csv')) {
          const lines = text.split('\n').filter((l) => l.trim())
          const headers = lines[0].split(',').map((h) => h.trim())
          list = lines.slice(1).map((line) => {
            const values = line.split(',').map((v) => v.trim())
            const obj: any = {}
            headers.forEach((h, i) => (obj[h] = values[i]))
            return obj
          })
        } else {
          setUploadStatus('error')
          setUploadMessage('Use JSON or CSV')
          return
        }
        bulkUploadMutation.mutate(list)
      } catch {
        setUploadStatus('error')
        setUploadMessage('Failed to parse file')
      }
    }
    reader.readAsText(uploadFile)
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* =============== COMPOSER =============== */}
      <section className="glass-card p-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-glow-teal">
              <Wand2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="section-title">Composer</div>
              <h2 className="font-display text-2xl font-bold text-white">Draft a new alert</h2>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setIsUploadOpen(true)}>
              <Upload className="h-4 w-4" /> Bulk import
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                setComposer(emptyComposer())
                setAiInput('')
                setAiReasoning('')
                setAiModel('')
                setAiError('')
              }}
            >
              <RefreshCw className="h-4 w-4" /> Reset
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.05fr,1fr]">
          {/* AI assist pane */}
          <div className="rounded-2xl border border-teal-400/20 bg-teal-500/[0.06] p-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-300">
              <Sparkles className="h-3.5 w-3.5" />
              AI Assist
            </div>
            <p className="mb-3 text-sm text-slate-300">
              Paste a headline, tweet, tip or full article and let the AI fill out the form.
            </p>
            <textarea
              className="input h-40 resize-none font-mono text-sm leading-relaxed"
              placeholder={`e.g. "CoinDesk: Major DEX exploited for $40m overnight, team has paused withdrawals. Attacker address has been flagged by Chainalysis..."`}
              value={aiInput}
              onChange={(e) => {
                setAiInput(e.target.value)
                setAiError('')
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAiDraft}
                disabled={aiLoading || aiInput.trim().length < 8}
                className="btn-primary"
              >
                {aiLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Drafting…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" /> Draft with AI
                  </>
                )}
              </button>
              <span className="text-xs text-slate-400">
                Severity, tags, token and deadline will be auto-populated.
              </span>
            </div>
            {aiError && <p className="mt-2 text-sm text-red-400">{aiError}</p>}
            {aiModel && (
              <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
                <div className="mb-1 flex items-center gap-2 font-semibold uppercase tracking-wider text-teal-300">
                  <Sparkles className="h-3 w-3" /> {aiModel}
                </div>
                {aiReasoning && <p className="text-slate-400">{aiReasoning}</p>}
              </div>
            )}

            <div className="mt-5 border-t border-white/10 pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Quick starters
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  'Major exchange reports unauthorised withdrawals from a hot wallet',
                  'Ethereum-based DeFi protocol announces 30% token unlock tomorrow',
                  'SEC files enforcement action against Layer-2 foundation',
                  'Stablecoin briefly depegs on Asian markets overnight',
                ].map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setAiInput(q)}
                    className="chip text-left"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Structured form */}
          <form onSubmit={handlePublish} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label className="label">Token</label>
                <input
                  className="input"
                  placeholder="BTC"
                  value={composer.token}
                  onChange={(e) => setComposer({ ...composer, token: e.target.value.toUpperCase() })}
                  maxLength={8}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Severity</label>
                <div className="flex gap-2">
                  {SEVERITIES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setComposer({ ...composer, severity: s })}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold capitalize transition-all ${
                        composer.severity === s
                          ? s === 'critical'
                            ? 'border-red-400/60 bg-red-500/20 text-red-200'
                            : s === 'warning'
                            ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                            : 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white'
                      }`}
                    >
                      {sevIcon(s)} {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="label">Title</label>
              <input
                className="input"
                placeholder="Short, punchy alert headline"
                value={composer.title}
                onChange={(e) => setComposer({ ...composer, title: e.target.value })}
                maxLength={120}
                required
              />
              <div className="mt-1 text-[11px] text-slate-500">{composer.title.length}/120</div>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input h-24 resize-none"
                placeholder="2–3 sentences — what happened, why it matters, what users should do."
                value={composer.description}
                onChange={(e) => setComposer({ ...composer, description: e.target.value })}
                maxLength={1200}
              />
              <div className="mt-1 text-[11px] text-slate-500">{composer.description.length}/1200</div>
            </div>

            <div>
              <label className="label">Tags</label>
              <div className="flex flex-wrap gap-2">
                {VALID_TAGS.map((tag) => {
                  const active = composer.tags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() =>
                        setComposer({
                          ...composer,
                          tags: active
                            ? composer.tags.filter((t) => t !== tag)
                            : [...composer.tags, tag],
                        })
                      }
                    >
                      <TagIcon className="h-3 w-3" />
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Deadline</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={composer.deadline}
                  onChange={(e) => setComposer({ ...composer, deadline: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Source type</label>
                <select
                  className="input"
                  value={composer.source_type}
                  onChange={(e) => setComposer({ ...composer, source_type: e.target.value })}
                >
                  <option value="">—</option>
                  {SOURCE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Source URL</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                  <LinkIcon className="h-4 w-4" />
                </span>
                <input
                  className="input pl-10"
                  placeholder="https://…"
                  value={composer.source_url}
                  onChange={(e) => setComposer({ ...composer, source_url: e.target.value })}
                />
              </div>
            </div>

            {publishSuccess && (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                Alert published. Users are already seeing it.
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                className="btn-primary flex-1"
                disabled={!composer.token || !composer.title || createAlertMutation.isPending}
              >
                {createAlertMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Publishing…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Publish alert
                  </>
                )}
              </button>
              {aiInput && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(composer, null, 2))}
                  className="btn-ghost"
                >
                  <Copy className="h-4 w-4" /> Copy JSON
                </button>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* =============== FEED =============== */}
      <section className="glass-card p-6">
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-teal-300">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="section-title">Feed</div>
              <h3 className="font-display text-xl font-bold text-white">
                Published alerts{alerts ? ` (${alerts.length})` : ''}
              </h3>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2 md:max-w-xl md:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
                <Search className="h-4 w-4" />
              </span>
              <input
                className="input pl-10"
                placeholder="Search by token, title or description"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input md:w-40"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All severities</option>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-500">Loading alerts…</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 py-12 text-center">
            <Plus className="mx-auto mb-3 h-8 w-8 text-slate-500" />
            <div className="text-sm text-slate-400">No alerts found. Use the composer above to publish one.</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredAlerts.map((a) => (
              <article
                key={a.id}
                className="glass-card-solid flex flex-col gap-3 p-4 transition-all hover:border-teal-400/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 text-[11px] font-bold uppercase tracking-wider text-teal-300">
                      {a.token?.slice(0, 4)}
                    </span>
                    <span className={`badge ${sevClass(a.severity)}`}>
                      {sevIcon(a.severity)} {a.severity}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingAlert(a)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-teal-300"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${a.title}"?`)) deleteAlertMutation.mutate(a.id)
                      }}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <h4 className="line-clamp-2 text-sm font-semibold text-white">{a.title}</h4>
                {a.description && (
                  <p className="line-clamp-3 text-xs text-slate-400">{a.description}</p>
                )}
                {a.tags && a.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {a.tags.slice(0, 4).map((t) => (
                      <span key={t} className="badge badge-soft text-[10px]">
                        {t}
                      </span>
                    ))}
                    {a.tags.length > 4 && (
                      <span className="text-[10px] text-slate-500">+{a.tags.length - 4}</span>
                    )}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-1 border-t border-white/5 pt-2 text-[10px] text-slate-500">
                  <Clock className="h-3 w-3" />
                  {a.deadline ? new Date(a.deadline).toLocaleString() : '—'}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* =============== EDIT MODAL =============== */}
      {editingAlert && (
        <Modal onClose={() => setEditingAlert(null)} title="Edit alert">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              updateAlertMutation.mutate(editingAlert)
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="label">Token</label>
                <input
                  className="input"
                  value={editingAlert.token}
                  onChange={(e) =>
                    setEditingAlert({ ...editingAlert, token: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Severity</label>
                <select
                  className="input"
                  value={editingAlert.severity}
                  onChange={(e) =>
                    setEditingAlert({
                      ...editingAlert,
                      severity: e.target.value as 'critical' | 'warning' | 'info',
                    })
                  }
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Title</label>
              <input
                className="input"
                value={editingAlert.title}
                onChange={(e) => setEditingAlert({ ...editingAlert, title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input h-28 resize-none"
                value={editingAlert.description}
                onChange={(e) =>
                  setEditingAlert({ ...editingAlert, description: e.target.value })
                }
              />
            </div>
            <div>
              <label className="label">Tags</label>
              <div className="flex flex-wrap gap-2">
                {VALID_TAGS.map((tag) => {
                  const active = editingAlert.tags?.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`chip ${active ? 'chip-active' : ''}`}
                      onClick={() =>
                        setEditingAlert({
                          ...editingAlert,
                          tags: active
                            ? (editingAlert.tags || []).filter((t) => t !== tag)
                            : [...(editingAlert.tags || []), tag],
                        })
                      }
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Deadline</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={toLocalInput(new Date(editingAlert.deadline))}
                  onChange={(e) =>
                    setEditingAlert({
                      ...editingAlert,
                      deadline: new Date(e.target.value).toISOString(),
                    })
                  }
                />
              </div>
              <div>
                <label className="label">Source type</label>
                <select
                  className="input"
                  value={editingAlert.source_type || ''}
                  onChange={(e) =>
                    setEditingAlert({ ...editingAlert, source_type: e.target.value })
                  }
                >
                  <option value="">—</option>
                  {SOURCE_TYPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">Source URL</label>
              <input
                className="input"
                value={editingAlert.source_url || ''}
                onChange={(e) => setEditingAlert({ ...editingAlert, source_url: e.target.value })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary flex-1">
                <Check className="h-4 w-4" /> Save changes
              </button>
              <button type="button" onClick={() => setEditingAlert(null)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* =============== BULK UPLOAD MODAL =============== */}
      {isUploadOpen && (
        <Modal onClose={() => setIsUploadOpen(false)} title="Bulk import alerts">
          <div className="space-y-4 text-sm text-slate-300">
            <p>Upload a JSON array or a CSV file with columns matching the alert schema.</p>
            <input
              type="file"
              accept=".json,.csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="input"
            />
            {uploadStatus === 'success' && (
              <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-emerald-200">
                {uploadMessage}
              </div>
            )}
            {uploadStatus === 'error' && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-3 text-red-200">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                {uploadMessage}
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploadStatus === 'uploading'}
                className="btn-primary flex-1"
              >
                {uploadStatus === 'uploading' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" /> Upload
                  </>
                )}
              </button>
              <button onClick={() => setIsUploadOpen(false)} className="btn-ghost">
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
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
