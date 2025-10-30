// vite.config.js
import { resolve } from 'path';
import { copyFileSync, existsSync, mkdirSync } from 'fs';

export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        create: resolve(__dirname, 'create.html'),
        profile: resolve(__dirname, 'profile.html'),
        signup: resolve(__dirname, 'signup.html'),
      },
    },
  },
  plugins: [
    {
      name: 'copy-config',
      closeBundle() {
        // Copy config.js to dist after build
        const distDir = resolve(__dirname, 'dist');
        if (!existsSync(distDir)) {
          mkdirSync(distDir, { recursive: true });
        }
        copyFileSync(resolve(__dirname, 'src/config.js'), resolve(distDir, 'config.js'));
      }
    }
  ],
};
