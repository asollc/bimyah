import { defineConfig } from 'vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    // Resolves the `@/*` path alias from tsconfig.json
    tsconfigPaths(),
    // Builds for Cloudflare Workers (see wrangler.jsonc)
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
  ],
});
