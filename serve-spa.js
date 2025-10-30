#!/usr/bin/env node
/**
 * Custom static server with selective SPA fallback
 * - Serves static files from dist/
 * - Returns index.html ONLY for /auth/* routes (for client-side redirect)
 * - Returns 404 for other non-existent files (so signup.html, profile.html work)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// Serve static files
app.use(express.static(DIST_DIR));

// Special handling for /auth/* routes - serve index.html for client-side redirect
app.get('/auth/*', (req, res) => {
  const indexPath = path.join(DIST_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not found');
  }
});

// For all other routes, let express.static handle it
// If file doesn't exist, it will 404 (so signup.html, profile.html work correctly)

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📂 Serving files from: ${DIST_DIR}`);
});
