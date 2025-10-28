// Test different possible CoinDesk API endpoints
require('dotenv').config();

const apiKey = process.env.COINDESK || process.env.COINDESK_API_KEY;

const possibleEndpoints = [
  'https://api.coindesk.com/v1/news',
  'https://api.coindesk.com/v2/news',
  'https://www.coindesk.com/api/v1/news',
  'https://www.coindesk.com/arc/api/v1/news',
  'https://coindesk.com/arc/outboundfeeds/news',
  'https://production.api.coindesk.com/v2/news',
  'https://data.coindesk.com/api/v1/news'
];

async function testEndpoint(url) {
  console.log(`Testing: ${url}`);
  try {
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'CryptoLifeguard/1.0'
      }
    });
    
    console.log(`  ✅ Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const text = await response.text();
      console.log(`  📄 Response preview: ${text.substring(0, 200)}...`);
    } else {
      const text = await response.text();
      console.log(`  ❌ Error: ${text.substring(0, 200)}`);
    }
  } catch (error) {
    if (error.cause?.code === 'ENOTFOUND') {
      console.log(`  ❌ Domain not found`);
    } else {
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
  console.log('');
}

async function runTests() {
  console.log('Testing CoinDesk API Endpoints');
  console.log('==============================');
  console.log('API Key length:', apiKey?.length || 0);
  console.log('');
  
  for (const endpoint of possibleEndpoints) {
    await testEndpoint(endpoint);
  }
}

runTests();
