// migrate-alerts-tags.js
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, 'data');
const ALERTS_PATH = path.join(DATA_DIR, 'alerts.json');

function run(){
  if (!fs.existsSync(ALERTS_PATH)) {
    console.error('alerts.json not found at', ALERTS_PATH);
    process.exit(1);
  }

  let alerts;
  try {
    alerts = JSON.parse(fs.readFileSync(ALERTS_PATH, 'utf8'));
  } catch (e) {
    console.error('Failed to parse alerts.json', e);
    process.exit(1);
  }

  if (!Array.isArray(alerts)) {
    console.error('alerts.json is not an array');
    process.exit(1);
  }

  let changed = false;
  alerts.forEach(a => {
    if (!a.hasOwnProperty('tags')) {
      a.tags = [];
      changed = true;
    }
  });

  if (changed) {
    fs.writeFileSync(ALERTS_PATH, JSON.stringify(alerts, null, 2));
    console.log('✅ Added missing tags field to alerts and saved back to', ALERTS_PATH);
  } else {
    console.log('ℹ️ All alerts already have tags field, nothing to do.');
  }
}

run();
