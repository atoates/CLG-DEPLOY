/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Teal accent (matches the main Crypto Lifeguard app)
        teal: {
          50:  '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#5eead4',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        primary: {
          50: '#E8F0FE',
          100: '#D1E1FD',
          200: '#A3C3FB',
          300: '#75A5F9',
          400: '#4787F7',
          500: '#2E7CF6',
          600: '#1A63D4',
          700: '#1550B0',
          800: '#103D8C',
          900: '#0B2A68',
          950: '#071C45',
        },
        navy: {
          50:  '#e6edf8',
          100: '#c2d0e8',
          200: '#8ba5c8',
          300: '#5b7fa8',
          400: '#3a5f88',
          500: '#1e3a5f',
          600: '#0b1e33',
          700: '#0a1628',
          800: '#050b1a',
          900: '#02060f',
          950: '#01030a',
        },
        // Severity colours used across the dashboard
        severity: {
          critical: '#ef4444',
          warning:  '#f59e0b',
          info:     '#38bdf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glow-teal': '0 20px 45px -20px rgba(20, 184, 166, 0.55)',
        'glow-soft': '0 30px 60px -30px rgba(8, 15, 30, 0.7)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'navy-gradient': 'radial-gradient(circle at 15% 10%, rgba(20,184,166,0.18) 0%, transparent 55%), radial-gradient(circle at 85% 0%, rgba(46,124,246,0.18) 0%, transparent 55%), linear-gradient(180deg, #050b1a 0%, #0a1628 50%, #0b1e33 100%)',
        'card-glass': 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.7' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.35s ease-out',
        'pulse-soft': 'pulse-soft 2.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
