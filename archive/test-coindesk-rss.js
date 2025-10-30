// Test CoinDesk RSS feed integration
console.log('Testing CoinDesk RSS Feed Integration');
console.log('=====================================\n');

// Simple RSS parser (matching server.js implementation)
function parseRSSFeed(xmlText, tokens) {
  const articles = [];
  
  try {
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = xmlText.match(itemRegex) || [];
    
    console.log(`Found ${items.length} items in RSS feed\n`);
    
    for (const item of items.slice(0, 30)) {
      const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || 
                   item.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = item.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1] || 
                         item.match(/<description>(.*?)<\/description>/)?.[1] || '';
      const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
      
      const articleText = `${title} ${description}`.toUpperCase();
      const relevantTokens = tokens.filter(token => 
        articleText.includes(token.toUpperCase()) ||
        articleText.includes(`BITCOIN`) && token === 'BTC' ||
        articleText.includes(`ETHEREUM`) && token === 'ETH'
      );
      
      if (tokens.length === 0 || relevantTokens.length > 0) {
        articles.push({
          title: title.trim(),
          text: description.replace(/<[^>]*>/g, '').trim(),
          source_name: 'CoinDesk',
          date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          sentiment: 'neutral',
          tickers: relevantTokens.length > 0 ? relevantTokens : tokens,
          news_url: link,
          image_url: null
        });
      }
    }
    
  } catch (parseError) {
    console.error('RSS parsing error:', parseError.message);
  }
  
  return articles;
}

async function testCoinDeskRSS() {
  const tokens = ['BTC', 'ETH', 'SOL'];
  
  try {
    console.log(`Fetching CoinDesk RSS feed for tokens: ${tokens.join(', ')}\n`);
    
    const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/', {
      headers: {
        'User-Agent': 'CryptoLifeguard/1.0'
      }
    });

    console.log(`Response Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.error('❌ RSS feed request failed');
      return;
    }

    const xmlText = await response.text();
    console.log(`✅ RSS feed fetched (${xmlText.length} characters)\n`);
    
    const articles = parseRSSFeed(xmlText, tokens);
    
    console.log(`\n✅ Parsed ${articles.length} relevant articles\n`);
    
    if (articles.length > 0) {
      console.log('Sample articles:\n');
      articles.slice(0, 3).forEach((article, idx) => {
        console.log(`${idx + 1}. ${article.title}`);
        console.log(`   Tokens: ${article.tickers.join(', ')}`);
        console.log(`   Date: ${article.date}`);
        console.log(`   URL: ${article.news_url}`);
        console.log(`   Preview: ${article.text.substring(0, 100)}...`);
        console.log('');
      });
    }
    
    console.log('✅ CoinDesk RSS integration working!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testCoinDeskRSS();
