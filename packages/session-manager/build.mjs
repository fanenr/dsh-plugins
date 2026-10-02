import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'

rmSync('lib', { recursive: true, force: true })

const tsc = process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
execFileSync(tsc, ['-p', 'tsconfig.json'], { stdio: 'inherit' })
// tsc emits src/client's multi-file JS only for declarations; it is never referenced.
rmSync('lib/client', { recursive: true, force: true })

// The browser module table answers exactly these names; a require it cannot
// answer throws, so nothing else may stay external. Type-only harness imports
// are erased by tsc and never reach here.
const external = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-renderer',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-slots',
  'react',
  'react/jsx-runtime',
]

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2024'],
  sourcemap: true,
  jsx: 'automatic',
  external,
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-session-manager', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
