#!/bin/bash
# Quick browser test for news functionality

echo "🔍 News Frontend Debug Test"
echo "============================"
echo ""
echo "Please open your browser and do this:"
echo ""
echo "1️⃣  Go to: https://clg-staging.up.railway.app"
echo ""
echo "2️⃣  Open Browser Console:"
echo "    - Chrome/Edge: Cmd+Option+J (Mac) or Ctrl+Shift+J (Windows)"
echo "    - Safari: Cmd+Option+I (Mac)"
echo "    - Firefox: Cmd+Option+K (Mac) or Ctrl+Shift+K (Windows)"
echo ""
echo "3️⃣  Paste this JavaScript code into the console:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat << 'EOF'
// Test news API
fetch('/api/news', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({tokens: ['BTC', 'ETH']})
})
.then(r => r.json())
.then(d => {
  console.log('✅ API Response:', d);
  console.log('📰 Articles:', d.news.length);
  console.log('First article:', d.news[0].title);
})
.catch(e => console.error('❌ Error:', e));
EOF
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "4️⃣  After running the code above, try:"
echo "    a) Add a token (BTC, ETH, SOL, etc.) to your watchlist"
echo "    b) Click the 'News' tab"
echo "    c) Look for [News Debug] messages in console"
echo ""
echo "5️⃣  Tell me what you see:"
echo "    - Does the API test work?"
echo "    - Do you see news articles on the News tab?"
echo "    - Any error messages in red?"
echo ""
