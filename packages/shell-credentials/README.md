# dsh-shell-credentials

Forward **your own** credential-shaped environment variables back into the
shell tools.

## The problem

dsh's subprocess seam strips every environment name matching
`/KEY|PASSWORD|SECRET|TOKEN/i` (`SENSITIVE_ENV_PATTERN` in
`@deepseek-ai/dsh-subprocess`). That is deliberate — the harness's own API key
must not leak implicitly into a child process. But it takes your tokens with
it, so the external clients an agent legitimately drives fail outright:

```
$ vendor-cli call catalog.list --args '{}'
[vendor-cli] Failed to resolve header 'Authorization' for server 'catalog':
Environment variable(s) VENDOR_API_TOKEN must be set for MCP header substitution.
```

`ShellExecRequest.env` is the framework's documented escape hatch — it merges
*after* the scrub, so a deliberately forwarded name survives. The builtin bash
tool never sets that field, so this plugin wraps `ctx.shell.resolve`, the last
seam every request passes through, and folds the forwarded names into each
request.

Names are read from the **Host process's own environment**. Desktop reads that
environment once at launch through an interactive login shell (`zsh -ilc`), so
`~/.zshrc` stays their only definition site — there is no second `tokens.env`
to maintain.

## Configuration

Both lists are editable in the form on the **Plugins page → dsh-shell-credentials**
(one variable name per line, then save), or directly in the profile patch:

```yaml
- id: shell-credentials
  name: dsh-shell-credentials
  config:
    exclude:
      - DEEPSEEK_API_KEY   # the harness's own provider key stays out
    include: []            # empty = select by /KEY|PASSWORD|SECRET|TOKEN/i
```

| Field | Default | Meaning |
|---|---|---|
| `include` | `[]` | Names to forward; when non-empty it is an allowlist that can reach past the regex above |
| `exclude` | `[]` | Never forwarded; highest priority |

`exclude` wins over `include`. A variable with no value or an empty value is
not forwarded — an empty placeholder fails a client exactly like a missing one.
Clearing a box **removes** that field's override (through `unset`) rather than
pinning an empty array over the schema default.

Surface metadata: `package.json`'s `icon` points at `icon.svg`, and the title
and one-line description the Plugins page shows come from the `meta` field in
`locale/en.json` and `locale/zh.json` — which is why the list reads "Shell
credentials" rather than the package name.

## Frontend: the same primitives a builtin plugin uses

The card is not a hand-rolled form; it reuses dsh's own settings-page building
blocks, so its appearance, interaction, and accessibility attributes match a
builtin plugin's:

| Purpose | What it uses |
|---|---|
| Form frame, save control, read-only/unavailable lines | `SettingsForm` (`@deepseek-ai/dsh-client-ui-primitives`) |
| Staging, dirty flag, invalid gate, unset-on-clear, drafts kept after a refused save | `SettingsFormModel` (same package) |
| Override badge and reset button | `Tag` plus the form model's `overridden` / `resetField` |
| Name-list input | A local `SettingsListField` — the shared control is a single-line input, and a name list is read as lines |

Only that last row is local, and it reproduces the shared field's structure
(label row, control, hint, invalid message). Its styling goes entirely through
design tokens (`--dsw-alias-*`, `--dsw-radius-*`) with no literal colors, so it
follows the theme.

CSS is a **CSS Module**: `ConfigCard.module.css`, compiled by
`build/css-modules.mjs` inside esbuild with lightningcss. Class names are hashed
with the framework's own `[hash]_[local]` pattern, and the module injects one
style tag carrying `data-plugin` / `data-plugin-css` ownership markers — the
same artifact shape a builtin plugin ships. (Builtins get this from the tsdown
preset; this repo builds with esbuild, so an equivalent loader stands in for
it.)

## Two names, easily confused

This bundle involves two identifiers that mean different things and **do not
hold the same value**:

| Name | Value | Appears in |
|---|---|---|
| Profile entry id / row id (**= settings namespace**) | `shell-credentials` | `- id:` in `cordis.patch.yml`, `configForms.get()` / `whileServed([…])` |
| Package name / bundle name | `dsh-shell-credentials` | The profile's `dependencies` and `bundles`, and the **key** of `plugins.bundle.config` |

The point is that equals sign in the first row: **a form is keyed by the
namespace `settings.describe` reports for that entry, and that namespace is the
entry id (the row id), not the package name.** Write the two differently and
`whileServed` waits forever for a namespace nothing owns, `slots.register` never
runs, and the page shows no form at all — reporting no error whatsoever.

That is not hypothetical: the first version of this plugin gave the client the
package name while the entry id was `tool-bash-env`, and the form was silently
gone for a full round. `tests/client.test.mjs` therefore **reads the entry id out
of `cordis.patch.yml`** and asserts that it is what the client watches, and that
it differs from the `plugins.bundle.config` key. Anyone making the two
inconsistent — a rename, an id change, copying this plugin — fails that test
immediately instead of discovering a missing form on the page.

## Boundaries

- Names are read once when the plugin mounts. **Restart dsh after exporting a
  new variable**; read `process.env` inside the wrapper if you ever need it live.
- Only names are logged, never values.
- This opens a door for the model's bash session: forwarded credentials are
  visible to it. Narrow `exclude`/`include` down to the few you actually need. A
  token written onto a command line still enters the conversation record — that
  is inherent to the tool, not introduced here.
- `ctx.shell.resolve` is a monkey patch on the service object (dsh's own plugins
  do the same) and is restored on unload. It does not replace the executor, so
  `bash-sandbox`'s sandbox policy still applies unchanged.

## Develop

```sh
pnpm typecheck && pnpm build && pnpm test
```
