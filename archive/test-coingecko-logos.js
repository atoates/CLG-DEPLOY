#!/usr/bin/env node
/**
 * Test CoinGecko Logo API Integration
 * Tests the new CoinGecko-based logo fetching system
 */

const COINGECKO_API_KEY = process.env.GEKO || '';

// Test symbols
const testSymbols = ['BTC', 'ETH', 'USDT', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'SHIB', 'PEPE'];

async function getCoinGeckoId(symbol) {
  try {
    let url = '';
    if (COINGECKO_API_KEY) {
      url = `https://api.coingecko.com/api/v3/coins/list?x_cg_demo_api_key=${COINGECKO_API_KEY}`;
    } else {
      url = 'https://api.coingecko.com/api/v3/coins/list';
    }

    console.log(`🔍 Fetching coin list from: ${url.replace(COINGECKO_API_KEY, 'API_KEY_HIDDEN')}`);
    const resp = await fetch(url);
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const coinList = await resp.json();
    console.log(`✅ Fetched ${coinList.length} coins from CoinGecko`);

    const exactMatches = coinList.filter(c => c.symbol.toUpperCase() === symbol.toUpperCase());
    
    if (exactMatches.length > 0) {
      // Prioritize well-known coin IDs for common symbols
      const wellKnownCoins = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'USDT': 'tether',
        'BNB': 'binancecoin',
        'SOL': 'solana',
        'XRP': 'ripple',
        'USDC': 'usd-coin',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'TRX': 'tron',
        'AVAX': 'avalanche-2',
        'SHIB': 'shiba-inu',
        'DOT': 'polkadot',
        'MATIC': 'matic-network',
        'LTC': 'litecoin',
        'UNI': 'uniswap',
        'LINK': 'chainlink',
        'ATOM': 'cosmos',
        'XLM': 'stellar',
        'BCH': 'bitcoin-cash',
        'PEPE': 'pepe',
        'WIF': 'dogwifcoin',
        'BONK': 'bonk',
        'FLOKI': 'floki'
      };
      
      const sym = symbol.toUpperCase();
      if (wellKnownCoins[sym]) {
        const wellKnown = exactMatches.find(c => c.id === wellKnownCoins[sym]);
        if (wellKnown) {
          console.log(`✅ Found ${symbol}: ${wellKnown.id} (${wellKnown.name})`);
          return wellKnown.id;
        }
      }
      
      // Otherwise return first match
      const match = exactMatches[0];
      console.log(`✅ Found ${symbol}: ${match.id} (${match.name})`);
      return match.id;
    } else {
      console.log(`❌ No match found for ${symbol}`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error fetching coin list:`, err.message);
    return null;
  }
}

async function getCoinImage(coinId) {
  try {
    let url = '';
    if (COINGECKO_API_KEY) {
      url = `https://api.coingecko.com/api/v3/coins/${coinId}?x_cg_demo_api_key=${COINGECKO_API_KEY}&localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    } else {
      url = `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`;
    }
    
    console.log(`🔍 Fetching coin data for: ${coinId}`);
    const resp = await fetch(url);
    
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    const coinData = await resp.json();
    
    if (coinData.image) {
      console.log(`✅ Image URLs for ${coinId}:`);
      console.log(`   Large: ${coinData.image.large || 'N/A'}`);
      console.log(`   Small: ${coinData.image.small || 'N/A'}`);
      console.log(`   Thumb: ${coinData.image.thumb || 'N/A'}`);
      return coinData.image;
    } else {
      console.log(`❌ No image data found for ${coinId}`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error fetching coin data:`, err.message);
    return null;
  }
}

async function testLogo(symbol) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${symbol}`);
  console.log('='.repeat(60));

  const coinId = await getCoinGeckoId(symbol);
  if (!coinId) {
    console.log(`⚠️ Skipping ${symbol} - no CoinGecko ID found\n`);
    return;
  }

  const image = await getCoinImage(coinId);
  if (image) {
    // Try to fetch the actual image to verify it works
    try {
      const imgResp = await fetch(image.large || image.small || image.thumb);
      if (imgResp.ok) {
        console.log(`✅ Image successfully fetched (${imgResp.headers.get('content-type')})`);
      } else {
        console.log(`⚠️ Image URL returned ${imgResp.status}`);
      }
    } catch (err) {
      console.log(`❌ Failed to fetch image: ${err.message}`);
    }
  }
}

async function main() {
  console.log('🚀 CoinGecko Logo API Test');
  console.log('='.repeat(60));
  console.log(`API Key: ${COINGECKO_API_KEY ? '✅ Set (using Pro API)' : '⚠️ Not set (using free API with rate limits)'}`);
  console.log('='.repeat(60));

  for (const symbol of testSymbols) {
    await testLogo(symbol);
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('\n✨ Test complete!\n');
}

main().catch(console.error);
