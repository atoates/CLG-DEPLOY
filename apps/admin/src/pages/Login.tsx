import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ShieldCheck, LogIn, KeyRound, Sparkles, Zap, Newspaper } from 'lucide-react'

export function Login() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) {
      setError('Please enter your admin token')
      return
    }
    setLoading(true)
    login(token.trim())
    setTimeout(() => navigate('/'), 150)
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-12">
      {/* Decorative grid + orbs handled by body::before/::after in index.css */}

      <div className="relative z-10 grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr,1fr]">
        {/* Hero */}
        <div className="hidden lg:block">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-teal-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Mission Control
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.05] text-white">
            Keep the crypto community{' '}
            <span className="gradient-text">safe &amp; informed</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-400">
            Draft, triage and publish crypto alerts with AI assistance. Every
            headline, hack and heads-up, filtered into the feed your users actually read.
          </p>

          <ul className="mt-8 space-y-4 text-slate-300">
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold text-white">AI-assisted drafting</div>
                <div className="text-sm text-slate-400">
                  Paste a tip, tweet or article and get a categorised alert in seconds.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
                <Zap className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold text-white">One-click publish</div>
                <div className="text-sm text-slate-400">
                  Review, tweak the severity, and ship. Users get the push instantly.
                </div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300">
                <Newspaper className="h-4 w-4" />
              </span>
              <div>
                <div className="font-semibold text-white">Smart news triage</div>
                <div className="text-sm text-slate-400">
                  Convert anything in the feed straight into a polished alert.
                </div>
              </div>
            </li>
          </ul>
        </div>

        {/* Auth card */}
        <div className="relative">
          <div className="glass-card-solid relative overflow-hidden p-8 shadow-glow-soft">
            <div className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-teal-500/25 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-blue-500/25 blur-3xl" />

            <div className="relative">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 shadow-glow-teal">
                  <ShieldCheck className="h-6 w-6 text-white" strokeWidth={2.25} />
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-300">
                    Crypto Lifeguard
                  </div>
                  <div className="font-display text-xl font-bold text-white">Admin Sign In</div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="token" className="label">
                    Admin Token
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <input
                      id="token"
                      type="password"
                      value={token}
                      onChange={(e) => {
                        setToken(e.target.value)
                        setError('')
                      }}
                      placeholder="Paste your admin token"
                      className="input-lg pl-11"
                      autoComplete="current-password"
                    />
                  </div>
                  {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
                  <LogIn className="h-4 w-4" />
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-4 text-xs text-slate-500">
                <span className="h-px flex-1 bg-white/10" />
                <span>or whitelisted email</span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">
                If your admin email is whitelisted on the backend, your browser session will be recognised
                automatically after any standard sign-in.
              </p>
            </div>
          </div>

          <p className="mt-5 text-center text-xs text-slate-500">
            Protected area. All actions are logged to the audit trail.
          </p>
        </div>
      </div>
    </div>
  )
}
