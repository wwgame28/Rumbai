import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const apiPort = Number(process.env.API_PORT ?? 8787);
/** Files larger than this (the WebLLM runtime) are cached on first use instead of at install. */
const PRECACHE_MAX_BYTES = 600 * 1024;

/** Emits sw.js with this build's asset list and a content-derived version. */
function serviceWorker(): Plugin {
  let base = '/';
  return {
    name: 'rumbai-service-worker',
    apply: 'build',
    configResolved(config) {
      base = config.base;
    },
    generateBundle(_options, bundle) {
      const all: string[] = [`${base}index.html`, `${base}offline.html`, `${base}manifest.webmanifest`];
      const precache: string[] = [...all];
      const hash = createHash('sha256');
      for (const [fileName, output] of Object.entries(bundle)) {
        if (fileName.endsWith('.map')) continue;
        const path = `${base}${fileName}`;
        const size = output.type === 'chunk' ? output.code.length : typeof output.source === 'string' ? output.source.length : output.source.byteLength;
        hash.update(fileName);
        all.push(path);
        if (size <= PRECACHE_MAX_BYTES) precache.push(path);
      }
      for (const icon of ['icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].map((f) => `${base}icons/${f}`)) {
        all.push(icon);
        precache.push(icon);
      }
      const source = readFileSync(new URL('./pwa/sw.template.js', import.meta.url), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__BASE__', base)
        .replace('__PRECACHE__', JSON.stringify([...new Set(precache)]))
        .replace('__ALL_ASSETS__', JSON.stringify([...new Set(all)]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  server: {
    host: true,
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  preview: {
    proxy: { '/api': `http://127.0.0.1:${apiPort}` },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 7000,
  },
});
