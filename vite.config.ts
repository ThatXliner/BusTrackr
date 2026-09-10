import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({base:mode==='production'?'/BusTrackr/':'/',plugins:[react()],build:{rollupOptions:{output:{manualChunks:{three:['three']}}}}}));
