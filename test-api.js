#!/usr/bin/env node

// Simple test of CMC API implementation without starting full server
const fs = require('fs');
const path = require('path');

// Simulate the env vars
process.env.CMC_API_KEY = process.env.CMC_API_KEY || '';
process.env.MARKET_CURRENCY = process.env.MARKET_CURRENCY || 'GBP';
process.env.POLYGON_API_KEY = process.env.POLYGON_API_KEY || '';

const CMC_API_KEY = process.env.CMC_API_KEY || '';
const MARKET_CURRENCY = (process.env.MARKET_CURRENCY || 'GBP').toUpperCase();
const POLYGON_KEY = process.env.POLYGON_API_KEY || '';

console.log('Test Configuration:');
console.log('- CMC_API_KEY:', CMC_API_KEY ? 'Set' : 'Not set');
console.log('- MARKET_CURRENCY:', MARKET_CURRENCY);
console.log('- POLYGON_API_KEY:', POLYGON_KEY ? 'Set' : 'Not set');
console.log('- Provider would be:', CMC_API_KEY ? 'cmc' : (POLYGON_KEY ? 'polygon' : 'none'));

// Test the CMC static IDs mapping
const CMC_STATIC_IDS = {
  BTC: 1, ETH: 1027, USDT: 825, USDC: 3408, BNB: 1839, SOL: 5426, XRP: 52, ADA: 2010,
  DOGE: 74, TRX: 1958, TON: 11419, DOT: 6636, MATIC: 3890, POL: 28321, LINK: 1975,
  UNI: 7083, AVAX: 5805, LTC: 2, BCH: 1831, BSV: 3602, ETC: 1321, XLM: 512, HBAR: 4642,
  APT: 21794, ARB: 11841, OP: 11840, SUI: 20947, NEAR: 6535, ICP: 8916, MKR: 1518,
  AAVE: 7278, COMP: 5692, SNX: 2586, CRV: 6538, BAL: 5728, YFI: 5864, ZEC: 1437,
  DASH: 131, EOS: 1765, FIL: 2280, VET: 3077, XTZ: 2011, KSM: 5034, GLMR: 6836,
  POLYGON: 3890
};

const testSymbols = ['BTC', 'ETH'];
console.log('\nTesting symbol mapping:');
testSymbols.forEach(sym => {
  const id = CMC_STATIC_IDS[sym];
  console.log(`- ${sym} -> CMC ID ${id}`);
});

// Test URL construction
if (CMC_API_KEY) {
  const ids = testSymbols.map(s => CMC_STATIC_IDS[s]).filter(Boolean);
  const params = new URLSearchParams({
    id: ids.join(','),
    time_period: 'all_time,24h',
    convert: MARKET_CURRENCY
  });
  const url = `https://pro-api.coinmarketcap.com/v2/cryptocurrency/price-performance-stats/latest?${params.toString()}`;
  console.log('\nCMC API URL would be:');
  console.log(url);
  console.log('\nHeaders would include:');
  console.log('X-CMC_PRO_API_KEY: [REDACTED]');
} else {
  console.log('\nCMC not configured, would fall back to Polygon or no-data response');
}

// Currency symbol test
function currencySymbol(code){
  const m = { USD: '$', GBP: '£', EUR: '€', JPY: '¥', AUD: 'A$', CAD: 'C$', CHF: 'CHF', CNY: '¥', HKD: 'HK$', SGD: 'S$', NZD: 'NZ$' };
  return m[String(code||'').toUpperCase()] || code || '$';
}

console.log('\nCurrency format test:');
console.log(`${MARKET_CURRENCY} -> ${currencySymbol(MARKET_CURRENCY)}`);

console.log('\nAPI would return provider:', CMC_API_KEY ? 'cmc' : (POLYGON_KEY ? 'polygon' : 'none'));