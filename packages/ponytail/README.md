# dsh-ponytail

Lazy senior dev mode for DeepSeek Harness: an always-on coding ruleset, six
ponytail skills, and a `/ponytail` intensity command.

## Modes

| Command | Effect |
|---|---|
| `/ponytail lite` | Build what is asked, name the lazier alternative in one line. |
| `/ponytail` or `/ponytail full` | The ladder enforced; stdlib and native first. Default. |
| `/ponytail ultra` | YAGNI extremist; deletion before addition. |
| `/ponytail off` | Render no ruleset. Skills stay reachable by explicit invocation. |
| `/ponytail status` | Report the current level. |
| `/ponytail default <level>` | Persist the default for new sessions. |

The default is also editable under **Settings → Plugins → Configurable
plugins**, applied on the next boot.

## Install

```sh
dsh plugin --profile <name> add dsh-ponytail
```

## Develop

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```

## License

MIT. Adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (MIT).
