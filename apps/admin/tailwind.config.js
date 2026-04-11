/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
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
          50: '#E8F0FE',
          100: '#C5D5E8',
          200: '#8BA8C8',
          300: '#5B7FA8',
          400: '#3A5F88',
          500: '#1E3A5F',
          600: '#152238',
          700: '#0F1A2C',
          800: '#0B1929',
          900: '#060D17',
        },
      },
    },
  },
  plugins: [],
}
