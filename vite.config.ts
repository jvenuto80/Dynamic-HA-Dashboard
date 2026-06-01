import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { layoutApi } from './vite-layout-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_HA_URL || 'http://homeassistant.local:8123';
  return {
    plugins: [react(), layoutApi()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
        '/local': {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
