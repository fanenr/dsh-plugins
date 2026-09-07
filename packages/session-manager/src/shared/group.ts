/**
 * Project grouping for the manager list. Pure and host-agnostic so both
 * halves (and the tests) share one ordering rule.
 *
 * @module dsh-session-manager/shared-group
 */

import type { SessionManagerRow } from './types'

/** One project group in display order. */
export interface SessionGroup {
  /** Project directory basename; null groups rows without a cwd. */
  project: string | null
  /** Rows in the host's original order (newest-first). */
  rows: SessionManagerRow[]
}

/**
 * Group rows by their project basename. Named groups sort alphabetically
 * (case-insensitive), the unnamed group lands last. Inside every group,
 * unarchived sessions come before archived ones, each ordered by recency
 * (newest lastActivity first).
 * @param rows - list rows in host order.
 * @returns one group per distinct project.
 */
export function groupRowsByProject(rows: readonly SessionManagerRow[]): SessionGroup[] {
  const groups = new Map<string, SessionGroup>()
  for (const row of rows) {
    const key = row.project ?? ''
    let group = groups.get(key)
    if (group === undefined) {
      group = { project: row.project, rows: [] }
      groups.set(key, group)
    }
    group.rows.push(row)
  }
  for (const group of groups.values()) {
    group.rows.sort(byArchivedThenActivity)
  }
  return [...groups.values()].sort((left, right) => {
    if (left.project === null) return right.project === null ? 0 : 1
    if (right.project === null) return -1
    return left.project.toLowerCase().localeCompare(right.project.toLowerCase())
  })
}

/** Unarchived first; within each class, newest activity first. */
function byArchivedThenActivity(left: SessionManagerRow, right: SessionManagerRow): number {
  if (left.archived !== right.archived) return left.archived ? 1 : -1
  return right.lastActivity - left.lastActivity
}
