// vite.config.js
import { resolve } from 'path';

export default {
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        create: resolve(__dirname, 'create.html'),
        admin: resolve(__dirname, 'admin.html'),
        profile: resolve(__dirname, 'profile.html'),
      },
    },
  },
};
