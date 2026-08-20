# dsh-chat-timeline

One right-edge conversation timeline rail enumerating every directly
user-sent message in the session, with hover previews and click-to-jump
navigation. Assistant replies and injected context rows never join the rail.

## How it works

The host half registers the `dshChatTimeline` session projection, a durable
enumeration of every user-sent message with preview text capped at 80
characters. The client half renders the `TimelineRail` component in the
`conversation.input.dock` slot, portal-rendered to body. The tail page's
projections block delivers the full enumeration up front; clicking an entry
pages the chat window back to its row.

## Install

```sh
dsh plugin --profile <name> add dsh-chat-timeline
```

## Develop

```sh
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
```

## License

MIT. Adapted from [jjxjjjjiik-bot/dsh-chat-timeline](https://github.com/jjxjjjjiik-bot/dsh-chat-timeline) (MIT),
whose rail reproduces the DeepSeek official web app's ScrollNav UI. "DeepSeek"
is a trademark of its owner; this project is not affiliated with DeepSeek.
