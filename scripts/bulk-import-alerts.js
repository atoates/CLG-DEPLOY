#!/usr/bin/env node
/*
 * Bulk-import alerts into a running Crypto Lifeguard backend via the
 * admin-only POST /api/alerts/bulk endpoint.
 *
 * Usage:
 *   ADMIN_URL=https://app.crypto-lifeguard.com \
 *   ADMIN_TOKEN=... \
 *   node scripts/bulk-import-alerts.js scripts/new-alerts-2026-04.json
 *
 * ADMIN_URL defaults to http://localhost:3000 if not set.
 * The JSON file must be shaped as { "alerts": [...] } matching the
 * /api/alerts/bulk payload.
 */

const fs = require('fs');
const path = require('path');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/bulk-import-alerts.js <path-to-alerts.json>');
    process.exit(2);
  }

  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(2);
  }

  const url = (process.env.ADMIN_URL || 'http://localhost:3000').replace(/\/$/, '');
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.error('ADMIN_TOKEN env var is required.');
    process.exit(2);
  }

  const payload = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!payload || !Array.isArray(payload.alerts)) {
    console.error('JSON file must be { "alerts": [ ... ] }');
    process.exit(2);
  }

  console.log(`Importing ${payload.alerts.length} alerts to ${url}/api/alerts/bulk ...`);

  const res = await fetch(`${url}/api/alerts/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }

  if (!res.ok) {
    console.error(`FAILED (${res.status}):`, body);
    process.exit(1);
  }

  console.log(`OK (${res.status}):`, body);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
