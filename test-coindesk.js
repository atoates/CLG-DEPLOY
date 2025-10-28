#!/usr/bin/env node
// Test CoinDesk API integration
require('dotenv').config();

async function testCoinDeskAPI() {
  const API_KEY = process.env.COINDESK || process.env.COINDESK_API_KEY;
  
  console.log('=== CoinDesk API Test ===\n');
  
  // Check if API key is configured
  if (!API_KEY) {
    console.error('❌ No CoinDesk API key found!');
    console.log('Please set COINDESK environment variable in .env file');
    process.exit(1);
  }
  
  console.log('✅ API Key found:', API_KEY.substring(0, 8) + '...');
  console.log('   Length:', API_KEY.length);
  
  // Test the API endpoint
  const BASE_URL = process.env.COINDESK_API_URL || 'https://www.coindesk.com/arc/outboundfeeds/news';
  const url = `${BASE_URL}/?outputType=json`;
  
  console.log('\n📡 Testing endpoint:', url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CryptoLifeguard/1.0',
        'Accept': 'application/json',
        'X-API-Key': API_KEY,
        'api-key': API_KEY
      },
      timeout: 15000
    });
    
    console.log('\n📊 Response Status:', response.status, response.statusText);
    console.log('   Content-Type:', response.headers.get('content-type'));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('\n❌ API Error:');
      console.error(errorText.substring(0, 500));
      
      if (response.status === 401 || response.status === 403) {
        console.log('\n💡 Possible issues:');
        console.log('   - Invalid API key');
        console.log('   - API key not activated');
        console.log('   - Incorrect authentication header format');
        console.log('   - IP not whitelisted (if required)');
      }
      
      process.exit(1);
    }
    
    const data = await response.json();
    console.log('\n✅ API Response received!');
    console.log('   Response structure:', Object.keys(data).join(', '));
    
    // Determine where articles are in the response
    let articles = [];
    if (Array.isArray(data)) {
      articles = data;
      console.log('   Articles in: root array');
    } else if (data.result && Array.isArray(data.result)) {
      articles = data.result;
      console.log('   Articles in: data.result');
    } else if (data.items && Array.isArray(data.items)) {
      articles = data.items;
      console.log('   Articles in: data.items');
    } else if (data.data && Array.isArray(data.data)) {
      articles = data.data;
      console.log('   Articles in: data.data');
    }
    
    console.log('   Total articles:', articles.length);
    
    if (articles.length > 0) {
      console.log('\n📰 Sample Article:');
      const sample = articles[0];
      console.log('   Title:', sample.title || sample.headline || 'N/A');
      console.log('   URL:', sample.canonical_url || sample.website_url || sample.url || 'N/A');
      console.log('   Published:', sample.publish_date || sample.display_date || 'N/A');
      console.log('   Keys:', Object.keys(sample).slice(0, 10).join(', '));
      
      // Test filtering for specific tokens
      console.log('\n🔍 Testing Token Filtering:');
      const testTokens = ['BTC', 'ETH', 'SOL'];
      testTokens.forEach(token => {
        const tokenName = token === 'BTC' ? 'bitcoin' :
                         token === 'ETH' ? 'ethereum' :
                         token === 'SOL' ? 'solana' : token.toLowerCase();
        
        const relevant = articles.filter(a => {
          const text = `${a.title || ''} ${a.description || ''}`.toLowerCase();
          return text.includes(token.toLowerCase()) || text.includes(tokenName);
        });
        
        console.log(`   ${token}: ${relevant.length} articles`);
      });
    } else {
      console.log('\n⚠️  No articles found in response');
    }
    
    console.log('\n✅ CoinDesk API integration test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testCoinDeskAPI().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
