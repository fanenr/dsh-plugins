# dsh-session-manager

Manage every session of this profile from a **Settings page**: preview
conversations, toggle archive state, and permanently delete sessions
(recursively — child subagent sessions go with their parent).

The page appears under **Settings → Sessions** and rides an authenticated
Host channel (`connection.rpc`), so no restart is needed after install.

## Features

- **Session table** — title, last activity, running/archived badges, and
  per-row actions. Subagent sessions are managed through their parent and
  stay out of the list.
- **Preview** — read the last few messages of any session (including
  subagent sessions) without opening it.
- **Archive toggle** — the harness's own archive set, so the sidebar
  refreshes live. The built-in sidebar can only archive (never unarchive);
  this page toggles both directions.
- **Permanent delete** — risk-confirmed, removes the session log directory,
  projection-cache row, and workspace accounting. Recursively deletes child
  subagent sessions. Irreversible. Live sessions refuse deletion.

## Install

```sh
dsh plugin --profile <profile> add dsh-session-manager
```

Or, for a local checkout:

```sh
dsh plugin --profile <profile> add file:/path/to/dsh-session-manager
```

Restart the profile after install.

## Safety

- A live session refuses deletion — the harness keeps no public teardown path
  for a live agent, so deleting its files would strand the running agent on a
  ghost log. Stop the conversation (or restart the profile) and retry. A live
  descendant subagent refuses the whole family's deletion the same way.
- A session whose log directory cannot be found refuses to delete rather
  than silently leaving a ghost.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
