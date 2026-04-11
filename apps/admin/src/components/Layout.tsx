import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Bell,
  Users,
  FileText,
  Activity,
  Settings,
  LogOut,
  Newspaper,
  ShieldCheck,
  Menu,
  X,
  Sparkles,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'

interface LayoutProps {
  children: ReactNode
}

const navigation = [
  { name: 'Dashboard',      href: '/',               icon: LayoutDashboard, hint: 'Overview & signals' },
  { name: 'Alerts',         href: '/alerts',         icon: Bell,            hint: 'Compose & manage' },
  { name: 'News Feed',      href: '/news',           icon: Newspaper,       hint: 'Triage the firehose' },
  { name: 'Users',          href: '/users',          icon: Users,           hint: 'Accounts & access' },
  { name: 'Token Requests', href: '/token-requests', icon: FileText,        hint: 'User asks' },
  { name: 'Audit Log',      href: '/audit-log',      icon: Activity,        hint: 'Who did what' },
  { name: 'Settings',       href: '/settings',       icon: Settings,        hint: 'System & keys' },
]

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { logout } = useAuthStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  const currentItem = navigation.find((n) =>
    n.href === '/' ? location.pathname === '/' : location.pathname.startsWith(n.href)
  )

  const SidebarContent = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="px-6 pt-7 pb-6">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-glow-teal">
            <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold text-white">
              Crypto <span className="gradient-text">Lifeguard</span>
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300/80">
              Mission Control
            </div>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-4">
        {navigation.map((item) => {
          const isActive =
            item.href === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white/[0.07] text-white border border-teal-400/30 shadow-inner-glow'
                  : 'text-slate-400 border border-transparent hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                  isActive
                    ? 'bg-teal-500/20 text-teal-300'
                    : 'bg-white/[0.03] text-slate-400 group-hover:text-teal-300 group-hover:bg-teal-500/10'
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1">{item.name}</span>
              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-teal-300 shadow-glow-teal" />}
            </Link>
          )
        })}
      </nav>

      {/* AI hint */}
      <div className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-300">
          <Sparkles className="h-3.5 w-3.5" />
          AI Assist
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
          Paste any headline, DM or article on the Alerts page to generate a ready-to-review draft in seconds.
        </p>
      </div>

      {/* Logout */}
      <div className="border-t border-white/5 p-4">
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
            <LogOut className="h-4 w-4" />
          </span>
          Sign out
        </button>
      </div>
    </div>
  )

  return (
    <div className="relative min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-white/5 bg-[rgba(5,11,26,0.7)] backdrop-blur-xl lg:block">
        {SidebarContent}
      </aside>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-72 border-r border-white/5 bg-[rgba(5,11,26,0.95)] backdrop-blur-xl lg:hidden">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            {SidebarContent}
          </aside>
        </>
      )}

      {/* Main column */}
      <div className="relative z-10 lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-white/5 bg-[rgba(5,11,26,0.55)] backdrop-blur-xl">
          <div className="flex items-center gap-4 px-5 py-4 lg:px-10">
            <button
              className="rounded-lg border border-white/10 bg-white/5 p-2 text-slate-300 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {currentItem?.hint || 'Mission Control'}
              </div>
              <div className="font-display text-xl font-bold text-white lg:text-2xl">
                {currentItem?.name || 'Dashboard'}
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 md:flex">
              <span className="h-2 w-2 animate-pulse-soft rounded-full bg-teal-400 shadow-glow-teal" />
              Live
            </div>
          </div>
        </header>

        <main className="relative px-5 py-6 lg:px-10 lg:py-10">{children}</main>
      </div>
    </div>
  )
}
