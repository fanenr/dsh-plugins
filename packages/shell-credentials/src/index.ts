/**
 * dsh-shell-credentials: restore credential-shaped environment variables in the
 * model-facing shell tools.
 *
 * dsh's subprocess seam forwards the parent environment minus every
 * credential-shaped name (`SENSITIVE_ENV_PATTERN` = `/KEY|PASSWORD|SECRET|TOKEN/i`)
 * and minus every `DSH_*` name. That is deliberate — the harness's own API keys
 * must not leak into an implicitly spawned child — but it also drops the user's
 * own tokens, which the Desktop login-shell read did capture into the Host
 * environment. Tools that this agent legitimately drives (cloud CLIs, MCP
 * wrappers, authenticated helper commands) then fail on a missing credential.
 *
 * `ShellExecRequest.env` is the framework's documented escape hatch: it merges
 * *after* the scrub, so a deliberately forwarded name survives. The builtin
 * bash tool never sets it, so this plugin wraps `ctx.shell.resolve` — the last
 * seam every request passes through — and folds the forwarded names into the
 * request before the executor builds its spec.
 *
 * The forwarded names come from the Host's own environment, so the user keeps
 * exactly one definition site (`~/.zshrc`); no second token file to maintain.
 * The Host environment is fixed at launch, so a variable exported after launch
 * reaches the shell tools only after a restart.
 *
 * @module dsh-shell-credentials
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import z from '@deepseek-ai/schemastery'

/** Plugin identity, used as the cordis bundle entry name. */
export const name = 'dsh-shell-credentials'

/** Services this plugin requires. */
export const inject = ['shell']

/**
 * The credential-shape heuristic dsh's subprocess seam scrubs with. An empty
 * `include` forwards exactly the names that heuristic would otherwise drop, so
 * the plugin and the scrub stay in agreement without a second list.
 */
export const CREDENTIAL_SHAPE = /KEY|PASSWORD|SECRET|TOKEN/i

/** Live configuration; every field is form-editable. */
export interface Config {
  /** Names to forward; empty forwards every credential-shaped name. */
  include: Volatile<string[]>
  /** Names never forwarded; always wins over {@link Config.include} and the heuristic. */
  exclude: Volatile<string[]>
}

/**
 * Live configuration schema. Its shape is the profile patch's `config` block,
 * and `volatile()` on each list is what lets the Host serve a live settings
 * form for this entry at all — a field without it makes `settings.describe`
 * skip the entry and the browser half's page never registers.
 */
export const Config = z.object({
  include: z.array(z.string()).default([]).volatile(),
  exclude: z.array(z.string()).default([]).volatile(),
})

/** A resolved forwarding rule, read once when the wrappers are installed. */
interface ForwardRule {
  /** Names to forward; empty selects by {@link CREDENTIAL_SHAPE}. */
  readonly include: readonly string[]
  /** Names never forwarded. */
  readonly exclude: readonly string[]
}

/**
 * Select the entries of one environment to forward. Values are copied verbatim;
 * an absent or empty value forwards nothing, because a placeholder that resolves
 * to an empty string fails the same way a missing one does.
 * @param source - the environment to read (the Host's own `process.env`).
 * @param rule - the resolved forwarding rule.
 * @returns a fresh map safe to hand to the shell executor, sorted by name.
 */
export function resolveForwarded(
  source: Readonly<Record<string, string | undefined>>,
  rule: ForwardRule,
): Record<string, string> {
  const excluded = new Set(rule.exclude)
  const forwarded: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === '') continue
    if (excluded.has(key)) continue
    if (rule.include.length > 0 ? !rule.include.includes(key) : !CREDENTIAL_SHAPE.test(key)) continue
    forwarded[key] = value
  }
  return forwarded
}

/**
 * Fold the forwarded entries into one request. The caller's own {@link ShellExecRequest.env}
 * wins per name: a trusted in-process caller (a hooks bridge, another plugin)
 * named that value deliberately, and this plugin only restores what the scrub
 * dropped, so it must never displace a live decision.
 * @param request - the caller's request, passed through untouched when nothing is forwarded.
 * @param forwarded - entries selected by {@link resolveForwarded}.
 * @returns the request carrying the merged `env`.
 */
export function withForwardedEnv(request: ShellExecRequest, forwarded: Readonly<Record<string, string>>): ShellExecRequest {
  if (Object.keys(forwarded).length === 0) return request
  return { ...request, env: { ...forwarded, ...request.env } }
}

/**
 * Wrap `ctx.shell.resolve` so every shell request — model-facing bash, background
 * jobs, in-process plugin commands — carries the forwarded names, and restore the
 * original method when this fiber unloads.
 *
 * Wrapping `resolve` rather than `execute` keeps the executor's own precedence
 * intact and works unchanged over any executor: `bash-sandbox` stamps its sandbox
 * policy by calling `super.resolve(request)`, and the local executor copies
 * `request.env` onto the spec, where it merges after the scrub.
 * @param ctx - Host context providing the shell executor.
 * @param forwarded - entries to fold into every request.
 * @returns the disposer that restores the original method.
 */
export function installResolveWrapper(ctx: Context, forwarded: Readonly<Record<string, string>>): () => void {
  const shell = ctx.shell
  const original = shell.resolve
  shell.resolve = function resolve(request: ShellExecRequest): ShellExecSpec {
    return original.call(shell, withForwardedEnv(request, forwarded))
  }
  return () => {
    shell.resolve = original
  }
}

/**
 * Install the forwarding rule and log what it forwards. Names are logged, never
 * values.
 * @param ctx - Host context providing the shell executor and logger.
 * @param config - resolved live configuration.
 */
export function apply(ctx: Context, config: Config): void {
  const rule: ForwardRule = { include: config.include.get(), exclude: config.exclude.get() }
  const forwarded = resolveForwarded(process.env, rule)
  const names = Object.keys(forwarded).sort()
  ctx.effect(
    () => installResolveWrapper(ctx, forwarded),
    'dsh-shell-credentials: shell resolve wrapper',
  )
  if (names.length === 0) {
    ctx.logger.warn('dsh-shell-credentials: nothing to forward; export the names before launching dsh')
    return
  }
  // ponytail: the snapshot is taken once at mount, not per call. Restart dsh after
  // exporting a new name. Read `process.env` inside the wrapper if that ever matters.
  ctx.logger.info(`dsh-shell-credentials: forwarding ${String(names.length)} name(s) to shell tools: ${names.join(', ')}`)
}
