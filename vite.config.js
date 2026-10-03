import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `vite --mode demo` swaps the real Supabase client for an in-browser mock
// (demo/mockSupabase.js) so the app can be clicked through without a project.
const demoSupabase = {
  name: 'demo-supabase',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
    if (resolved?.id.endsWith('/src/lib/supabase.js')) {
      return fileURLToPath(new URL('./demo/mockSupabase.js', import.meta.url));
    }
    return null;
  },
};

const VENDOR_CHUNKS = {
  react: ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'],
  supabase: ['@supabase/'],
  motion: ['motion', 'framer-motion', 'motion-dom', 'motion-utils'],
  icons: ['@phosphor-icons/react'],
  voice: ['@elevenlabs/', 'livekit-client'],
};

export default defineConfig(({ mode }) => ({
  plugins: [react(), mode === 'demo' && demoSupabase].filter(Boolean),
  server: { port: 5173 },
  build: {
    // The "voice" chunk (ElevenLabs + LiveKit WebRTC, ~630 kB) only loads when someone
    // opens Support, so it never slows the first page load.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          const pkg = id.split('node_modules/').pop();
          for (const [chunk, prefixes] of Object.entries(VENDOR_CHUNKS)) {
            if (prefixes.some((p) => pkg === p || pkg.startsWith(p.endsWith('/') ? p : `${p}/`))) return chunk;
          }
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
}));
