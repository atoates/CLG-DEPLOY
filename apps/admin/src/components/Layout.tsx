import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  LayoutDashboard, 
  Bell, 
  Users, 
  FileText, 
  Activity, 
  Settings, 
  LogOut,
  Newspaper
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { logout } = useAuthStore()

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Alerts', href: '/alerts', icon: Bell },
    { name: 'News Feed', href: '/news', icon: Newspaper },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Token Requests', href: '/token-requests', icon: FileText },
    { name: 'Audit Log', href: '/audit-log', icon: Activity },
    { name: 'Settings', href: '/settings', icon: Settings },
  ]

  return (
    <div className="min-h-screen bg-[#F0F4F8]">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-navy-800 border-r border-navy-600">
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-navy-600">
            <h1 className="text-2xl font-bold text-white">
              Crypto <span className="text-primary-500">Lifeguard</span>
            </h1>
            <p className="text-sm text-primary-200 mt-1">Admin Dashboard</p>
          </div>

          <nav className="flex-1 p-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              const Icon = item.icon
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-primary-500 text-white font-medium'
                      : 'text-gray-300 hover:bg-navy-600 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          <div className="p-4 border-t border-navy-600">
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-3 text-gray-300 hover:bg-navy-600 hover:text-white rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  )
}
