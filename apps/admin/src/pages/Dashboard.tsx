import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { fetchNewsStats } from '../lib/api'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts'
import { Users, Bell, AlertTriangle, Database, HardDrive, Server, Activity, Newspaper } from 'lucide-react'

export function Dashboard() {
  const { data: adminInfo } = useQuery({
    queryKey: ['admin-info'],
    queryFn: async () => {
      const { data } = await api.get('/admin/info')
      return data
    },
  })

  const { data: alerts } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      const { data } = await api.get('/api/alerts')
      return data
    },
  })

  const { data: newsStats } = useQuery({
    queryKey: ['news-stats'],
    queryFn: fetchNewsStats,
  })

  const stats = [
    {
      name: 'Total Alerts',
      value: adminInfo?.counts?.alerts || 0,
      icon: Bell,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      name: 'Active Users',
      value: adminInfo?.counts?.users || 0,
      icon: Users,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      name: 'Critical Alerts',
      value: alerts?.filter((a: any) => a.severity === 'critical').length || 0,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      name: 'News Articles',
      value: newsStats?.totalCached || 0,
      icon: Newspaper,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
  ]

  const severityData = [
    { name: 'Critical', value: alerts?.filter((a: any) => a.severity === 'critical').length || 0, color: '#ef4444' },
    { name: 'Warning', value: alerts?.filter((a: any) => a.severity === 'warning').length || 0, color: '#f59e0b' },
    { name: 'Info', value: alerts?.filter((a: any) => a.severity === 'info').length || 0, color: '#10b981' },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">Welcome to the Crypto Lifeguard Admin Dashboard</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.name} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.name}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Severity Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Alert Severity Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={severityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {severityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* System Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Information</h2>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Database</span>
              <span className="font-medium">{adminInfo?.counts ? 'PostgreSQL' : 'Not configured'}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Market Provider</span>
              <span className="font-medium">CoinMarketCap</span>
            </div>
            <div className="flex justify-between py-2 border-b border-gray-100">
              <span className="text-gray-600">Currency</span>
              <span className="font-medium">USD</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-600">News Source</span>
              <span className="font-medium">CoinDesk RSS</span>
            </div>
          </div>
        </div>
      </div>

      {/* News Cache Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Newspaper className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">News Cache Statistics</h2>
              <p className="text-sm text-gray-500">Articles cached from CoinDesk</p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Total Cached</p>
            <p className="text-2xl font-bold text-gray-900">{newsStats?.totalCached || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Expiring Soon (7d)</p>
            <p className="text-2xl font-bold text-orange-600">{newsStats?.expiringSoon || 0}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Average Age</p>
            <p className="text-2xl font-bold text-gray-900">
              {newsStats?.avgAgeSeconds ? Math.round(newsStats.avgAgeSeconds / 86400) : 0}d
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Unique Tokens</p>
            <p className="text-2xl font-bold text-gray-900">{newsStats?.byToken?.length || 0}</p>
          </div>
        </div>
        {newsStats?.byToken && newsStats.byToken.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Top Tokens in News</p>
            <div className="flex flex-wrap gap-2">
              {newsStats.byToken.slice(0, 10).map((item) => (
                <span
                  key={item.token}
                  className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-medium rounded-full"
                >
                  {item.token}: {item.count}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Database Details Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Database Storage */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Database Storage</h3>
              <p className="text-sm text-gray-500">PostgreSQL on Railway</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total Records</span>
              <span className="font-medium text-gray-900">
                {(adminInfo?.counts?.alerts || 0) + (adminInfo?.counts?.users || 0) + (adminInfo?.counts?.user_prefs || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Alerts</span>
              <span className="font-medium text-gray-900">{adminInfo?.counts?.alerts || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Users</span>
              <span className="font-medium text-gray-900">{adminInfo?.counts?.users || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Preferences</span>
              <span className="font-medium text-gray-900">{adminInfo?.counts?.user_prefs || 0}</span>
            </div>
          </div>
        </div>

        {/* Data Directory */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-green-50 p-3 rounded-lg">
              <HardDrive className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Data Directory</h3>
              <p className="text-sm text-gray-500">File storage location</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <span className="text-xs text-gray-500 block mb-1">Path</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded block overflow-x-auto">
                {adminInfo?.dataDir || '/app/data'}
              </code>
            </div>
            <div>
              <span className="text-xs text-gray-500 block mb-1">Backup Directory</span>
              <code className="text-xs bg-gray-100 px-2 py-1 rounded block overflow-x-auto">
                {adminInfo?.backupDir || '/app/data/backups'}
              </code>
            </div>
          </div>
        </div>

        {/* Server Status */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-50 p-3 rounded-lg">
              <Server className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Server Status</h3>
              <p className="text-sm text-gray-500">Backend health</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-600">Online</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Database</span>
              <span className="font-medium text-green-600">
                {adminInfo?.counts ? 'Connected' : 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">API Provider</span>
              <span className="font-medium text-green-600">
                {adminInfo?.counts ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
