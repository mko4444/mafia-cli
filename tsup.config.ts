import { defineConfig } from 'tsup'

// Builds the single CLI entry into dist/index.js with a shebang so it runs as a
// bin. Runtime deps (ink, react, ws, @anthropic-ai/sdk, …) stay external and are
// installed by npm; only our own `~/*` source is bundled. `prepare` runs this on
// install, so `npx github:mko4444/mafia-cli` builds automatically on a fresh clone.
export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  banner: { js: '#!/usr/bin/env node' },
  clean: true,
  // Optional dep: keep it external and never bundle it, so a build (and the
  // join/client path) works even when it isn't installed.
  external: ['@anthropic-ai/sdk'],
})
