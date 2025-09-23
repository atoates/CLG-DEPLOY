import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    host: true,          // helpful in containers/StackBlitz
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
