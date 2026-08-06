#!/usr/bin/env node
// Builds the dedicated publish worker into a self-contained CJS bundle.
// Only @prisma/client (generated, present in the runtime image) and node
// builtins are external; bull/ioredis/axios are bundled so the worker runs
// from the Next.js standalone node_modules without extra installs.
import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [path.join(root, 'worker/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: path.join(root, 'dist/worker/worker.js'),
  external: ['@prisma/client', 'next', 'bull', 'ioredis', 'node:*'],
  alias: { '@': root },
  logLevel: 'info',
  sourcemap: false,
})

console.log('[build-worker] -> dist/worker/worker.js')
