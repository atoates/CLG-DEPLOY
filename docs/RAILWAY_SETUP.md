# CLG-ADMIN Railway Deployment

## Prerequisites

### Node.js Version Requirement
This project requires **Node.js 20+** because:
- Vite 7 requires Node 20.19+ or 22.12+
- React Router 7 requires Node 20+
- @vitejs/plugin-react-swc 4.x requires Node 20+

The `nixpacks.toml` file ensures Railway uses Node.js 20 automatically.

## Setup Instructions

### 1. Create New Railway Service

1. Go to https://railway.app
2. Create a new project or use existing
3. Click "New Service" → "GitHub Repo"
4. Select `atoates/CLG-ADMIN`

### 2. Configure Environment Variables

In Railway service settings, add:

```
VITE_API_URL=https://app.crypto-lifeguard.com
```

**Important:** This must point to your production backend (CLG-DEPLOY)

### 3. Connect to Database (Optional)

The admin dashboard doesn't need direct database access - it communicates through the API.

### 4. Deploy

Railway will automatically:
- Install dependencies (`npm install`)
- Build the app (`npm run build`)
- Start preview server (`npm run preview`)

### 5. Get Your URL

Once deployed, Railway will provide a URL like:
```
https://clg-admin-production.up.railway.app
```

### 6. Configure CORS on Backend

⚠️ **CRITICAL:** Update CLG-DEPLOY to allow requests from your admin dashboard URL.

In `CLG-DEPLOY/server.js`, add:

```javascript
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:5173',  // Local dev
    'https://clg-admin-production.up.railway.app',  // Production admin
    process.env.ADMIN_DASHBOARD_URL  // Optional: configurable URL
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token']
}));
```

Then set in CLG-DEPLOY Railway environment:
```
ADMIN_DASHBOARD_URL=https://clg-admin-production.up.railway.app
```

### 7. Test

1. Visit your Railway URL
2. Login with ADMIN_TOKEN
3. Verify dashboard loads
4. Check that API calls work (Network tab in DevTools)

## Troubleshooting

### CORS Errors
- Ensure backend has cors middleware installed: `npm install cors`
- Check that origin matches exactly (no trailing slash)
- Verify Authorization header is allowed

### Build Fails
- Check build logs in Railway
- Ensure all dependencies are in package.json
- Try local build: `npm run build`

### API Not Connecting
- Verify VITE_API_URL is set correctly
- Check backend is deployed and healthy
- Test backend directly: `curl https://app.crypto-lifeguard.com/healthz`

### Login Not Working
- Verify ADMIN_TOKEN env var is set on backend
- Check localStorage in browser DevTools
- Verify token is being sent in Authorization header

## Architecture

```
[Browser] → [CLG-ADMIN (Railway)] → [CLG-DEPLOY (Railway)] → [PostgreSQL (Railway)]
              ↑                           ↑
         Static Frontend            Node.js API Server
         http://localhost:5173      http://localhost:3000
         (prod: Railway URL)        (prod: app.crypto-lifeguard.com)
```

## Notes

- Admin dashboard is a **separate service** from CLG-DEPLOY
- It's just a static frontend (no database)
- All data comes from CLG-DEPLOY API
- CORS must be configured for this to work
