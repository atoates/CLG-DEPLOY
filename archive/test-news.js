// Quick test of the CryptoNews API
async function testCryptoNews() {
  console.log('Testing CryptoNews API...');
  
  // You need to set your actual API key here for testing
  const apiKey = process.env.NEWSAPI_KEY || 'YOUR_KEY_HERE';
  
  if (apiKey === 'YOUR_KEY_HERE') {
    console.error('Please set NEWSAPI_KEY environment variable');
    console.log('Usage: NEWSAPI_KEY=your-key-here node test-news.js');
    return;
  }
  
  const token = 'BTC';
  const url = `https://cryptonews-api.com/api/v1?tickers=${token}&items=5&page=1&token=${apiKey}`;
  
  console.log('URL:', url.replace(apiKey, 'HIDDEN'));
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'CryptoLifeguard/1.0'
      }
    });
    
    console.log('Status:', response.status);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('Response length:', text.length);
    
    try {
      const json = JSON.parse(text);
      console.log('Response structure:', Object.keys(json));
      
      if (json.data) {
        console.log('Number of articles:', json.data.length);
        if (json.data.length > 0) {
          console.log('\nFirst article:');
          console.log('Title:', json.data[0].title);
          console.log('Date:', json.data[0].date);
          console.log('Source:', json.data[0].source_name);
          console.log('URL:', json.data[0].news_url);
        }
      } else {
        console.log('Full response:', json);
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e.message);
      console.log('Response text:', text.substring(0, 500));
    }
    
  } catch (error) {
    console.error('Fetch error:', error);
  }
}

testCryptoNews();
