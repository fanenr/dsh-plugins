# dsh-ui-patch

Local UI corrections for dsh, shipped as one plugin.

Two small "dsh does X, I want Y" fixes that share one deployment story:

1. **Conversation width** — replace the drag handles with a setting.
2. **Menu and dialog chords** — move an open menu's selection with `Ctrl+P` /
   `Ctrl+N`, and close a menu or the top dialog with `Ctrl+G`.

## Conversation width

dsh draws two hover-revealed drag handles at the edges of the conversation
column; hovering near them reveals a glow bar, and dragging one resizes the
transcript. This plugin hides both handles and lets you set the transcript
width from **Settings → General → Conversation width** instead.

- **The handles are gone.** Hovering the column edges no longer reveals
  anything.
- **The width is a percentage.** Enter an integer between 30 and 100; the
  transcript, the dock cards, and the takeover frames all follow, as they
  already share one width axis. The percentage is taken against the
  conversation column, so the reading width keeps its proportion when you
  resize the window or collapse the sidebar.
- **Empty means adaptive.** Clear the input to hand the width back to dsh's own
  clamp (64% of the column, floored at 680px and capped at 920px).
- **Dragged widths stop applying.** The built-in preference in
  `localStorage['dsh.conversation.contentWidth']` is neutralized, so a width
  you dragged before installing this plugin cannot outrank the setting. The key
  itself is left untouched — removing the plugin restores the old behavior.

## Menu and dialog chords

Emacs muscle memory: `Ctrl+P` is the previous row, `Ctrl+N` the next one, and
`Ctrl+G` quits — closing what is open. The movement keys work in every menu dsh
renders; the dismissal key works on menus and dialogs alike.

- **Three rows in the shortcut reference.** They appear under **Menus and
  dialogs** as read-only entries, next to the existing `↑` / `↓` / `Esc` rows.
- **In a menu, the keys move the selection.** The plugin replays the arrow key
  the menu already handles, so navigation behaves exactly as `↑` / `↓` does,
  including wrapping at the ends and the pointer-hover/keyboard highlight
  sharing one position. Nothing reimplements navigation.
- **`Ctrl+G` closes what is open.** It replays Escape, which is what dsh's menu
  primitive and its modal layer both listen for — so it closes a dropdown, the
  command card, the model picker, or a dialog, and keeps the existing layering:
  a menu open inside a dialog closes first, and a second press closes the
  dialog underneath.
- **Outside a menu or dialog, nothing changes.** Neither chord is intercepted
  when nothing is open, so the page keeps its own meanings. In particular
  `Ctrl+G` does not manufacture an Escape on a bare page, where Escape is the
  conversation's double-press stop gesture.
- **Control, not the platform modifier.** macOS users get `Ctrl+P` / `Ctrl+N` /
  `Ctrl+G` rather than `Cmd`-based chords: Command belongs to the browser, and
  these are meant as a second way to reach what the arrow and Escape keys
  already reach — not as a replacement for any Command chord.

### The permission panel is deliberately excluded

Escape in the permission (approval) panel **rejects the tool request** rather
than dismissing a surface. A chord that silently answered "no" to a permission
prompt would be a footgun, so `Ctrl+G` refuses to dispatch Escape while focus is
in that panel — checked twice, by surface selector and again at dispatch time.
`Ctrl+P` / `Ctrl+N` are unaffected there; the panel has no menu to move in.

### Where the keys actually arrive

| Chord | Web in a browser | Desktop (native) |
| --- | --- | --- |
| `Ctrl+G` | yes | yes |
| `Ctrl+P` | yes | yes |
| `Ctrl+N` | usually no | yes |

Chromium delivers `Ctrl+P` (its print dialog is preventable) and `Ctrl+G`, but
reserves `Ctrl+N` for a new window, so the plugin cannot see that one in a
browser tab. The reservation still lists all three — that is what keeps the
reference honest about what dsh owns.

### Yielding to another owner

A shortcut reservation is exclusive, so claiming a combination another command
holds would disable *that* command. `ui-sidebar-files` binds `primary+KeyP`,
which is `Ctrl+P` wherever `primary` means Control, so the plugin asks the live
catalog before reserving anything and yields a chord that is already taken.
That check is a live reconciliation rather than a one-time test, because command
owners activate in an order this plugin does not control.

## Files

- `src/shared.ts` — the namespace both halves and both features share.
- `src/width.ts` — the DOM-free width rules.
- `src/keys.ts` — the DOM-free chord table: which key each chord claims,
  which surfaces it may fire on, and the replay shape.
- `src/client/index.ts` — both features' browser wiring.
- `src/client/WidthRow.tsx`, `src/client/styles.ts`, `src/client/locales.ts` —
  the Settings row, the owned stylesheet, and the dictionaries.
- `tests/` — the pure rules, the Host half, and the client integration driven
  against service stubs through the built bundle.
