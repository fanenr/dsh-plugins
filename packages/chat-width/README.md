# dsh-chat-width

Replace the conversation width drag handles with a setting.

dsh draws two hover-revealed drag handles at the edges of the conversation
column; hovering anywhere near them reveals a glow bar, and dragging one
resizes the transcript. This plugin hides both handles and lets you set the
transcript width from **Settings → General → Conversation width** instead.

## Behavior

- **The handles are gone.** Both the left and the right handle are hidden, so
  hovering the column edges no longer reveals anything.
- **The width is a percentage.** Enter an integer between 30 and 100 in the
  row; the transcript, the dock cards, and the takeover frames all follow, as
  they already share one width axis. The percentage is taken against the
  conversation column, so the reading width keeps its proportion when you
  resize the window or collapse the sidebar.
- **Empty means adaptive.** Clear the input to hand the width back to dsh's own
  clamp (64% of the column, floored at 680px and capped at 920px).
- **Dragged widths stop applying.** The built-in preference in
  `localStorage['dsh.conversation.contentWidth']` is neutralized, so a width
  you dragged before installing this plugin cannot outrank the setting. The key
  itself is left untouched — uninstalling restores the old behavior.

The preference lives in the `chat-width` profile entry's live configuration,
not in `localStorage`, so it travels with the rest of your settings.

## Layout

| Path | Role |
|---|---|
| `src/shared.ts` | Width rules the browser half injects, plus the value helpers |
| `src/index.ts` | Host half: declares the live `chat-width` configuration |
| `src/client/index.ts` | Browser half: stylesheet, form subscription, Settings row |
| `src/client/styles.ts` | Owned style tag (row chrome + width rules) |
| `src/client/SettingsRow.tsx` | The General settings row |
| `src/client/locales.ts` | zh/en dictionaries |
| `tests/` | Node tests over the built artifacts |

The whole visual effect is CSS. The percentage rule keys off
`--dsh-conversation-column-width`, which ui-conversation already publishes on
the conversation root through its own ResizeObserver, so no observer is
duplicated here.

## Install

The package is unpublished, so link the local checkout into the profile:

```sh
dsh plugin --profile <name> add link:plugins/dsh-plugins/packages/chat-width
```

The row appears under **Settings → General**; edits apply live, no restart.
The handles are hidden as soon as the client half loads.

## Develop

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```
