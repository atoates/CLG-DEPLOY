import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import {
  Users,
  Bell,
  AlertTriangle,
  Newspaper,
  Sparkles,
  Database,
  Server,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Radio,
} from 'lucide-react'
import { api, fetchNewsStats } from '../lib/api'

type Alert = {
  id: string
  token: string
  title: string
  body?: string
  severity: 'critical' | 'warning' | 'info'
  tags?: string[]
  created_at: string
}

type ApiStat = {
  service_name: string
  endpoint: string
  call_count: number
  last_called_at: string | null
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#38bdf8',
}

export function Dashboard() {
  const { data: adminInfo } = useQuery({
    queryKey: ['admin-info'],
    queryFn: async () => (await api.get('/admin/info')).data,
  })

  const { data: alerts } = useQuery<Alert[]>({
    queryKey: ['alerts'],
    queryFn: async () => (await api.get('/api/alerts')).data,
  })

  const { data: newsStats } = useQuery({
    queryKey: ['news-stats'],
    queryFn: fetchNewsStats,
  })

  const { data: apiStats } = useQuery<ApiStat[]>({
    queryKey: ['api-stats'],
    queryFn: async () => (await api.get('/admin/api-stats')).data,
  })

  const totalAlerts = adminInfo?.counts?.alerts ?? alerts?.length ?? 0
  const totalUsers = adminInfo?.counts?.users ?? 0
  const criticalCount = alerts?.filter((a) => a.severity === 'critical').length ?? 0
  const warningCount = alerts?.filter((a) => a.severity === 'warning').length ?? 0
  const infoCount = alerts?.filter((a) => a.severity === 'info').length ?? 0

  // 14-day trend from created_at
  const trendData = useMemo(() => {
    if (!alerts) return []
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      days[key] = 0
    }
    for (const a of alerts) {
      if (!a.created_at) continue
      const key = new Date(a.created_at).toISOString().slice(0, 10)
      if (key in days) days[key] += 1
    }
    return Object.entries(days).map(([date, count]) => ({
      date: date.slice(5),
      alerts: count,
    }))
  }, [alerts])

  const severityData = [
    { name: 'Critical', value: criticalCount, color: SEVERITY_COLORS.critical },
    { name: 'Warning', value: warningCount, color: SEVERITY_COLORS.warning },
    { name: 'Info', value: infoCount, color: SEVERITY_COLORS.info },
  ].filter((s) => s.value > 0)

  const recentAlerts = useMemo(
    () =>
      (alerts || [])
        .slice()
        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
        .slice(0, 6),
    [alerts]
  )

  const topApiServices = useMemo(() => {
    if (!apiStats) return []
    const map: Record<string, number> = {}
    for (const s of apiStats) {
      map[s.service_name] = (map[s.service_name] || 0) + s.call_count
    }
    return Object.entries(map)
      .map(([service, calls]) => ({ service, calls }))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 5)
  }, [apiStats])

  const kpis = [
    {
      name: 'Total Alerts',
      value: totalAlerts,
      icon: Bell,
      accent: 'from-teal-400 to-teal-600',
      hint: `${recentAlerts.length} recent`,
    },
    {
      name: 'Critical Active',
      value: criticalCount,
      icon: AlertTriangle,
      accent: 'from-red-400 to-red-600',
      hint: criticalCount > 0 ? 'Action needed' : 'All clear',
    },
    {
      name: 'Active Users',
      value: totalUsers,
      icon: Users,
      accent: 'from-blue-400 to-blue-600',
      hint: 'Subscribed',
    },
    {
      name: 'News Cached',
      value: newsStats?.totalCached || 0,
      icon: Newspaper,
      accent: 'from-indigo-400 to-indigo-600',
      hint: `${newsStats?.byToken?.length || 0} tokens`,
    },
  ]

  return (
    <div className="space-y-8 animate-fade-up">
      {/* Quick actions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-br from-teal-500/10 via-white/[0.02] to-blue-500/10 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-teal-300">
            <Sparkles className="h-3 w-3" />
            AI-Powered
          </div>
          <h2 className="font-display text-2xl font-bold text-white">
            Welcome back. Ready to publish the next alert?
          </h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Use the composer to paste a tip, headline or article and get a ready-to-review draft in seconds.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/alerts" className="btn-primary">
            <Plus className="h-4 w-4" />
            New Alert
          </Link>
          <Link to="/news" className="btn-ghost">
            <Newspaper className="h-4 w-4" />
            Triage News
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.name} className="kpi-card">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {kpi.name}
                  </div>
                  <div className="mt-3 font-display text-4xl font-bold text-white">
                    {kpi.value.toLocaleString()}
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{kpi.hint}</div>
                </div>
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${kpi.accent} shadow-glow-teal`}
                >
                  <Icon className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trend + Severity donut */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="section-title">Alert Volume</div>
              <div className="mt-1 font-display text-xl font-bold text-white">Last 14 days</div>
            </div>
            <div className="flex items-center gap-2 text-xs text-teal-300">
              <TrendingUp className="h-4 w-4" />
              {trendData.reduce((sum, d) => sum + d.alerts, 0)} alerts published
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="alertGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="alerts"
                stroke="#5eead4"
                strokeWidth={2.5}
                fill="url(#alertGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4">
            <div className="section-title">Severity Mix</div>
            <div className="mt-1 font-display text-xl font-bold text-white">Current breakdown</div>
          </div>
          {severityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={severityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={52}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {severityData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
              No alerts yet
            </div>
          )}
          <div className="mt-3 space-y-2">
            {[
              { label: 'Critical', value: criticalCount, icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/15' },
              { label: 'Warning',  value: warningCount,  icon: AlertTriangle, color: 'text-amber-300', bg: 'bg-amber-500/15' },
              { label: 'Info',     value: infoCount,     icon: ShieldCheck, color: 'text-sky-300', bg: 'bg-sky-500/15' },
            ].map((row) => {
              const Icon = row.icon
              return (
                <div key={row.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`flex h-6 w-6 items-center justify-center rounded-md ${row.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${row.color}`} />
                    </span>
                    <span className="text-sm text-slate-300">{row.label}</span>
                  </div>
                  <span className="text-sm font-semibold text-white">{row.value}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Recent alerts + API usage */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="section-title">Activity</div>
              <div className="mt-1 font-display text-xl font-bold text-white">Recent alerts</div>
            </div>
            <Link
              to="/alerts"
              className="inline-flex items-center gap-1 text-sm font-semibold text-teal-300 hover:text-teal-200"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentAlerts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 py-12 text-center text-sm text-slate-500">
              No alerts yet. Head to the Alerts page to publish your first one.
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {recentAlerts.map((a) => {
                const sevClass =
                  a.severity === 'critical'
                    ? 'badge-critical'
                    : a.severity === 'warning'
                    ? 'badge-warning'
                    : 'badge-info'
                return (
                  <li key={a.id} className="flex items-start gap-4 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-[11px] font-bold uppercase tracking-wider text-teal-300">
                      {a.token?.slice(0, 4)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${sevClass}`}>{a.severity}</span>
                        <span className="truncate text-sm font-semibold text-white">{a.title}</span>
                      </div>
                      {a.body && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{a.body}</p>
                      )}
                      <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" />
                        {a.created_at ? new Date(a.created_at).toLocaleString() : 'just now'}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="glass-card p-6">
          <div className="mb-4">
            <div className="section-title">Integrations</div>
            <div className="mt-1 font-display text-xl font-bold text-white">API usage</div>
          </div>
          {topApiServices.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topApiServices} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="service" width={90} />
                <Tooltip />
                <Bar dataKey="calls" fill="#5eead4" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[220px] items-center justify-center text-sm text-slate-500">
              No call data yet
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-slate-500">Endpoints</div>
              <div className="mt-1 font-semibold text-white">{apiStats?.length || 0}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="text-slate-500">Total Calls</div>
              <div className="mt-1 font-semibold text-white">
                {(apiStats || []).reduce((s, x) => s + x.call_count, 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="section-title">Database</div>
              <div className="font-display text-base font-bold text-white">PostgreSQL</div>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <Row label="Alerts" value={adminInfo?.counts?.alerts || 0} />
            <Row label="Users" value={adminInfo?.counts?.users || 0} />
            <Row label="Preferences" value={adminInfo?.counts?.user_prefs || 0} />
          </dl>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="section-title">Server</div>
              <div className="font-display text-base font-bold text-white">Status</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-emerald-400" />
              <span className="text-emerald-300 font-semibold">Online</span>
            </div>
            <Row label="Market" value="CoinMarketCap" />
            <Row label="News" value="CoinDesk RSS" />
            <Row label="AI" value="OpenAI + Anthropic" />
          </div>
        </div>

        <div className="glass-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="section-title">News cache</div>
              <div className="font-display text-base font-bold text-white">Health</div>
            </div>
          </div>
          <div className="space-y-2 text-sm">
            <Row label="Cached" value={newsStats?.totalCached || 0} />
            <Row label="Expiring ≤7d" value={newsStats?.expiringSoon || 0} />
            <Row
              label="Avg age"
              value={
                newsStats?.avgAgeSeconds
                  ? `${Math.round(newsStats.avgAgeSeconds / 86400)}d`
                  : '0d'
              }
            />
            <Row label="Tokens" value={newsStats?.byToken?.length || 0} />
          </div>
          {newsStats?.byToken && newsStats.byToken.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {newsStats.byToken.slice(0, 6).map((t: any) => (
                <span key={t.token} className="badge badge-teal text-[10px]">
                  {t.token} · {t.count}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  )
}
