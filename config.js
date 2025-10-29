// Backend API configuration
// This file is loaded before app.js and sets the backend URL
// For production, this will be replaced with the actual backend URL via Railway env vars

window.BACKEND_URL = '__BACKEND_URL__'; // Will be replaced by build process or served dynamically

// If the placeholder wasn't replaced (local dev), use empty string (same origin)
if (window.BACKEND_URL === '__BACKEND_URL__') {
  window.BACKEND_URL = '';
}
