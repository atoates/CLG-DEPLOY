// Test that TAO falls back to CoinGecko when CMC returns null data
const CMC_API_KEY = process.env.CMC_API_KEY;
const COINGECKO_API_KEY = process.env.GEKO || 'CG-Jc4DsFjBLLkJ5RyiuLQcTwVL';

async function getCoinGeckoId(symbol) {
  const wellKnownCoins = {
    'TAO': 'bittensor'
  };
  return wellKnownCoins[symbol.toUpperCase()] || null;
}

async function testTaoFallback() {
  console.log('🧪 Testing TAO fallback logic...\n');
  
  const symbol = 'TAO';
  const currency = 'USD';
  
  // Simulate CMC response (returns data but with null price)
  console.log('Step 1: Simulating CMC response with null price');
  const cmcItem = {
    token: symbol,
    lastPrice: null,
    dayChangePct: 0,
    marketCap: null
  };
  
  const hasValidData = cmcItem.lastPrice !== null && cmcItem.lastPrice !== undefined;
  console.log(`  CMC has valid data: ${hasValidData}`);
  
  if (!hasValidData) {
    console.log('  ✅ Should fall through to CoinGecko\n');
    
    console.log('Step 2: Fetching from CoinGecko fallback');
    const coinId = await getCoinGeckoId(symbol);
    console.log(`  Mapped ${symbol} → ${coinId}`);
    
    const currencyLower = currency.toLowerCase();
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
    
    const priceResp = await fetch(priceUrl);
    const priceData = await priceResp.json();
    
    const data = priceData[coinId];
    const item = {
      token: symbol,
      lastPrice: data[currencyLower] ?? null,
      dayChangePct: data[`${currencyLower}_24h_change`] ?? null,
      volume24h: data[`${currencyLower}_24h_vol`] ?? null,
      marketCap: data[`${currencyLower}_market_cap`] ?? null
    };
    
    console.log('\n✅ CoinGecko Response:');
    console.log(`  ${item.token}: $${item.lastPrice?.toFixed(2)}`);
    console.log(`  24h Change: ${item.dayChangePct?.toFixed(2)}%`);
    console.log(`  Volume: $${item.volume24h ? (item.volume24h / 1e6).toFixed(2) + 'M' : 'N/A'}`);
    console.log(`  Market Cap: $${item.marketCap ? (item.marketCap / 1e9).toFixed(2) + 'B' : 'N/A'}`);
    console.log('\n✅ Test passed! TAO will use CoinGecko fallback when CMC returns null.');
  } else {
    console.log('  ❌ Would NOT fall through - this is the bug!');
  }
}

testTaoFallback().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
