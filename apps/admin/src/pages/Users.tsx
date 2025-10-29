import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Search, Filter, Users as UsersIcon, Mail, Calendar, Eye, Download } from 'lucide-react'

interface User {
  id: string
  email: string
  name: string
  username: string
  avatar: string
  isGoogleUser: boolean
  created_at: string | null
  watchlistCount: number
  watchlist: string[]
  lastActivity: string | null
}

export function Users() {
  const [searchTerm, setSearchTerm] = useState('')
  const [userTypeFilter, setUserTypeFilter] = useState<string>('all')
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

  const { data: usersData, isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data } = await api.get('/admin/users')
      console.log('Users response:', data)
      return data as { users: User[]; total: number }
    },
  })

  const users = usersData?.users || []
  const total = usersData?.total || 0

  const filteredUsers = users.filter((user) => {
    const matchesSearch = 
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesType = 
      userTypeFilter === 'all' ||
      (userTypeFilter === 'google' && user.isGoogleUser) ||
      (userTypeFilter === 'anonymous' && !user.isGoogleUser)
    
    return matchesSearch && matchesType
  })

  const handleViewDetails = (user: User) => {
    setSelectedUser(user)
    setIsDetailModalOpen(true)
  }

  const handleExportCSV = () => {
    window.open(`${import.meta.env.VITE_API_URL}/admin/export/users.csv`, '_blank')
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return 'Invalid Date'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>
          <p className="text-gray-600 mt-2">
            View and manage all registered users and their watchlists
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg border border-gray-300 transition"
        >
          <Download className="w-5 h-5" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by email, name, username, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
            />
          </div>

          {/* User Type Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none appearance-none"
            >
              <option value="all">All Users</option>
              <option value="google">Google Users</option>
              <option value="anonymous">Anonymous Users</option>
            </select>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex items-center gap-6 text-sm text-gray-600">
          <span>Total: {total}</span>
          <span>Showing: {filteredUsers.length}</span>
          <span>Google: {users.filter(u => u.isGoogleUser).length}</span>
          <span>Anonymous: {users.filter(u => !u.isGoogleUser).length}</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {error ? (
          <div className="p-8 text-center">
            <div className="text-red-600 font-medium">Error loading users</div>
            <div className="text-sm text-gray-500 mt-2">
              {error instanceof Error ? error.message : 'Unknown error occurred'}
            </div>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-gray-500">
            Loading users...
          </div>
        ) : filteredUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Watchlist
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Joined
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Activity
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name || 'User'}
                            className="w-10 h-10 rounded-full"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                            <UsersIcon className="w-5 h-5 text-primary-600" />
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {user.name || 'Anonymous User'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {user.username || user.id.slice(0, 12)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-gray-900">
                        {user.email ? (
                          <>
                            <Mail className="w-4 h-4 text-gray-400" />
                            {user.email}
                          </>
                        ) : (
                          <span className="text-gray-400 italic">No email</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.isGoogleUser
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {user.isGoogleUser ? 'Google' : 'Anonymous'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {user.watchlistCount > 0 ? (
                          <span className="font-medium">{user.watchlistCount} tokens</span>
                        ) : (
                          <span className="text-gray-400">No watchlist</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Calendar className="w-4 h-4" />
                        {formatDate(user.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(user.lastActivity)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(user)}
                        className="text-primary-600 hover:text-primary-900 inline-flex items-center gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || userTypeFilter !== 'all'
              ? 'No users match your filters'
              : 'No users found'}
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {isDetailModalOpen && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">User Details</h2>
              <button
                onClick={() => {
                  setIsDetailModalOpen(false)
                  setSelectedUser(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* User Profile */}
              <div className="flex items-center gap-4">
                {selectedUser.avatar ? (
                  <img
                    src={selectedUser.avatar}
                    alt={selectedUser.name || 'User'}
                    className="w-20 h-20 rounded-full"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center">
                    <UsersIcon className="w-10 h-10 text-primary-600" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">
                    {selectedUser.name || 'Anonymous User'}
                  </h3>
                  <p className="text-gray-600">{selectedUser.email || 'No email'}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    @{selectedUser.username || selectedUser.id.slice(0, 12)}
                  </p>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">User ID</div>
                  <div className="text-sm font-mono text-gray-900">{selectedUser.id}</div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Account Type</div>
                  <div className="text-sm font-medium text-gray-900">
                    {selectedUser.isGoogleUser ? 'Google Account' : 'Anonymous'}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Joined</div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(selectedUser.created_at)}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Last Activity</div>
                  <div className="text-sm font-medium text-gray-900">
                    {formatDate(selectedUser.lastActivity)}
                  </div>
                </div>
              </div>

              {/* Watchlist */}
              <div>
                <h4 className="text-lg font-semibold text-gray-900 mb-3">
                  Watchlist ({selectedUser.watchlistCount})
                </h4>
                {selectedUser.watchlist && selectedUser.watchlist.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.watchlist.map((token) => (
                      <span
                        key={token}
                        className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium"
                      >
                        {token}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 italic">No tokens in watchlist</p>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setIsDetailModalOpen(false)
                  setSelectedUser(null)
                }}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
