# dsh-subagent-default-model

One settings section choosing the provider, model, and reasoning effort every
subagent delegation uses when the delegation carries no explicit
`agentOptions`. Explicit per-tool configuration always wins.

## Priority

1. The delegation tool's explicit `agentOptions` (a preset pinning its own
   provider/model) — never overridden.
2. This plugin's `subagent-default-model` settings section.
3. Parent-agent model inheritance (dsh's built-in default).

## Install

```sh
dsh plugin --profile <name> add dsh-subagent-default-model
```

The card appears under **Settings → Plugins → Configurable plugins**, keyed by
the `subagent-default-model` namespace. Edits apply live on the next subagent
start; no restart is needed.

## Develop

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```
