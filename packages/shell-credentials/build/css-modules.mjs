/**
 * esbuild CSS Modules loader, reproducing what dsh's own client-bundle preset
 * does with lightningcss: a `.module.css` import becomes a module that injects
 * one style tag carrying the compiled CSS and default-exports the hashed class
 * map. Class names are hashed with the same `[hash]_[local]` pattern, and the
 * tag carries the same `data-plugin` / `data-plugin-css` attributes, so this
 * card's stylesheet sits in the page exactly like a builtin plugin's.
 */

import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { transform } from 'lightningcss'

const NAMESPACE = 'dsh-css-module'

/** Tag identity: `<plugin id>/<stylesheet basename>`, as the framework stamps it. */
function tagId(pluginId, fileId) {
  return `${pluginId}/${basename(fileId)}`
}

/**
 * Build the plugin for one bundle id.
 * @param pluginId - the id stamped on owned style tags.
 * @returns an esbuild plugin resolving `.module.css` imports.
 */
export function cssModules(pluginId) {
  return {
    name: 'dsh-css-modules',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, args => ({
        path: resolve(dirname(args.importer), args.resolvedPath ?? args.path),
        namespace: NAMESPACE,
      }))
      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, async (args) => {
        const source = await readFile(args.path)
        const { code, exports: cssExports } = transform({
          filename: args.path,
          code: source,
          cssModules: { pattern: '[hash]_[local]' },
          minify: true,
        })
        const classMap = {}
        for (const [local, exported] of Object.entries(cssExports ?? {})) classMap[local] = exported.name
        const id = JSON.stringify(tagId(pluginId, args.path))
        const contents = [
          `const css = ${JSON.stringify(code.toString())};`,
          `const tagId = ${id};`,
          'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
          '  const tag = document.createElement(\'style\');',
          `  tag.dataset.plugin = ${JSON.stringify(pluginId)};`,
          '  tag.dataset.pluginCss = tagId;',
          '  tag.textContent = css;',
          '  document.head.appendChild(tag);',
          '}',
          `export default ${JSON.stringify(classMap)};`,
        ].join('\n')
        return { contents, loader: 'js', resolveDir: dirname(args.path) }
      })
    },
  }
}
