/**
 * Ponytail always-on ruleset, adapted from upstream ponytail's `AGENTS.md`
 * (the mode-independent ladder), read from the shipped `assets/ruleset.md`
 * like the skill bodies. The `/ponytail` section prepends a mode header;
 * `off` renders nothing.
 *
 * @module dsh-ponytail/ruleset
 */

import { readFileSync } from 'node:fs'
import type { RuntimeMode } from './mode.ts'

/** The shipped ruleset body, read verbatim at plugin load. */
const RULESET_URL = new URL('../assets/ruleset.md', import.meta.url)

/** Mode-independent ladder body. */
export const RULESET: string = readFileSync(RULESET_URL, 'utf8')

/**
 * Compose the full section text for an active mode.
 * @param mode - active runtime mode; `off` yields an empty section.
 * @returns the header plus the shared ladder body, or `''` when off.
 */
export function sectionText(mode: RuntimeMode): string {
  if (mode === 'off') return ''
  return `PONYTAIL MODE ACTIVE — level: ${mode}\n\n` + RULESET
}
