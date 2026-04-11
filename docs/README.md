# Crypto Lifeguard

Crypto Lifeguard is a web platform that helps users protect their crypto assets through personalised alerts, real-time market monitoring, AI-powered weekly summaries, and aggregated news. It tracks token prices via CoinMarketCap and CoinGecko, generates insights using OpenAI/Anthropic/xAI models, and delivers severity-graded alerts with countdown timers.

## Architecture

This is an npm-workspaces monorepo with two apps:

- **`apps/admin/`** -- Express API server and React admin dashboard. Handles all backend logic (alerts, news aggregation, AI summaries, market data) and exposes an admin UI for managing content.
- **`apps/frontend/`** -- Public-facing single-page app built with vanilla JavaScript and Vite. Provides the end-user experience: token watchlists, alerts, news, and AI summaries.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| Backend | Node.js, Express, PostgreSQL |
| Admin UI | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand, Recharts |
| Frontend | Vanilla ES modules, Vite |
| External APIs | CoinMarketCap, CoinGecko, Google OAuth, OpenAI, Anthropic, xAI |

## Getting Started

### Prerequisites

- Node.js >= 20
- PostgreSQL (local or hosted)

### Installation

```bash
npm install
```

This installs dependencies for all workspaces.

### Environment

```bash
cp apps/admin/.env.example apps/admin/.env
```

Fill in the required values: `DATABASE_URL`, `ADMIN_TOKEN`, API keys for CoinMarketCap, CoinGecko, and your chosen AI provider.

### Development

```bash
npm run dev:admin      # Admin API + dashboard on http://localhost:5173
npm run dev:frontend   # Frontend app on http://localhost:5174
```

### Database Migrations

```bash
cd apps/admin && npm run migrate
```

Migrations run automatically on production startup.

## Project Structure

```
CLG-DEPLOY/
├── apps/
│   ├── admin/            # Express API + React admin dashboard
│   │   ├── server.js     # API server entry point
│   │   ├── migrate.js    # Database migration runner
│   │   ├── migrations/   # PostgreSQL migrations
│   │   └── src/          # React admin UI (TypeScript)
│   └── frontend/         # Public-facing SPA
│       ├── src/          # Vanilla JS application code
│       ├── public/       # Static assets
│       └── serve-spa.js  # Production server
├── docs/                 # Project documentation
├── scripts/              # Utility and verification scripts
└── package.json          # Root workspace config
```

## Deployment

| Service | Platform | Directory |
|---------|----------|-----------|
| Backend + Admin UI | Railway | `apps/admin/` |
| Frontend | Vercel | `apps/frontend/` |

Production URLs:

- API / Admin: `https://clg-admin-production.up.railway.app`
- Frontend: `https://app.crypto-lifeguard.com`

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) -- Deployment checklist
- [DEVELOPMENT.md](./DEVELOPMENT.md) -- Development guidelines
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) -- Testing procedures
- [TOKEN_REQUEST_SYSTEM.md](./TOKEN_REQUEST_SYSTEM.md) -- Token request feature
- [AI_ALERT_GENERATOR.md](./AI_ALERT_GENERATOR.md) -- AI alert generation
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) -- Quick command reference

## License

Private -- All Rights Reserved
