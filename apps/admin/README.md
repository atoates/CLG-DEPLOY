# Crypto Lifeguard Admin Dashboard

Modern admin dashboard for managing the Crypto Lifeguard platform. Built with React, TypeScript, and Vite.

## 🏗️ Architecture

This is a **separate frontend application** that communicates with the CLG-DEPLOY backend API.

## 🚀 Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Visit http://localhost:3001

## 📦 Tech Stack

- React 18 + TypeScript
- Vite
- TanStack Query
- React Router
- Zustand
- Tailwind CSS
- Recharts
- Axios

## 🔐 Authentication

Enter your ADMIN_TOKEN from the backend on the login page.

## 📡 API

Connects to CLG-DEPLOY backend on port 3000 (configurable via VITE_API_URL).
