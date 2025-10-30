# Railway Deployment Configuration for AI Features

## Adding OpenAI API Key to Railway

### Step 1: Access Railway Dashboard
1. Go to https://railway.app
2. Navigate to your CLG-ADMIN project
3. Click on the service/deployment

### Step 2: Add Environment Variable
1. Click on **"Variables"** tab
2. Click **"+ New Variable"**
3. Add the following:

```
Name: VITE_OPENAI_API_KEY
Value: [Your OpenAI API Key - get from https://platform.openai.com/api-keys]
```

**Note:** Use your actual OpenAI API key that starts with `sk-proj-...`

### Step 3: Redeploy
Railway will automatically redeploy with the new environment variable.

## Verification

After deployment, verify the AI feature is working:

1. **Open Admin Panel** (Railway URL)
2. **Navigate to News Feed**
3. **Click Bell icon** on any news article
4. **Check for AI button**: Should see purple gradient "Generate Smart Alert with AI" button
5. **Click AI button**: Should analyze and populate alert fields
6. **Verify reasoning**: AI explanation should appear below button

## Environment Variables Summary

Your Railway project should have these variables:

```bash
# Backend API
VITE_API_URL=https://app.crypto-lifeguard.com

# AI Features
VITE_OPENAI_API_KEY=sk-proj-...
```

## Troubleshooting

### AI Button Not Showing
- Check Railway variables dashboard
- Ensure `VITE_OPENAI_API_KEY` is set
- Trigger a new deployment
- Clear browser cache

### API Errors
- Verify OpenAI account has credits
- Check API key is valid at https://platform.openai.com/api-keys
- Review Railway deployment logs for errors

## Security Notes

⚠️ **Important:**
- Never commit `.env` file with real API keys
- API key is only in Railway environment variables
- Local development uses local `.env` file (git-ignored)
- `.env.example` shows format without real keys

## Cost Monitoring

Monitor OpenAI usage:
1. Go to https://platform.openai.com/usage
2. Check daily/monthly spend
3. Set up billing alerts if needed
4. Estimated cost: ~$0.15/month for 1,000 alerts

---

*Configuration Date: October 29, 2025*
