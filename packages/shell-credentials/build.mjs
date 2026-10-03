import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { cssModules } from './build/css-modules.mjs'

rmSync('lib', { recursive: true, force: true })

const tsc = process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
execFileSync(tsc, ['-p', 'tsconfig.json'], { stdio: 'inherit' })
// tsc emits src/client's multi-file JS only for declarations; it is never
// referenced. It must not survive either: the host half imports nothing from
// here, and keeping it would let a browser-only dependency (primitives pulls
// clsx) leak into the Node half's module graph.
rmSync('lib/client', { recursive: true, force: true })

const PLUGIN_ID = 'dsh-shell-credentials'

// The browser module table answers exactly these names; a require it cannot
// answer throws, so nothing else may stay external. Type-only harness imports
// are erased by tsc and never reach here.
const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2024'],
  sourcemap: true,
  jsx: 'automatic',
  external: [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  // `.module.css` follows dsh's own client-bundle pipeline: hashed class names
  // and one injected, plugin-tagged style tag per stylesheet.
  plugins: [cssModules(PLUGIN_ID)],
  banner: {
    js: `window.__ModuleLoader__.load({ id: '${PLUGIN_ID}', factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
