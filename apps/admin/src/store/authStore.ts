import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  isAuthenticated: boolean
  login: (token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null as string | null,
      isAuthenticated: false as boolean,
      login: (token: string) => {
        localStorage.setItem('admin_token', token)
        set({ token, isAuthenticated: true })
      },
      logout: () => {
        localStorage.removeItem('admin_token')
        set({ token: null, isAuthenticated: false })
      },
    }),
    {
      name: 'admin-auth',
    }
  )
)
