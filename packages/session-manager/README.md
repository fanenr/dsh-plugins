# dsh-session-manager

Manage every session of this profile from a **Settings page**: preview
conversations, toggle archive state, and permanently delete sessions
(recursively — child subagent sessions go with their parent). The table groups
sessions by workspace, and every group collapses.

The page appears under **Settings → Sessions** and rides the authenticated
`/api/session-manager` route.

## Features

- **Session table** — title, last activity, running/archived badges, and
  per-row actions. Groups are labeled by the workspace's editable title
  (directory basename for unregistered directories) and collapse on a click of
  the group header; a collapsed group keeps its count and its select-all
  checkbox, and the collapse state lasts for the page visit. Subagent sessions
  are managed through their parent and stay out of the list; forks stay,
  because a fork is an independent conversation. The list is pulled on mount
  and after every mutation this page performs.
- **Preview** — project any session's conversation (including subagent
  sessions) without opening it: the human prompts and each turn's final
  surfaced answer, bounded to the newest 80 messages that fit.
- **Archive toggle** — the harness's own archive set through
  `workspaceRegistry`, so the sidebar refreshes live and the registry's pin
  rules stay intact. A session with running work is refused (the page shows
  the refusal) rather than archived with its turn cancelled: stopping work is
  destructive and the harness only does it behind a confirmation naming the
  activity, which this page does not offer.
- **Permanent delete** — risk-confirmed, removes the session log directory,
  projection-cache row, and workspace accounting (registry membership, archive
  entry, pin), and asks the harness to stop the reminders and jobs keyed by
  that session. Recursively deletes child subagent sessions. Irreversible.
  A session that is live in the host refuses deletion (see Safety).

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
  before removing anything and holds it until the last file is gone. The claim
  proves no sibling held the session at that moment; removing the directory
  takes `session.lock` with it, so it cannot exclude a sibling that starts
  afterwards.
- Blank drafts (live, idle sessions whose log has never opened a turn) are
  hidden from the manager list, mirroring the sidebar: they are the
  provisional New Session placeholders, and they have no reliable delete
  path while live. They disappear from both lists once they receive input,
  and can be deleted normally after a profile restart.
- A session whose log directory cannot be found refuses to delete rather
  than silently leaving a ghost.
- A corrupt or unreadable log stays deletable: only an ownership conflict
  refuses, and deleting a broken log is exactly the remedy.
- Deletion leaves two kinds of residue on purpose: attachment blobs under
  `$DSH_HOME/attachments/v1` (content-addressed and shared by reference, so
  nothing may collect them from here) and the workspace registry's in-memory
  session-path index, which stays warm for the process lifetime.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
