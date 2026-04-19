# Crypto Lifeguard Admin Dashboard - GitHub Actions

## Deployment Options

This admin dashboard can be deployed to multiple platforms:

### 1. Vercel (Recommended for frontend)
- Automatic deployments on push
- Environment variable: `VITE_API_URL`
- Command: `npm run build`

### 2. Netlify
- Build command: `npm run build`
- Publish directory: `dist`
- Environment variable: `VITE_API_URL`

### 3. Railway
- Uses `railway.json` configuration
- Automatically builds and deploys
- Set `VITE_API_URL` in Railway dashboard

## Environment Variables

All platforms need:
- `VITE_API_URL` - URL of your CLG-DEPLOY backend (e.g., https://your-api.railway.app)

### Web Push (optional — required for browser notifications)

Generate a VAPID keypair once:

```
npx web-push generate-vapid-keys
```

Then set these three variables on Railway (or whatever platform runs the backend):

- `VAPID_PUBLIC_KEY` — base64url public key from the command above
- `VAPID_PRIVATE_KEY` — base64url private key (server-only, keep secret)
- `VAPID_SUBJECT` — `mailto:admin@your-domain.com` (required by the push protocol)

If the keys are not set, push routes return 503 and alert creation skips fan-out silently — the rest of the app continues to work. Test with `POST /admin/push/test` (admin auth required) after at least one browser has subscribed via the "Enable notifications" menu item.

## CORS Configuration

Don't forget to configure CORS on your backend to allow requests from your admin dashboard domain!

In CLG-DEPLOY `server.js`, add:
```javascript
const cors = require('cors')
app.use(cors({
  origin: process.env.ADMIN_DASHBOARD_URL || 'http://localhost:5173',
  credentials: true
}))
```
