import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { settingsNamespace, type SettingsScope } from '@deepseek-ai/dsh-settings'
import type { ContinuableStartSpec, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type { AgentOptions } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-loop'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'

export const SUBAGENT_DEFAULT_MODEL_NAMESPACE = settingsNamespace('subagent-default-model')

export const SubagentDefaultModelSchema = z.object({
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
})

export interface SubagentDefaultModel {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export const name = 'dsh-subagent-default-model'

export const inject = ['settings', 'subagents']

/** Composition base for the namespace (provider/model; effort is user-only). */
export interface Config {
  provider?: string
  model?: string
}

export const Config = z.object({
  provider: z.string(),
  model: z.string(),
})

/** Fill `agentOptions` from the configured default, leaving explicit options alone. */
export function applyDefault<R extends { agentOptions?: AgentOptions }>(request: R, settings: SettingsScope<SubagentDefaultModel>): R {
  if (request.agentOptions !== undefined) return request
  const selection = settings.get()
  if (selection === undefined) return request
  const { provider, model } = selection
  if (provider === undefined && model === undefined) return request
  return {
    ...request,
    agentOptions: {
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
    },
  }
}

/** Brand and apply the configured reasoning effort, keeping an unchanged config identical. */
export function withReasoningEffort<C extends { reasoningEffort?: unknown }>(proposed: C, effort: string): C {
  const branded = ReasoningEffortId(effort)
  if (proposed.reasoningEffort === branded) return proposed
  return { ...proposed, reasoningEffort: branded }
}

export function apply(ctx: Context, config?: Config): void {
  ctx.effect(() => {
    const scope = ctx.settings.register(SUBAGENT_DEFAULT_MODEL_NAMESPACE, SubagentDefaultModelSchema, {
      ...(config === undefined ? {} : { base: config }),
    })

    const subagents = ctx.subagents
    const originalStart = subagents.start
    const originalStartContinuable = subagents.startContinuable

    subagents.start = async (name: string, request: SubagentStartRequest) => {
      return originalStart.call(subagents, name, applyDefault(request, scope))
    }
    subagents.startContinuable = async (spec: ContinuableStartSpec) => {
      return originalStartContinuable.call(subagents, {
        ...spec,
        request: applyDefault(spec.request, scope),
      })
    }

    // reasoningEffort is not part of AgentOptions, so it rides the request
    // waterfall. The global host-plane listener fires before the agent-scoped
    // model-selection listener, so a configured effort wins over inheritance.
    const disposeRequest = ctx.on('agent/request', async (payload, next) => {
      if (payload.agent.session.header.origin !== 'subagent') return next()
      const effort = scope.get().reasoningEffort
      if (effort === undefined || effort === '') return next()
      return withReasoningEffort(await next(), effort)
    }, { global: true })

    return () => {
      disposeRequest()
      subagents.start = originalStart
      subagents.startContinuable = originalStartContinuable
    }
  }, 'dsh-subagent-default-model: subagent seam wrappers')
}
