# Ponytail Help

Display this reference card when invoked. One-shot, do NOT change mode or
persist anything.

## Levels

| Level | Trigger | What change |
|-------|---------|-------------|
| **Lite** | `/ponytail lite` | Build what's asked, name the lazier alternative in one line. |
| **Full** | `/ponytail` | The ladder enforced: YAGNI → stdlib → native → one line → minimum. Default. |
| **Ultra** | `/ponytail ultra` | YAGNI extremist. Deletion before addition. Challenges requirements before building. |

Level sticks until changed or the process restarts.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **ponytail** | `/ponytail` | Lazy mode itself. Simplest solution that works. |
| **ponytail-review** | `/ponytail-review` | Over-engineering review: `L42: yagni: factory, one product. Inline.` |
| **ponytail-audit** | `/ponytail-audit` | Whole-repo over-engineering audit: ranked list of what to delete. |
| **ponytail-debt** | `/ponytail-debt` | Harvest `ponytail:` shortcut comments into a tracked ledger. |
| **ponytail-gain** | `/ponytail-gain` | Measured-impact scoreboard: less code, less cost, more speed. |
| **ponytail-help** | `/ponytail-help` | This card. |

In DeepSeek Harness, `/ponytail` is the intensity command, while the other
five are skills the model loads by name (they also respond to the `/name`
slash gesture).

## Deactivate

`/ponytail off` disables the always-on ruleset; skills stay reachable by
explicit invocation. Resume anytime with `/ponytail` or
`/ponytail <level>`.

## Configure Default Mode

Default mode = `full`. The default is the `ponytail` settings namespace,
editable from **Settings → Plugins → Configurable plugins** (applies on
restart), or at runtime with `/ponytail default <level>` (same namespace).
The cordis.yml `config.defaultMode` is the composition base: the user layer
(card or command) always wins over it.

## More

Full upstream docs + examples: https://github.com/DietrichGebert/ponytail
