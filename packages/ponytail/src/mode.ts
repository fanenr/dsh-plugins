/**
 * Runtime mode model shared by the ruleset section, the `/ponytail` command,
 * and the settings card. A mode is process-local intent: it starts from the
 * persisted default and can be switched live. `off` renders no ruleset and
 * keeps the skills reachable only by explicit invocation.
 *
 * @module dsh-ponytail/mode
 */

/** Runtime intensity levels; `review` is upstream's session-only skill alias and is not a mode here. */
export type RuntimeMode = 'off' | 'lite' | 'full' | 'ultra'

/** Default runtime level when config and settings carry none. */
export const DEFAULT_MODE: RuntimeMode = 'full'

/** Ordered valid runtime levels. */
export const RUNTIME_MODES: readonly RuntimeMode[] = ['off', 'lite', 'full', 'ultra']

/** Dropdown display order: intensities first, off last, `inherit` clears the override. */
export const MODE_ORDER: readonly string[] = ['lite', 'full', 'ultra', 'off', '']

/**
 * Normalize an arbitrary command argument to a runtime level.
 * @param value - candidate argument text.
 * @returns the runtime level, or `undefined` when it is not one.
 */
export function normalizeMode(value: string | undefined): RuntimeMode | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return (RUNTIME_MODES as readonly string[]).includes(normalized) ? normalized as RuntimeMode : undefined
}
