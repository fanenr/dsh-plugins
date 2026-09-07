/**
 * Parser-side data proofs for Host-side values read from the harness's own
 * services. Everything here is total: a hostile or corrupted value never
 * throws — it degrades to a safe fallback (unknown/false/skipped).
 *
 * @module dsh-session-manager/host-parsing
 */

/** Narrow any value to a plain record, or null. */
export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/** Narrow any value to a non-empty string, or null. */
export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Narrow any value to a finite number, or null. */
export function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
