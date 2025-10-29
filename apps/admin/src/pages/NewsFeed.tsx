import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Newspaper, RefreshCw, Trash2, Edit2, Search, Filter, X, Save, Bell, CheckCircle2, Sparkles } from 'lucide-react'
import { fetchNewsCache, fetchNewsStats, updateNewsArticle, deleteNewsArticle, refreshNewsCache, createAlert } from '../lib/api'
import { generateAlertFromNews, isAIEnabled } from '../lib/aiAlertGenerator'
import type { NewsArticle } from '../types'

export function NewsFeed() {
  const queryClient = useQueryClient()
  const [selectedToken, setSelectedToken] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [editingArticle, setEditingArticle] = useState<NewsArticle | null>(null)
  const [creatingAlert, setCreatingAlert] = useState<NewsArticle | null>(null)
  const [viewingArticle, setViewingArticle] = useState<NewsArticle | null>(null)
  const [isGeneratingAI, setIsGeneratingAI] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string>('')
  const [editForm, setEditForm] = useState({
    title: '',
    text: '',
    sentiment: '' as 'positive' | 'neutral' | 'negative' | '',
    tickers: [] as string[],
  })
  const [alertForm, setAlertForm] = useState({
    token: '',
    title: '',
    body: '',
    severity: 'info' as 'critical' | 'warning' | 'info',
    tags: [] as string[],
    deadline: '',
    source_url: '',
  })

  // Fetch news articles
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['news-cache', selectedToken],
    queryFn: () => fetchNewsCache({ token: selectedToken || undefined, days: 120 }),
  })

  // Fetch news stats
  const { data: stats } = useQuery({
    queryKey: ['news-stats'],
    queryFn: fetchNewsStats,
  })

  // Refresh news mutation
  const refreshMutation = useMutation({
    mutationFn: refreshNewsCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      queryClient.invalidateQueries({ queryKey: ['news-stats'] })
    },
  })

  // Update news mutation
  const updateMutation = useMutation({
    mutationFn: ({ url, updates }: { url: string; updates: any }) => 
      updateNewsArticle(url, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      setEditingArticle(null)
    },
  })

  // Delete news mutation
  const deleteMutation = useMutation({
    mutationFn: deleteNewsArticle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      queryClient.invalidateQueries({ queryKey: ['news-stats'] })
    },
  })

  // Create alert mutation
  const createAlertMutation = useMutation({
    mutationFn: createAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      // Refetch news to get updated alert_created status
      queryClient.invalidateQueries({ queryKey: ['news-cache'] })
      setCreatingAlert(null)
      alert('Alert created successfully!')
    },
  })

  // Filter articles by search
  const filteredArticles = articles.filter(article => {
    if (!searchQuery) return true
    const search = searchQuery.toLowerCase()
    return (
      article.title.toLowerCase().includes(search) ||
      article.text?.toLowerCase().includes(search) ||
      article.source_name.toLowerCase().includes(search)
    )
  })

  // Get unique tokens from stats
  const tokens = stats?.byToken?.map(t => t.token) || []

  // Handle edit
  const handleEdit = (article: NewsArticle) => {
    setEditingArticle(article)
    setEditForm({
      title: article.title,
      text: article.text || '',
      sentiment: article.sentiment || '',
      tickers: article.tickers,
    })
  }

  const handleSaveEdit = () => {
    if (!editingArticle) return
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

  const handleDelete = (articleUrl: string) => {
    if (confirm('Are you sure you want to delete this article from cache?')) {
      deleteMutation.mutate(articleUrl)
    }
  }

  // Handle create alert from news
  const handleCreateAlert = (article: NewsArticle) => {
    setCreatingAlert(article)
    setAiReasoning('')
    // Pre-populate form with article data (basic mode)
    setAlertForm({
      token: article.tickers[0] || '',
      title: article.title,
      body: article.text || '',
      severity: article.sentiment === 'negative' ? 'warning' : 'info',
      tags: article.sentiment === 'negative' ? ['news', 'warning'] : ['news'],
      deadline: '',
      source_url: article.article_url,
    })
  }

  // Handle AI-assisted alert generation
  const handleGenerateWithAI = async () => {
    if (!creatingAlert) return
    
    setIsGeneratingAI(true)
    setAiReasoning('')
    
    try {
      const aiAlert = await generateAlertFromNews(creatingAlert)
      
      setAlertForm({
        token: aiAlert.token,
        title: aiAlert.title,
        body: aiAlert.body,
        severity: aiAlert.severity,
        tags: aiAlert.tags,
        deadline: aiAlert.deadline || '',
        source_url: creatingAlert.article_url,
      })
      
      if (aiAlert.reasoning) {
        setAiReasoning(aiAlert.reasoning)
      }
    } catch (error) {
      console.error('AI generation failed:', error)
      alert('AI generation failed. Please try again or edit manually.')
    } finally {
      setIsGeneratingAI(false)
    }
  }

  const handleSaveAlert = () => {
    if (!creatingAlert || !alertForm.token || !alertForm.title) return
    
    createAlertMutation.mutate({
      token: alertForm.token,
      title: alertForm.title,
      body: alertForm.body,
      severity: alertForm.severity,
      tags: alertForm.tags,
      deadline: alertForm.deadline || undefined,
      source_url: alertForm.source_url || creatingAlert.article_url,  // Use form source_url or fallback to article URL
    })
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">News Cache Management</h1>
          <p className="text-gray-600 mt-2">Manage cached news articles from CoinDesk</p>
        </div>
        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          Refresh Cache
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Total Cached</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.totalCached || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Expiring Soon (7d)</p>
          <p className="text-3xl font-bold text-orange-600 mt-2">{stats?.expiringSoon || 0}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Avg Age</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">
            {stats?.avgAgeSeconds ? Math.round(stats.avgAgeSeconds / 86400) : 0}d
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-600">Unique Tokens</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{tokens.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Search className="w-4 h-4 inline mr-2" />
              Search Articles
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, content, or source..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Filter className="w-4 h-4 inline mr-2" />
              Filter by Token
            </label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">All Tokens</option>
              {tokens.map(token => (
                <option key={token} value={token}>{token}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Articles List */}
      <div className="bg-white rounded-lg border border-gray-200">
        {isLoading ? (
          <div className="p-8 text-center text-gray-600">Loading articles...</div>
        ) : filteredArticles.length === 0 ? (
          <div className="p-8 text-center">
            <Newspaper className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No articles found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredArticles.map(article => (
              <div key={article.article_url} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex-1 cursor-pointer" 
                    onClick={() => setViewingArticle(article)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-500">{article.source_name}</span>
                      <span className="text-xs text-gray-400">•</span>
                      <span className="text-xs text-gray-500">{formatDate(article.date)}</span>
                      {article.sentiment && (
                        <>
                          <span className="text-xs text-gray-400">•</span>
                          <span className={`text-xs font-medium ${
                            article.sentiment === 'positive' ? 'text-green-600' :
                            article.sentiment === 'negative' ? 'text-red-600' :
                            'text-gray-600'
                          }`}>
                            {article.sentiment}
                          </span>
                        </>
                      )}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2 hover:text-primary-600">{article.title}</h3>
                    {article.text && (
                      <p className="text-sm text-gray-600 mb-3 line-clamp-2">{article.text}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {article.tickers.map(ticker => (
                        <span
                          key={ticker}
                          className="px-2 py-1 bg-primary-100 text-primary-700 text-xs font-medium rounded"
                        >
                          {ticker}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {article.alert_created ? (
                      <button
                        className="p-2 text-green-600 bg-green-50 rounded cursor-default"
                        title="Alert already created from this article"
                        disabled
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleCreateAlert(article)}
                        className="p-2 text-gray-600 hover:text-green-600 hover:bg-gray-100 rounded"
                        title="Create alert from this article"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(article)}
                      className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded"
                      title="Edit article"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(article.article_url)}
                      disabled={deleteMutation.isPending}
                      className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded"
                      title="Delete article"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Edit Article</h2>
              <button
                onClick={() => setEditingArticle(null)}
                className="p-2 text-gray-600 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>
                <textarea
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Sentiment</label>
                <select
                  value={editForm.sentiment}
                  onChange={(e) => setEditForm({ ...editForm, sentiment: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">None</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tickers (comma-separated)
                </label>
                <input
                  type="text"
                  value={editForm.tickers.join(', ')}
                  onChange={(e) => setEditForm({ 
                    ...editForm, 
                    tickers: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="BTC, ETH, SOL"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setEditingArticle(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Alert Modal */}
      {creatingAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Create Alert from News</h2>
              <button
                onClick={() => setCreatingAlert(null)}
                className="p-2 text-gray-600 hover:text-gray-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Generation Button */}
            {isAIEnabled() && (
              <div className="px-6 pt-4 pb-2 bg-gradient-to-r from-purple-50 to-blue-50 border-b border-purple-100">
                <button
                  onClick={handleGenerateWithAI}
                  disabled={isGeneratingAI}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-4 py-3 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className={`w-5 h-5 ${isGeneratingAI ? 'animate-spin' : ''}`} />
                  {isGeneratingAI ? 'AI is analyzing article...' : 'Generate Smart Alert with AI'}
                </button>
                {aiReasoning && (
                  <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                    <p className="text-xs font-semibold text-purple-900 mb-1">AI Reasoning:</p>
                    <p className="text-sm text-gray-700">{aiReasoning}</p>
                  </div>
                )}
              </div>
            )}

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Token <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={alertForm.token}
                  onChange={(e) => setAlertForm({ ...alertForm, token: e.target.value.toUpperCase() })}
                  placeholder="BTC, ETH, SOL..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Select from tickers: {creatingAlert.tickers.join(', ') || 'None'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={alertForm.title}
                  onChange={(e) => setAlertForm({ ...alertForm, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Alert Body</label>
                <textarea
                  value={alertForm.body}
                  onChange={(e) => setAlertForm({ ...alertForm, body: e.target.value })}
                  rows={6}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Alert description and source URL..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Severity</label>
                <select
                  value={alertForm.severity}
                  onChange={(e) => setAlertForm({ ...alertForm, severity: e.target.value as any })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={alertForm.tags.join(', ')}
                  onChange={(e) => setAlertForm({ 
                    ...alertForm, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  placeholder="news, community, warning..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Deadline (optional)
                </label>
                <input
                  type="datetime-local"
                  value={alertForm.deadline}
                  onChange={(e) => setAlertForm({ ...alertForm, deadline: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Source URL
                </label>
                <input
                  type="url"
                  value={alertForm.source_url}
                  onChange={(e) => setAlertForm({ ...alertForm, source_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  readOnly
                />
                <p className="text-xs text-gray-500 mt-1">
                  Auto-populated from news article
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setCreatingAlert(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAlert}
                disabled={createAlertMutation.isPending || !alertForm.token || !alertForm.title}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <Bell className="w-4 h-4" />
                Create Alert
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Article Modal */}
      {viewingArticle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-600">{viewingArticle.source_name}</span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-sm text-gray-500">{formatDate(viewingArticle.date)}</span>
                  {viewingArticle.sentiment && (
                    <>
                      <span className="text-xs text-gray-400">•</span>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        viewingArticle.sentiment === 'positive' ? 'bg-green-100 text-green-700' :
                        viewingArticle.sentiment === 'negative' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {viewingArticle.sentiment}
                      </span>
                    </>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{viewingArticle.title}</h2>
              </div>
              <button
                onClick={() => setViewingArticle(null)}
                className="p-2 text-gray-600 hover:text-gray-900 ml-4"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Article Image */}
              {viewingArticle.image_url && (
                <div className="rounded-lg overflow-hidden">
                  <img 
                    src={viewingArticle.image_url} 
                    alt={viewingArticle.title}
                    className="w-full h-auto"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                </div>
              )}

              {/* Article Content */}
              <div className="prose max-w-none">
                {viewingArticle.text ? (
                  <p className="text-gray-700 text-base leading-relaxed whitespace-pre-wrap">
                    {viewingArticle.text}
                  </p>
                ) : (
                  <p className="text-gray-500 italic">No article content available</p>
                )}
              </div>

              {/* Tokens */}
              {viewingArticle.tickers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Related Tokens</h3>
                  <div className="flex flex-wrap gap-2">
                    {viewingArticle.tickers.map(ticker => (
                      <span
                        key={ticker}
                        className="px-3 py-1 bg-primary-100 text-primary-700 text-sm font-medium rounded"
                      >
                        {ticker}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Source Link */}
              <div className="border-t border-gray-200 pt-4">
                <a
                  href={viewingArticle.article_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary-600 hover:text-primary-700 font-medium"
                >
                  Read full article on {viewingArticle.source_name}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 border-t border-gray-200 pt-4">
                {!viewingArticle.alert_created && (
                  <button
                    onClick={() => {
                      setViewingArticle(null)
                      handleCreateAlert(viewingArticle)
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    <Bell className="w-4 h-4" />
                    Create Alert from Article
                  </button>
                )}
                <button
                  onClick={() => {
                    setViewingArticle(null)
                    handleEdit(viewingArticle)
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Article
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
