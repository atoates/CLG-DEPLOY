# News Tab Debugging Guide

## The news API is working on the backend! 
Backend returns 21 articles successfully.

## To debug the frontend:

### 1. Wait for Railway to Deploy (2-3 minutes)
The debug code has been pushed to staging.

### 2. Open the Site in Browser
- **Staging**: https://clg-staging.up.railway.app
- **Production**: https://app.crypto-lifeguard.com

### 3. Open Browser Developer Console
- **Mac**: `Cmd + Option + J` (Chrome/Edge) or `Cmd + Option + I` (Safari)
- **Windows**: `Ctrl + Shift + J` (Chrome/Edge) or `F12`

### 4. Add Some Tokens
- Add BTC, ETH, or any other token to your watchlist

### 5. Click on the "News" Tab

### 6. Look for Debug Messages
You should see messages like:
```
[News Debug] loadNews() called
[News Debug] selectedTokens: ['BTC', 'ETH']
[News Debug] Fetching news for tokens: ['BTC', 'ETH']
[News Debug] Response status: 200
[News Debug] Received data: {news: Array(21), timestamp: "..."}
[News Debug] News count: 21
[News Debug] Calling updateNewsTab with 21 articles
```

### 7. Common Issues to Check:

#### A. If you see: "newsContent element not found"
- The HTML structure might be wrong
- Hard refresh the page (Cmd+Shift+R / Ctrl+Shift+R)

#### B. If you see: "No tokens selected"
- Make sure you've added tokens to your watchlist
- Check that tokens appear as blue pills below the input

#### C. If you see the data but no news articles displayed
- Check for JavaScript errors in console (red text)
- Look for errors related to `updateNewsTab`

#### D. If fetch fails with CORS error
- This would be a server configuration issue
- The API works from command line, so unlikely

#### E. If you see "No news available" system message
- The API key might not be working
- Check: https://clg-staging.up.railway.app/api/debug/config

### 8. Share These Details:
When you find the issue, share:
1. Screenshot of the console messages
2. Any red error messages
3. Whether tokens are showing in your watchlist
4. Which tab you're on (make sure it's the "News" tab)

### 9. Quick Test URLs:
**Test API directly in browser:**
- Config: https://clg-staging.up.railway.app/api/debug/config
- Env: https://clg-staging.up.railway.app/api/debug/env-check

**Manual test (copy-paste in console):**
```javascript
fetch('/api/news', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({tokens: ['BTC', 'ETH']})
})
.then(r => r.json())
.then(d => console.log('News response:', d))
.catch(e => console.error('Error:', e));
```
