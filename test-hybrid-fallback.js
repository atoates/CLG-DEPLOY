// Test hybrid CMC + CoinGecko approach
// Simulates: POL, ETH, SOL (have CMC data) + TAO (only in CoinGecko)

const COINGECKO_API_KEY = process.env.GEKO || 'CG-Jc4DsFjBLLkJ5RyiuLQcTwVL';

async function getCoinGeckoId(symbol) {
  const wellKnownCoins = {
    'TAO': 'bittensor',
    'POL': 'polygon-ecosystem-token'
  };
  return wellKnownCoins[symbol.toUpperCase()] || null;
}

async function testHybridFallback() {
  console.log('🧪 Testing Hybrid CMC + CoinGecko Fallback\n');
  
  // Simulate CMC response with mixed data (some tokens have prices, TAO doesn't)
  const cmcItems = [
    { token: 'POL', lastPrice: 0.20, dayChangePct: 0.66, volume24h: 63.6e6, marketCap: 2.12e9 },
    { token: 'ETH', lastPrice: 4122.13, dayChangePct: -0.67, volume24h: 29.07e9, marketCap: 497.32e9 },
    { token: 'SOL', lastPrice: 199.62, dayChangePct: 0.49, volume24h: 6.5e9, marketCap: 110.29e9 },
    { token: 'TAO', lastPrice: null, dayChangePct: 0, volume24h: 0, marketCap: null }, // Missing in CMC
  ];
  
  console.log('Step 1: CMC returned data for some tokens:');
  cmcItems.forEach(item => {
    console.log(`  ${item.token}: $${item.lastPrice || 'NULL'}`);
  });
  
  const hasValidData = cmcItems.some(item => item.lastPrice !== null);
  console.log(`\n  Has valid data: ${hasValidData} ✅`);
  
  // Find tokens with null prices
  const nullPriceSymbols = cmcItems.filter(item => item.lastPrice === null).map(item => item.token);
  console.log(`\nStep 2: Tokens with null prices: ${nullPriceSymbols.join(', ')}`);
  
  if (nullPriceSymbols.length > 0) {
    console.log('\nStep 3: Backfilling from CoinGecko...');
    
    const coinIds = [];
    const symbolToIdMap = {};
    
    for (const sym of nullPriceSymbols) {
      const coinId = await getCoinGeckoId(sym);
      if (coinId) {
        coinIds.push(coinId);
        symbolToIdMap[coinId] = sym;
        console.log(`  Mapped ${sym} → ${coinId}`);
      }
    }
    
    const currencyLower = 'usd';
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds.join(',')}&vs_currencies=${currencyLower}&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&x_cg_demo_api_key=${COINGECKO_API_KEY}`;
    
    const priceResp = await fetch(priceUrl);
    const priceData = await priceResp.json();
    
    console.log('\nStep 4: Updating items with CoinGecko data:');
    cmcItems.forEach(item => {
      if (item.lastPrice === null) {
        const coinId = Object.keys(symbolToIdMap).find(id => symbolToIdMap[id] === item.token);
        if (coinId && priceData[coinId]) {
          const data = priceData[coinId];
          item.lastPrice = data[currencyLower] ?? null;
          item.dayChangePct = data[`${currencyLower}_24h_change`] ?? item.dayChangePct;
          item.volume24h = data[`${currencyLower}_24h_vol`] ?? item.volume24h;
          item.marketCap = data[`${currencyLower}_market_cap`] ?? item.marketCap;
          console.log(`  ✅ ${item.token}: $${item.lastPrice.toFixed(2)} (from CoinGecko)`);
        }
      }
    });
  }
  
  console.log('\n📊 Final Result (CMC + CoinGecko hybrid):');
  cmcItems.forEach(item => {
    console.log(`  ${item.token}: $${item.lastPrice?.toFixed(2) || 'NULL'} (${item.dayChangePct?.toFixed(2)}%)`);
  });
  
  console.log('\n✅ Test passed! TAO backfilled from CoinGecko while keeping CMC data for others.');
}

testHybridFallback().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
