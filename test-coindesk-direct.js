// Quick test of CoinDesk API integration
require('dotenv').config();

const apiKey = process.env.COINDESK || process.env.COINDESK_API_KEY;

console.log('Testing CoinDesk API Integration');
console.log('=================================');
console.log('API Key configured:', apiKey ? 'YES (length: ' + apiKey.length + ')' : 'NO');
console.log('');

if (!apiKey) {
  console.error('❌ No COINDESK API key found in environment');
  process.exit(1);
}

async function testCoinDeskAPI() {
  const tokens = ['BTC', 'ETH'];
  const query = tokens.map(t => `"${t}"`).join(' OR ');
  const url = `https://api.coindesk.com/v2/news?q=${encodeURIComponent(query)}&limit=5`;

  console.log('Testing endpoint:', url);
  console.log('');

  try {
    const response = await fetch(url, {
      headers: {
        'X-Api-Key': apiKey
      }
    });

    console.log('Response Status:', response.status, response.statusText);
    console.log('Response Headers:', Object.fromEntries(response.headers.entries()));
    console.log('');

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ API Request Failed');
      console.error('Response body:', responseText);
      return;
    }

    try {
      const data = JSON.parse(responseText);
      console.log('✅ API Request Successful');
      console.log('Response structure:', JSON.stringify(data, null, 2).substring(0, 500));
      
      const articles = data.data || data.articles || [];
      console.log('');
      console.log(`Found ${articles.length} articles`);
      
      if (articles.length > 0) {
        console.log('');
        console.log('First article sample:');
        console.log(JSON.stringify(articles[0], null, 2));
      }
    } catch (parseError) {
      console.error('❌ Failed to parse JSON response');
      console.error('Raw response:', responseText);
    }
  } catch (error) {
    console.error('❌ Request Error:', error.message);
    console.error(error);
  }
}

testCoinDeskAPI();
