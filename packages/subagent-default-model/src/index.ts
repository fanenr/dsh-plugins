/**
 * dsh-subagent-default-model: choose the model route every subagent
 * delegation uses.
 *
 * One host-half function plugin that (1) registers the
 * `subagent-default-model` settings namespace (a route + optional reasoning
 * effort) and (2) wraps `ctx.subagents.start/startContinuable` so each
 * delegation request carries the configured route.
 *
 * Priority contract (highest wins):
 * - A configured (non-empty provider+model) route FORCES its route onto the
 *   request, overriding anything dsh's native chain put there (model
 *   selection, tool-subagent config, parent inheritance). An optional
 *   configured effort rides the forced route; an empty effort lets the
 *   route's own default take over. The Host resolves and preflights the
 *   child LLM route before `subagents.start` is called, so a forced override
 *   lands after that preflight: the preflighted route is validated, the
 *   forced route is what actually runs.
 * - An empty route ("built-in") leaves the request untouched, so the native
 *   chain decides: session model selection > tool config > parent
 *   inheritance > agent-default-model. Effort defers with it.
 *
 * Empty strings mean "built-in" so the user document can store all three
 * keys without tri-state sentinels.
 *
 * @module dsh-subagent-default-model
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { ContinuableStartSpec, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'

/** Settings namespace the configuration card edits. */
export const SETTINGS_NS = 'subagent-default-model'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-subagent-default-model'

/** Services this plugin requires. */
export const inject = ['settings', 'subagents']

/** The stored section: empty string means "built-in" (defer to dsh). */
export interface Settings {
  /** Provider route; empty defers the whole route to the native chain. */
  provider: string
  /** Model id under {@link Settings.provider}; kept in lockstep with it. */
  model: string
  /** Adapter-owned reasoning effort; empty defers to the route's default. */
  reasoningEffort: string
}

/** Schema: all-optional strings defaulting to the empty built-in marker. */
export const Settings: Schema<Settings> = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
  reasoningEffort: z.string().default(''),
})

/** Composition base for the namespace (route only; effort is user-owned). */
export interface Config {
  /** Provider route; empty defers to the native chain. */
  provider?: string
  /** Model id under {@link Config.provider}. */
  model?: string
}

/** Standard-schema validation for the plugin config. */
export const Config: Schema<Config> = z.object({
  provider: z.string().default(''),
  model: z.string().default(''),
})

/** Whether a stored route is explicit (non-empty provider AND model). */
export function hasExplicitRoute(settings: Pick<Settings, 'provider' | 'model'>): boolean {
  return settings.provider !== '' && settings.model !== ''
}

/**
 * Fold the configured default onto one delegation request. An explicit route
 * forces provider/model; a configured effort rides it (the route's own
 * default when effort is empty). When the route is built-in, nothing is
 * forced — the native chain (model selection, tool config, parent
 * inheritance, agent-default-model) decides, and effort defers with it.
 * The Host preflights the child LLM route before this wrapper runs, so a
 * forced route is applied after that preflight and supersedes it.
 * @param request - the delegation request assembled by the caller.
 * @param settings - the resolved settings section.
 * @returns the request with the configured values folded in.
 */
export function applyDefault<R extends { agentOptions?: AgentOptions }>(request: R, settings: Settings): R {
  if (!hasExplicitRoute(settings)) return request
  const agentOptions: AgentOptions = { ...request.agentOptions }
  agentOptions.provider = settings.provider
  agentOptions.model = settings.model
  // A forced route must not keep an effort the previous route owned: let
  // the new route's default effort take over unless one is configured.
  if (settings.reasoningEffort === '') delete agentOptions.reasoningEffort
  else agentOptions.reasoningEffort = ReasoningEffortId(settings.reasoningEffort)
  return { ...request, agentOptions }
}

/** Apply to a continuable spec's inner request. */
export function applySpec(spec: ContinuableStartSpec, settings: Settings): ContinuableStartSpec {
  return { ...spec, request: applyDefault(spec.request, settings) }
}

export function apply(ctx: Context, config?: Config): void {
  ctx.effect(() => {
    // The composition base carries the deployment-configured route; the user
    // layer and the built-in empty marker layer above it.
    const scope: SettingsScope<Settings> = ctx.settings.register(SETTINGS_NS, Settings, {
      base: { provider: config?.provider ?? '', model: config?.model ?? '' },
      applies: 'live',
    })

    const subagents = ctx.subagents
    const originalStart = subagents.start
    const originalStartContinuable = subagents.startContinuable

    subagents.start = async (startName: string, request: SubagentStartRequest) => {
      return originalStart.call(subagents, startName, applyDefault(request, scope.get()))
    }
    subagents.startContinuable = async (spec: ContinuableStartSpec) => {
      return originalStartContinuable.call(subagents, applySpec(spec, scope.get()))
    }

    return () => {
      subagents.start = originalStart
      subagents.startContinuable = originalStartContinuable
    }
  }, 'dsh-subagent-default-model: subagent seam wrappers')
}
