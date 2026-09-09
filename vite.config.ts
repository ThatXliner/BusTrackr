import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';
export default defineConfig({
  define: { CESIUM_BASE_URL: JSON.stringify('/cesium') },
  plugins: [react(), viteStaticCopy({targets: ['Workers','ThirdParty','Assets','Widgets'].map(dir=>({src:`node_modules/cesium/Build/Cesium/${dir}`,dest:'cesium',rename:{stripBase:4}}))})],
  build: {rollupOptions:{output:{manualChunks:{cesium:['cesium']}}}},
});
