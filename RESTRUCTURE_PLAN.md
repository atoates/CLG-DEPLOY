# Repository Restructure Plan

## Current Structure Issues
- Frontend files (app.js, index.html, etc.) mixed in root
- Backend scripts scattered in root
- apps/admin contains BOTH backend server AND admin frontend
- Test files in root
- No clear separation of concerns

## Proposed Structure

```
CLG-DEPLOY/
├── apps/
│   ├── frontend/              # Main user-facing app (CLG-DEPLOY service)
│   │   ├── src/
│   │   │   ├── app.js
│   │   │   ├── create.js
│   │   │   ├── profile.js
│   │   │   └── config.js
│   │   ├── public/
│   │   │   └── icons/
│   │   ├── index.html
│   │   ├── create.html
│   │   ├── profile.html
│   │   ├── signup.html
│   │   ├── styles.css
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── nixpacks.toml
│   │   └── inject-config.sh
│   │
│   ├── backend/               # Backend API server (CLG-ADMIN service)
│   │   ├── src/
│   │   │   └── server.js
│   │   ├── migrations/
│   │   ├── scripts/
│   │   │   ├── migrate.js
│   │   │   ├── backup.js
│   │   │   ├── restore-alerts.js
│   │   │   ├── add_alerts.js
│   │   │   ├── add-production-alerts.js
│   │   │   └── update-tags.js
│   │   ├── data/
│   │   │   └── alerts.json
│   │   ├── package.json
│   │   ├── nixpacks.toml
│   │   └── railway.json
│   │
│   └── admin-dashboard/       # Admin dashboard frontend
│       ├── src/
│       ├── public/
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── tailwind.config.js
│       └── postcss.config.js
│
├── scripts/                   # Development/utility scripts
│   ├── test-coindesk.js
│   ├── test-news.js
│   ├── verify-cors-fix.sh
│   └── test-*.js
│
├── docs/                      # Documentation
│   ├── DEPLOYMENT.md
│   ├── RAILWAY_SETUP.md
│   └── *.md
│
├── packages/                  # Shared packages (if any)
│   └── shared/
│
├── .github/
├── package.json               # Root workspace config
└── README.md

```

## Migration Steps

1. Create new directory structure
2. Move frontend files from root to apps/frontend/
3. Move backend files from apps/admin/ to apps/backend/
4. Move admin dashboard from apps/admin/ to apps/admin-dashboard/
5. Move test scripts to scripts/
6. Move docs to docs/
7. Update package.json imports
8. Update Railway configuration
9. Test locally
10. Deploy to staging first

## Benefits

✅ Clear separation: frontend vs backend vs admin
✅ Each app has its own package.json and dependencies
✅ Easier to understand for new developers
✅ Matches monorepo best practices
✅ Railway can target specific directories
✅ Test and docs organized separately
