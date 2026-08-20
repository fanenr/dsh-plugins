// dsh-ponytail skills
//
// Ponytail skills as DSH runtime skills. The bodies are upstream
// skills/SKILL.md minus YAML frontmatter, adapted to DSH (host-specific
// activation/command wording replaced with the settings namespace and
// /ponytail command reality), read from the shipped assets/ directory like
// the built-in skill-badge provider. Each registers model- and user-invocable
// so the model can load them by name (via the skill tool) and users can invoke
// them through the /name slash gesture.

import { readFileSync } from 'node:fs'
import type { SkillInvocationPolicy, SkillRegistration, SkillSource } from '@deepseek-ai/dsh-skill'

// Directory that ships the verbatim skill bodies next to the built bundle.
const ASSETS_DIR = new URL('../assets/', import.meta.url)

// Read one shipped skill body, verbatim.
function readAsset(file: string): string {
  return readFileSync(new URL(file, ASSETS_DIR), 'utf8')
}

// Registry input for one skill, rendered verbatim from its upstream body.
function skill(
  name: string,
  description: string,
  file: string,
  invocation: SkillInvocationPolicy = { modelInvocable: true, userInvocable: true },
): SkillRegistration {
  return { name, description, invocation, source: 'bundled' as SkillSource, content: readAsset(file) }
}

// The six ponytail skills. The "ponytail" skill itself is model-invocable only:
// the /ponytail slash token is owned by the intensity command, so the skill
// must not double-list in the user-facing '/' menu. The other five are plain
// skills, reachable through the /name slash gesture and the model's skill tool.
export const SKILLS: readonly SkillRegistration[] = [
  skill('ponytail', 'Forces the laziest solution that actually works: question whether the task needs to exist (YAGNI), reach for the standard library and native platform features before custom code or new dependencies, one line before fifty. Use on any coding task, or when the user says "ponytail", "be lazy", "lazy mode", "yagni", "do less", or complains about over-engineering or boilerplate. Do NOT use for non-coding requests.', 'ponytail.md', { modelInvocable: true, userInvocable: false }),
  skill('ponytail-review', 'Review the current diff for over-engineering only: dead code, reinvented stdlib, unneeded dependencies, speculative abstractions. One line per finding with what to cut and what replaces it. Complements a correctness review; does not apply fixes.', 'ponytail-review.md'),
  skill('ponytail-audit', 'Audit the whole repository for over-engineering: a ranked delete/simplify/replace-with-stdlib list. Like ponytail-review but repo-wide instead of a diff. One-shot report, applies nothing.', 'ponytail-audit.md'),
  skill('ponytail-debt', 'Harvest every `ponytail:` comment marking a deliberate shortcut into one debt ledger with each ceiling and upgrade trigger, so a deferral cannot quietly become permanent. Reads and reports only.', 'ponytail-debt.md'),
  skill('ponytail-gain', 'Show ponytail\'s measured impact as a compact scoreboard: less code, less cost, more speed, from the published benchmark medians. One-shot display; edits nothing and changes no mode.', 'ponytail-gain.md'),
  skill('ponytail-help', 'Quick-reference card for all ponytail modes, skills, and commands. One-shot display; not a persistent mode.', 'ponytail-help.md'),
]
