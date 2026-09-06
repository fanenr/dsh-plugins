# dsh-subagent-default-model

One settings card choosing the model route every subagent delegation uses.

## Priority

1. A configured route in this plugin's `subagent-default-model` settings
   section — forced onto every delegation, overriding the native chain
   (session model selection, tool config, parent inheritance,
   agent-default-model).
2. Built-in (an empty route) — defers entirely to dsh's native chain.

An optional configured reasoning effort rides the forced route; an empty
effort lets the route's own default take over.

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
