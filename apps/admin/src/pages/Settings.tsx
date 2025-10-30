import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Database, Download, Upload, Clock, FileText, AlertCircle, CheckCircle, Rss, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'

interface BackupFile {
  file: string
  path: string
  size: number
  mtime: number
}

interface NewsFeed {
  id: number
  name: string
  url: string
  feed_type: string
  enabled: boolean
  created_at: string
  last_fetched_at: string | null
  article_count: number
}

export function Settings() {
  const [backupStatus, setBackupStatus] = useState<'idle' | 'creating' | 'success' | 'error'>('idle')
  const [backupMessage, setBackupMessage] = useState('')
  const [showAddFeed, setShowAddFeed] = useState(false)
  const [newFeedName, setNewFeedName] = useState('')
  const [newFeedUrl, setNewFeedUrl] = useState('')
  const queryClient = useQueryClient()

  const { data: backupsData, isLoading } = useQuery({
    queryKey: ['backups'],
    queryFn: async () => {
      const { data } = await api.get('/admin/backups')
      return data as { ok: boolean; files: BackupFile[] }
    },
  })

  const { data: feedsData, isLoading: feedsLoading } = useQuery({
    queryKey: ['news-feeds'],
    queryFn: async () => {
      const { data } = await api.get('/admin/news/feeds')
      return data as NewsFeed[]
    },
  })

  const createBackupMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/backup')
      return data
    },
    onSuccess: (data) => {
      setBackupStatus('success')
      setBackupMessage(data.message || 'Backup created successfully')
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      setTimeout(() => setBackupStatus('idle'), 5000)
    },
    onError: (error: any) => {
      setBackupStatus('error')
      setBackupMessage(error.response?.data?.error || 'Failed to create backup')
      setTimeout(() => setBackupStatus('idle'), 5000)
    },
  })

  const addFeedMutation = useMutation({
    mutationFn: async ({ name, url }: { name: string; url: string }) => {
      const { data } = await api.post('/admin/news/feeds', { name, url })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-feeds'] })
      setShowAddFeed(false)
      setNewFeedName('')
      setNewFeedUrl('')
    },
  })

  const toggleFeedMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const { data } = await api.put(`/admin/news/feeds/${id}`, { enabled })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-feeds'] })
    },
  })

  const deleteFeedMutation = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/admin/news/feeds/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-feeds'] })
    },
  })

  const handleCreateBackup = () => {
    setBackupStatus('creating')
    createBackupMutation.mutate()
  }

  const handleDownloadBackup = (filename: string) => {
    window.open(`${import.meta.env.VITE_API_URL}/admin/backups/${filename}`, '_blank')
  }

  const handleAddFeed = () => {
    if (!newFeedName.trim() || !newFeedUrl.trim()) return
    addFeedMutation.mutate({ name: newFeedName, url: newFeedUrl })
  }

  const handleToggleFeed = (id: number, currentEnabled: boolean) => {
    toggleFeedMutation.mutate({ id, enabled: !currentEnabled })
  }

  const handleDeleteFeed = (id: number) => {
    if (confirm('Are you sure you want to delete this feed?')) {
      deleteFeedMutation.mutate(id)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const backups = backupsData?.files || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings & Backups</h1>
        <p className="text-gray-600 mt-2">
          Manage system settings and database backups
        </p>
      </div>

      {/* Backup Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-3 rounded-lg">
              <Database className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Database Backups</h2>
              <p className="text-sm text-gray-600">Create and manage PostgreSQL backups</p>
            </div>
          </div>
          <button
            onClick={handleCreateBackup}
            disabled={backupStatus === 'creating'}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition"
          >
            <Upload className="w-5 h-5" />
            {backupStatus === 'creating' ? 'Creating...' : 'Create Backup'}
          </button>
        </div>

        {/* Status Message */}
        {backupStatus !== 'idle' && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
            backupStatus === 'success' ? 'bg-green-50 text-green-800' :
            backupStatus === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            {backupStatus === 'success' && <CheckCircle className="w-5 h-5" />}
            {backupStatus === 'error' && <AlertCircle className="w-5 h-5" />}
            {backupStatus === 'creating' && (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="font-medium">{backupMessage || 'Processing...'}</span>
          </div>
        )}

        {/* Backup Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">PostgreSQL Backup Information</p>
              <p className="text-blue-800">
                Railway provides automatic point-in-time recovery for PostgreSQL databases. 
                Manual backups can be created using <code className="bg-blue-100 px-1 rounded">pg_dump</code>.
                Contact support for restoration assistance.
              </p>
            </div>
          </div>
        </div>

        {/* Backups List */}
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Backups</h3>
          
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading backups...</div>
          ) : backups.length > 0 ? (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.file}
                  className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
                >
                  <div className="flex items-center gap-4">
                    <FileText className="w-8 h-8 text-gray-400" />
                    <div>
                      <div className="font-medium text-gray-900">{backup.file}</div>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatDate(backup.mtime)}
                        </span>
                        <span>{formatBytes(backup.size)}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownloadBackup(backup.file)}
                    className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium px-4 py-2 hover:bg-white rounded-lg transition"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No backup files found. Create your first backup to get started.
            </div>
          )}
        </div>
      </div>

      {/* System Settings */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">System Settings</h2>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-3 border-b border-gray-100">
            <div>
              <div className="font-medium text-gray-900">Database Connection</div>
              <div className="text-sm text-gray-600">PostgreSQL connection status</div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              Connected
            </span>
          </div>
          <div className="flex justify-between items-center py-3 border-b border-gray-100">
            <div>
              <div className="font-medium text-gray-900">Auto Backup</div>
              <div className="text-sm text-gray-600">Automatic database backups</div>
            </div>
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
              Railway Managed
            </span>
          </div>
          <div className="flex justify-between items-center py-3">
            <div>
              <div className="font-medium text-gray-900">Point-in-Time Recovery</div>
              <div className="text-sm text-gray-600">Restore to any point in the last 7 days</div>
            </div>
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              Available
            </span>
          </div>
        </div>
      </div>

      {/* News Feeds Management */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 p-3 rounded-lg">
              <Rss className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">News Feeds</h2>
              <p className="text-sm text-gray-600">Manage RSS feeds for news collection</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddFeed(!showAddFeed)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            Add Feed
          </button>
        </div>

        {/* Add Feed Form */}
        {showAddFeed && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Add New Feed</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Feed Name</label>
                <input
                  type="text"
                  value={newFeedName}
                  onChange={(e) => setNewFeedName(e.target.value)}
                  placeholder="e.g., CoinTelegraph"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">RSS Feed URL</label>
                <input
                  type="url"
                  value={newFeedUrl}
                  onChange={(e) => setNewFeedUrl(e.target.value)}
                  placeholder="https://example.com/rss"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddFeed}
                  disabled={!newFeedName.trim() || !newFeedUrl.trim()}
                  className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition"
                >
                  Add Feed
                </button>
                <button
                  onClick={() => {
                    setShowAddFeed(false)
                    setNewFeedName('')
                    setNewFeedUrl('')
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Feeds List */}
        {feedsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading feeds...</div>
        ) : feedsData && feedsData.length > 0 ? (
          <div className="space-y-2">
            {feedsData.map((feed) => (
              <div
                key={feed.id}
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-lg transition"
              >
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{feed.name}</div>
                  <div className="text-sm text-gray-600 mt-1">{feed.url}</div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                    <span>{feed.article_count} articles</span>
                    {feed.last_fetched_at && (
                      <span>Last fetched: {new Date(feed.last_fetched_at).toLocaleString()}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleFeed(feed.id, feed.enabled)}
                    className={`p-2 rounded-lg transition ${
                      feed.enabled 
                        ? 'bg-green-100 text-green-600 hover:bg-green-200' 
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                    }`}
                    title={feed.enabled ? 'Disable feed' : 'Enable feed'}
                  >
                    {feed.enabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => handleDeleteFeed(feed.id)}
                    className="p-2 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition"
                    title="Delete feed"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No feeds configured. Add your first RSS feed to get started.
          </div>
        )}
      </div>
    </div>
  )
}
