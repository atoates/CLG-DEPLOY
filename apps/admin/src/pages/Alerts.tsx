import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Bell, Search, Filter, Plus, Pencil, Trash2, AlertTriangle, Info, AlertCircle, X, Upload, Download, FileText, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'

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
}

export function Alerts() {
  const [searchTerm, setSearchTerm] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null)
  const [editingAlert, setEditingAlert] = useState<Alert | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [uploadMessage, setUploadMessage] = useState('')
  const queryClient = useQueryClient()

  const { data: alerts, isLoading, error } = useQuery({
    queryKey: ['alerts'],
    queryFn: async () => {
      console.log('Fetching alerts from:', import.meta.env.VITE_API_URL || 'http://localhost:3000')
      const { data } = await api.get('/api/alerts')
      console.log('Alerts response:', data)
      return data as Alert[]
    },
  })

  // Log any errors
  if (error) {
    console.error('Error fetching alerts:', error)
  }

  const deleteAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      await api.delete(`/api/alerts/${alertId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    },
  })

  const updateAlertMutation = useMutation({
    mutationFn: async (alert: Alert) => {
      await api.put(`/api/alerts/${alert.id}`, alert)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setIsEditModalOpen(false)
      setEditingAlert(null)
    },
  })

  const bulkUploadMutation = useMutation({
    mutationFn: async (alerts: Partial<Alert>[]) => {
      const { data } = await api.post('/api/alerts/bulk', { alerts })
      return data
    },
    onSuccess: (data) => {
      setUploadStatus('success')
      setUploadMessage(`Successfully imported ${data.imported} alerts`)
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      setTimeout(() => {
        setIsUploadModalOpen(false)
        setUploadStatus('idle')
        setUploadFile(null)
      }, 3000)
    },
    onError: (error: any) => {
      setUploadStatus('error')
      setUploadMessage(error.response?.data?.error || 'Failed to upload alerts')
    },
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFile(file)
      setUploadStatus('idle')
    }
  }

  const handleUpload = async () => {
    if (!uploadFile) return

    setUploadStatus('uploading')
    const reader = new FileReader()

    reader.onload = async (e) => {
      try {
        const text = e.target?.result as string
        let alerts: Partial<Alert>[]

        if (uploadFile.name.endsWith('.json')) {
          alerts = JSON.parse(text)
        } else if (uploadFile.name.endsWith('.csv')) {
          // Simple CSV parser (assumes header row)
          const lines = text.split('\n').filter(line => line.trim())
          const headers = lines[0].split(',').map(h => h.trim())
          alerts = lines.slice(1).map(line => {
            const values = line.split(',').map(v => v.trim())
            const alert: any = {}
            headers.forEach((header, i) => {
              alert[header] = values[i]
            })
            return alert
          })
        } else {
          setUploadStatus('error')
          setUploadMessage('Invalid file format. Use JSON or CSV.')
          return
        }

        bulkUploadMutation.mutate(alerts)
      } catch (error) {
        setUploadStatus('error')
        setUploadMessage('Failed to parse file')
      }
    }

    reader.readAsText(uploadFile)
  }

  const handleExportCSV = () => {
    window.open(`${import.meta.env.VITE_API_URL}/admin/export/alerts.csv`, '_blank')
  }

  const handleEditClick = (alert: Alert) => {
    setEditingAlert(alert)
    setIsEditModalOpen(true)
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (editingAlert) {
      updateAlertMutation.mutate(editingAlert)
    }
  }

  const filteredAlerts = alerts?.filter((alert) => {
    const matchesSearch = 
      alert.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.token.toLowerCase().includes(searchTerm.toLowerCase()) ||
      alert.description.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesSeverity = severityFilter === 'all' || alert.severity === severityFilter
    
    return matchesSearch && matchesSeverity
  })

  // Sort alerts by deadline if sort order is set
  const sortedAlerts = filteredAlerts ? [...filteredAlerts].sort((a, b) => {
    if (!sortOrder) return 0
    
    const dateA = a.deadline ? new Date(a.deadline).getTime() : 0
    const dateB = b.deadline ? new Date(b.deadline).getTime() : 0
    
    if (sortOrder === 'asc') {
      return dateA - dateB
    } else {
      return dateB - dateA
    }
  }) : filteredAlerts

  const handleSortToggle = () => {
    if (sortOrder === null) {
      setSortOrder('desc') // First click: newest first
    } else if (sortOrder === 'desc') {
      setSortOrder('asc') // Second click: oldest first
    } else {
      setSortOrder(null) // Third click: reset to default
    }
  }

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertTriangle className="w-5 h-5 text-red-600" />
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />
      case 'info':
        return <Info className="w-5 h-5 text-blue-600" />
      default:
        return <Bell className="w-5 h-5 text-gray-600" />
    }
  }

  const getSeverityBadge = (severity: string) => {
    const styles = {
      critical: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
      info: 'bg-blue-100 text-blue-800',
    }
    return styles[severity as keyof typeof styles] || 'bg-gray-100 text-gray-800'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Alerts Management</h1>
          <p className="text-gray-600 mt-2">
            Manage security alerts and notifications for all tokens
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg border border-gray-300 transition"
          >
            <Upload className="w-5 h-5" />
            Bulk Upload
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg border border-gray-300 transition"
          >
            <Download className="w-5 h-5" />
            Export CSV
          </button>
          <button
            onClick={() => alert('Create alert functionality coming soon!')}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            Create Alert
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search alerts by title, token, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          {/* Severity Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none appearance-none"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-600">
          <span>Total: {alerts?.length || 0}</span>
          <span>Critical: {alerts?.filter(a => a.severity === 'critical').length || 0}</span>
          <span>Warning: {alerts?.filter(a => a.severity === 'warning').length || 0}</span>
          <span>Info: {alerts?.filter(a => a.severity === 'info').length || 0}</span>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <div className="text-red-600 font-medium">Error loading alerts</div>
            <div className="text-sm text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Check the browser console for more details
            </div>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center">
            <div className="text-gray-500">Loading alerts...</div>
            <div className="text-xs text-gray-400 mt-2">
              API: {import.meta.env.VITE_API_URL || 'http://localhost:3000'}
            </div>
          </div>
        ) : sortedAlerts && sortedAlerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Severity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Token
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <button
                      onClick={handleSortToggle}
                      className="flex items-center gap-1 hover:text-gray-700 transition"
                    >
                      Created
                      {sortOrder === 'asc' && <ArrowUp className="w-4 h-4" />}
                      {sortOrder === 'desc' && <ArrowDown className="w-4 h-4" />}
                      {sortOrder === null && <ArrowUpDown className="w-4 h-4 opacity-50" />}
                    </button>
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sortedAlerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getSeverityIcon(alert.severity)}
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityBadge(alert.severity)}`}>
                          {alert.severity}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{alert.token}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 max-w-xs">{alert.title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-600 max-w-md line-clamp-2">
                        {alert.description}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {alert.deadline ? new Date(alert.deadline).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      }) : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditClick(alert)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this alert?')) {
                              deleteAlertMutation.mutate(alert.id)
                            }
                          }}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || severityFilter !== 'all' 
              ? 'No alerts match your filters' 
              : 'No alerts found. Create your first alert to get started.'}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Edit Alert</h2>
              <button
                onClick={() => {
                  setIsEditModalOpen(false)
                  setEditingAlert(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              {/* Token */}
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                  Token Symbol
                </label>
                <input
                  id="token"
                  type="text"
                  value={editingAlert.token}
                  onChange={(e) => setEditingAlert({ ...editingAlert, token: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  required
                />
              </div>

              {/* Title */}
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                  Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={editingAlert.title}
                  onChange={(e) => setEditingAlert({ ...editingAlert, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={editingAlert.description}
                  onChange={(e) => setEditingAlert({ ...editingAlert, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                  required
                />
              </div>

              {/* Severity */}
              <div>
                <label htmlFor="severity" className="block text-sm font-medium text-gray-700 mb-1">
                  Severity
                </label>
                <select
                  id="severity"
                  value={editingAlert.severity}
                  onChange={(e) => setEditingAlert({ ...editingAlert, severity: e.target.value as Alert['severity'] })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  required
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label htmlFor="deadline" className="block text-sm font-medium text-gray-700 mb-1">
                  Deadline
                </label>
                <input
                  id="deadline"
                  type="datetime-local"
                  value={editingAlert.deadline ? new Date(editingAlert.deadline).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setEditingAlert({ ...editingAlert, deadline: new Date(e.target.value).toISOString() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  required
                />
              </div>

              {/* Further Info */}
              <div>
                <label htmlFor="further_info" className="block text-sm font-medium text-gray-700 mb-1">
                  Further Information (Optional)
                </label>
                <textarea
                  id="further_info"
                  value={editingAlert.further_info || ''}
                  onChange={(e) => setEditingAlert({ ...editingAlert, further_info: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                  placeholder="Additional details or context..."
                />
              </div>

              {/* Source Type */}
              <div>
                <label htmlFor="source_type" className="block text-sm font-medium text-gray-700 mb-1">
                  Source Type (Optional)
                </label>
                <select
                  id="source_type"
                  value={editingAlert.source_type || ''}
                  onChange={(e) => setEditingAlert({ ...editingAlert, source_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                >
                  <option value="">Select source type...</option>
                  <option value="anonymous">Anonymous</option>
                  <option value="mainstream-media">Mainstream Media</option>
                  <option value="trusted-source">Trusted Source</option>
                  <option value="social-media">Social Media</option>
                  <option value="dev-team">Dev Team</option>
                </select>
              </div>

              {/* Source URL */}
              <div>
                <label htmlFor="source_url" className="block text-sm font-medium text-gray-700 mb-1">
                  Source URL (Optional)
                </label>
                <input
                  id="source_url"
                  type="url"
                  value={editingAlert.source_url || ''}
                  onChange={(e) => setEditingAlert({ ...editingAlert, source_url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="https://..."
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false)
                    setEditingAlert(null)
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateAlertMutation.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateAlertMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-semibold text-gray-900">Bulk Upload Alerts</h2>
              <button
                onClick={() => {
                  setIsUploadModalOpen(false)
                  setUploadFile(null)
                  setUploadStatus('idle')
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-2">Upload Format Requirements:</p>
                    <ul className="list-disc list-inside space-y-1 text-blue-800">
                      <li><strong>JSON:</strong> Array of alert objects with fields: token, title, description, severity, deadline</li>
                      <li><strong>CSV:</strong> Header row with columns: token, title, description, severity, deadline</li>
                      <li><strong>Severity:</strong> Must be one of: info, warning, critical</li>
                      <li><strong>Deadline:</strong> ISO 8601 date format (YYYY-MM-DDTHH:mm:ss.sssZ)</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Sample Download */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Download Sample Template
                </label>
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download current alerts as CSV template
                </button>
              </div>

              {/* File Upload */}
              <div>
                <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 mb-2">
                  Select File
                </label>
                <div className="flex items-center gap-4">
                  <label
                    htmlFor="file-upload"
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-500 cursor-pointer transition"
                  >
                    <FileText className="w-8 h-8 text-gray-400" />
                    <div className="text-center">
                      <span className="text-gray-600">
                        {uploadFile ? uploadFile.name : 'Choose a JSON or CSV file'}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        or drag and drop
                      </p>
                    </div>
                    <input
                      id="file-upload"
                      type="file"
                      accept=".json,.csv"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>

              {/* Status Message */}
              {uploadStatus !== 'idle' && (
                <div className={`p-4 rounded-lg flex items-center gap-3 ${
                  uploadStatus === 'success' ? 'bg-green-50 text-green-800' :
                  uploadStatus === 'error' ? 'bg-red-50 text-red-800' :
                  'bg-blue-50 text-blue-800'
                }`}>
                  {uploadStatus === 'success' && <Info className="w-5 h-5" />}
                  {uploadStatus === 'error' && <AlertCircle className="w-5 h-5" />}
                  {uploadStatus === 'uploading' && (
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  )}
                  <span className="font-medium">{uploadMessage || 'Processing...'}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadModalOpen(false)
                    setUploadFile(null)
                    setUploadStatus('idle')
                  }}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploadStatus === 'uploading'}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload Alerts'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

