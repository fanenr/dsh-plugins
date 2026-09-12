# dsh-session-manager

Manage every session of this profile from a **Settings page**: preview
conversations, toggle archive state, and permanently delete sessions
(recursively — child subagent sessions go with their parent).

The page appears under **Settings → Sessions** and rides the authenticated
`/api/session-manager` route, so no restart is needed after install.

## Features

- **Session table** — title, last activity, running/archived badges, and
  per-row actions. Groups are labeled by the workspace's editable title
  (directory basename for unregistered directories). Subagent sessions are
  managed through their parent and stay out of the list. The list refreshes
  live on session add/remove/status/activity and workspace renames.
- **Preview** — read the last few messages of any session (including
  subagent sessions) without opening it.
- **Archive toggle** — the harness's own archive set, so the sidebar
  refreshes live. The built-in sidebar can only archive (never unarchive);
  this page toggles both directions.
- **Permanent delete** — risk-confirmed, removes the session log directory,
  projection-cache row, and workspace accounting. Recursively deletes child
  subagent sessions. Irreversible. A session that is live in the host refuses
  deletion (see Safety).

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

- **A session that is live in the host refuses deletion.** Note that "live"
  is not "running": dsh web resumes an agent the moment a session is opened
  and never evicts it, so a session stays live for the life of the process
  even when idle. Deleting its files would break every later append — the log
  directory is only created by first materialization, so appends then fail
  `ENOENT`. No RPC, button, or setting stops a live session: **restart
  `dsh web`, then delete it before opening that conversation again.** The
  refusal says which case applies; a running turn is aborted by that restart.
- **A session whose write lease another dsh process holds refuses deletion.**
  The in-process store cannot see a sibling process, so the delete claims the
  session's cross-process write lease (the same kernel lock the harness uses)
  before removing anything, and holds it across the removal. This closes the
  window where deleting under a live sibling writer would tear its log.
- Blank drafts (live, idle sessions whose log has never opened a turn) are
  hidden from the manager list, mirroring the sidebar: they are the
  provisional New Session placeholders, and they have no reliable delete
  path while live. They disappear from both lists once they receive input,
  and can be deleted normally after a profile restart.
- A session whose log directory cannot be found refuses to delete rather
  than silently leaving a ghost.
- A corrupt or unreadable log stays deletable: only an ownership conflict
  refuses, and deleting a broken log is exactly the remedy.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
