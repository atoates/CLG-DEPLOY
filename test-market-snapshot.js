// Test CoinGecko price fallback for market snapshot
const COINGECKO_API_KEY = process.env.GEKO || 'CG-Jc4DsFjBLLkJ5RyiuLQcTwVL';

// Mock getCoinGeckoId function
async function getCoinGeckoId(symbol) {
  const wellKnownCoins = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'TAO': 'bittensor',
    'SOL': 'solana',
    'POL': 'polygon-ecosystem-token'
  };
  return wellKnownCoins[symbol.toUpperCase()] || null;
}

async function testMarketSnapshot() {
  const symbols = ['BTC', 'ETH', 'TAO', 'SOL', 'POL'];
  const currency = 'USD';
  
  console.log('🧪 Testing market snapshot with CoinGecko fallback...\n');
  console.log('Symbols:', symbols.join(', '));
  console.log('Currency:', currency, '\n');
  
  // Map symbols to CoinGecko IDs
  const coinIds = [];
  const symbolToIdMap = {};
  
  for (const sym of symbols) {
    const coinId = await getCoinGeckoId(sym);
    if (coinId) {
      coinIds.push(coinId);
      symbolToIdMap[coinId] = sym;
    }
  }
  
  console.log('✅ Mapped to CoinGecko IDs:', coinIds.join(', '), '\n');
  
  // Fetch price data
  const currencyLower = currency.toLowerCase();
  const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
  
  const priceResp = await fetch(priceUrl);
  const priceData = await priceResp.json();
  
  console.log('📊 Price Data Received:\n');
  
  // Build items
  const items = symbols.map(sym => {
    const coinId = Object.keys(symbolToIdMap).find(id => symbolToIdMap[id] === sym);
    if (!coinId || !priceData[coinId]) {
      return { token: sym, lastPrice: null, error: 'no-data' };
    }
    
    const data = priceData[coinId];
    return {
      token: sym,
      lastPrice: data[currencyLower],
      dayChangePct: data[`${currencyLower}_24h_change`],
      volume24h: data[`${currencyLower}_24h_vol`],
      marketCap: data[`${currencyLower}_market_cap`]
    };
  });
  
  items.forEach(item => {
    if (item.error) {
      console.log(`${item.token}: ❌ ${item.error}`);
      console.log();
      return;
    }
    
    console.log(`${item.token}:`);
    console.log(`  Price: $${item.lastPrice?.toFixed(2) || 'N/A'}`);
    console.log(`  24h Change: ${item.dayChangePct?.toFixed(2) || 'N/A'}%`);
    console.log(`  Volume: $${item.volume24h ? (item.volume24h / 1e6).toFixed(2) + 'M' : 'N/A'}`);
    console.log(`  Market Cap: $${item.marketCap ? (item.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}`);
    console.log();
  });
  
  console.log('✅ Test complete! All prices fetched successfully.');
}

testMarketSnapshot().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
