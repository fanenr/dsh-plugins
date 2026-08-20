/**
 * dsh-ponytail: lazy senior dev mode for DeepSeek Harness.
 *
 * One host-half function plugin that (1) contributes an always-on coding
 * ruleset to the system prompt at the active intensity, (2) registers the six
 * upstream ponytail skills as runtime skills, (3) owns the `/ponytail` command
 * that switches intensity process-wide, and (4) registers the `ponytail`
 * settings namespace so the default intensity is configurable from the plugin
 * configuration card.
 *
 * @module dsh-ponytail
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from '@deepseek-ai/dsh-commands'
import { sectionText } from './ruleset.ts'
import { SKILLS } from './skills.ts'
import { DEFAULT_MODE, RUNTIME_MODES, normalizeMode, type RuntimeMode } from './mode.ts'

export { DEFAULT_MODE, RUNTIME_MODES, normalizeMode } from './mode.ts'
export type { RuntimeMode } from './mode.ts'
export { sectionText, RULESET } from './ruleset.ts'
export { SKILLS } from './skills.ts'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-ponytail'

/** Settings namespace the plugin configuration card edits. */
export const SETTINGS_NS = 'ponytail'

/** Services this plugin requires; all are part of `@deepseek-ai/dsh-base`. */
export const inject = ['systemPrompt', 'skills', 'commands', 'settings']

/** Plugin configuration; `defaultMode` is the composition base of the settings namespace. */
export interface Config {
  /** Session-start intensity level; defaults to `full`. */
  defaultMode?: RuntimeMode
}

/** Standard-schema validation: an optional level, defaulting to `full`. */
export const Config: Schema<Config> = z.object({
  defaultMode: z.union([...RUNTIME_MODES]).default(DEFAULT_MODE),
})

/** The ruleset system-prompt section name. */
const SECTION_NAME = 'ponytail:ruleset'

/** The user-facing command name. */
export const PONYTAIL_COMMAND = 'ponytail'

/** One-line confirmation for a live switch, kept terse by design. */
function switchNotice(mode: RuntimeMode): string {
  if (mode === 'off') return 'Ponytail off.'
  return `Ponytail mode: ${mode}.`
}

/**
 * Register the ruleset section, the six skills, the `/ponytail` command, and
 * the settings namespace.
 * @param ctx - host root context.
 * @param config - validated plugin config; see {@link Config}.
 */
export function apply(ctx: Context, config: Config): void {
  // The default intensity resolves from the settings namespace (schema default
  // → composition base `config.defaultMode` → user layer). The live mode starts
  // there and only `/ponytail <level>` moves it; a card edit changes the
  // default for the next boot, not the running process.
  const scope = ctx.settings.register(settingsNamespace(SETTINGS_NS), Config, {
    base: { defaultMode: config.defaultMode },
    applies: 'restart',
  })
  let currentMode: RuntimeMode = scope.get().defaultMode ?? DEFAULT_MODE

  ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: 30,
    text: () => sectionText(currentMode),
  })

  for (const registration of SKILLS) {
    ctx.skills.register(registration)
  }

  ctx.commands.register({
    name: PONYTAIL_COMMAND,
    description: 'Set ponytail lazy-coding intensity (lite/full/ultra/off), report status, or persist a default.',
    input: { hint: '[lite|full|ultra|off|status|default <mode>]' },
    handler: async ({ agent, rawInput }) => {
      const [word, arg] = rawInput.trim().split(/\s+/)

      if (word === 'status') {
        return { kind: 'success', text: `Ponytail mode: ${currentMode}.` }
      }

      if (word === 'default') {
        const mode = normalizeMode(arg)
        if (mode === undefined) {
          return { kind: 'error', text: `Usage: /ponytail default ${RUNTIME_MODES.join('|')}` }
        }
        await scope.update({ defaultMode: mode })
        return { kind: 'success', text: `Ponytail default set to ${mode} (applies on restart).` }
      }

      // A bare `/ponytail` reports the current level; anything else must be a
      // valid level to switch.
      const mode = word === undefined || word === '' ? currentMode : normalizeMode(word)
      if (mode === undefined) {
        return { kind: 'error', text: `Unknown ponytail argument "${word ?? ''}". Use ${RUNTIME_MODES.join('|')}, status, or default <mode>.` }
      }

      currentMode = mode
      // A live switch narrates the new level so the very next request assembles
      // under it. `/ponytail off` steering would itself be built under `off`, so
      // it is surfaced as plain command text instead.
      if (mode !== 'off') {
        agent.steer(createUserMessage({
          content: [{ type: 'text', text: switchNotice(mode) }],
          source: { kind: 'plugin', plugin: name, form: 'notice', summary: switchNotice(mode) },
        }))
      }
      return { kind: 'success', text: switchNotice(mode) }
    },
  })
}
