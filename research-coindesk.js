// Research CoinDesk API - checking their public endpoints and documentation
require('dotenv').config();

const apiKey = process.env.COINDESK;

console.log('CoinDesk API Research');
console.log('====================');
console.log('');

// CoinDesk is known for:
// 1. Bitcoin Price Index API (free, public)
// 2. Indices API (paid, for institutional data)
// 3. No public news API (they use Arc Publishing)

console.log('Known CoinDesk APIs:');
console.log('1. Bitcoin Price Index (BPI) - FREE, public');
console.log('   https://api.coindesk.com/v1/bpi/currentprice.json');
console.log('');

async function testBPI() {
  console.log('Testing Bitcoin Price Index API (public):');
  try {
    const response = await fetch('https://api.coindesk.com/v1/bpi/currentprice.json');
    const data = await response.json();
    console.log('✅ BPI API works!');
    console.log('Sample:', JSON.stringify(data, null, 2).substring(0, 300));
  } catch (error) {
    console.log('❌ BPI API failed:', error.message);
  }
  console.log('');
}

async function testIndicesAPI() {
  console.log('Testing CoinDesk Indices API (requires subscription):');
  console.log('Endpoint: https://www.coindesk.com/pf/api/v3/content/fetch/');
  
  try {
    const response = await fetch('https://www.coindesk.com/pf/api/v3/content/fetch/query-feed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify({
        query: {
          tag: 'bitcoin',
          size: 5
        }
      })
    });
    
    console.log('Status:', response.status);
    const text = await response.text();
    console.log('Response:', text.substring(0, 500));
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

async function testRSSFeed() {
  console.log('Testing CoinDesk RSS Feed (public):');
  console.log('Note: RSS feeds are free and don\'t require API keys');
  
  try {
    const response = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss/');
    console.log('Status:', response.status);
    const text = await response.text();
    if (response.ok) {
      console.log('✅ RSS feed accessible');
      console.log('Preview:', text.substring(0, 300));
    } else {
      console.log('❌ RSS failed');
    }
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
  console.log('');
}

async function runResearch() {
  await testBPI();
  await testRSSFeed();
  await testIndicesAPI();
  
  console.log('');
  console.log('CONCLUSION:');
  console.log('===========');
  console.log('Your API key is likely for CoinDesk Indices API (institutional data)');
  console.log('OR it might be for their Arc Publishing API (content management)');
  console.log('');
  console.log('For NEWS, CoinDesk likely uses:');
  console.log('- RSS feeds (free, public, no API key needed)');
  console.log('- Arc Publishing API (content/article management)');
  console.log('');
  console.log('Recommendation: Check your CoinDesk account/docs to confirm which');
  console.log('API product you have access to.');
}

runResearch();
