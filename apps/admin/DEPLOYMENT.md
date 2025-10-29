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
