#!/usr/bin/env node
/**
 * Custom static server with selective SPA fallback
 * - Serves static files from dist/
 * - Returns index.html ONLY for /auth/* routes (for client-side redirect)
 * - Returns 404 for other non-existent files (so signup.html, profile.html work)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
};

const server = http.createServer((req, res) => {
  // Parse URL
  let filePath = req.url === '/' ? '/index.html' : req.url;
  
  // Remove query string
  const queryIndex = filePath.indexOf('?');
  if (queryIndex !== -1) {
    filePath = filePath.substring(0, queryIndex);
  }
  
  // Log all requests
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${filePath}`);
  
  // Special handling for /auth/* routes - serve index.html for client-side redirect
  if (filePath.startsWith('/auth/')) {
    filePath = '/index.html';
  }
  
  const fullPath = path.join(DIST_DIR, filePath);
  
  // Security: prevent directory traversal
  if (!fullPath.startsWith(DIST_DIR)) {
    console.log(`❌ Forbidden: ${fullPath} not in ${DIST_DIR}`);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }
  
  // Read and serve file
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        console.log(`❌ 404: ${fullPath} not found`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        console.log(`❌ 500: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      return;
    }
    
    const ext = path.extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    
    console.log(`✅ 200: ${fullPath} (${contentType})`);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📂 Serving files from: ${DIST_DIR}`);
  
  // Verify dist directory exists and list contents
  if (fs.existsSync(DIST_DIR)) {
    const files = fs.readdirSync(DIST_DIR);
    console.log(`📁 Dist directory contents (${files.length} items):`);
    files.forEach(file => console.log(`   - ${file}`));
  } else {
    console.error(`❌ DIST_DIR does not exist: ${DIST_DIR}`);
  }
});
