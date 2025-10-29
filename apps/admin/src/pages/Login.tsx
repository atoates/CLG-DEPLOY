import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { LogIn } from 'lucide-react'

export function Login() {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token.trim()) {
      setError('Please enter an admin token')
      return
    }

    // Store the token and redirect to dashboard
    login(token)
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Crypto Lifeguard
          </h1>
          <p className="text-gray-600">Admin Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label 
              htmlFor="token" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Admin Token
            </label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setError('')
              }}
              placeholder="Enter your admin token"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition"
          >
            <LogIn className="w-5 h-5" />
            Sign In
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          Or sign in with your admin email if whitelisted
        </p>
      </div>
    </div>
  )
}
