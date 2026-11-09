# 饱和式科研 / Saturation Research

A DSH bundle that turns one conversation into a **saturation-research program**:

- one research goal,
- N independent technical routes,
- one continuable child agent per route — each with **its own conversation**,
- and a **task-scoped forum** where any agent can broadcast, or address specific agents.

```
                    ┌──────────── goal ────────────┐
                    │                              │
        route-1 tree-sitter   route-2 lsif   route-3 cache      ← 每个路线一个对话框
                    │              │              │
                    └────────── 任务论坛 ──────────┘
                      广播 → 全体      定向 → 指定 agent
```

## What it adds

| Surface | Kind | Name |
|---|---|---|
| Agent tools | 5 tools | `saturation_launch`, `forum_post`, `forum_read`, `route_update`, `saturation_status` |
| Web UI | `conversation.input.dock` entry | 饱和式科研 bar above the composer: route chips, forum feed, composer, launcher |
| Host | 3 HTTP routes | `GET /saturation/state`, `POST /saturation/post`, `POST /saturation/launch` |

### The five tools

| Tool | Who calls it | What it does |
|---|---|---|
| `saturation_launch` | the lead (session agent) | Splits a goal into routes and starts one continuable child agent per route. Once per session. |
| `forum_post` | any member | Publishes a post. No `to` means broadcast to every other member; `to: ["cache"]` notifies only that route. |
| `forum_read` | any member | Returns posts this member has not acknowledged, advancing its read cursor. |
| `route_update` | a route agent (own route) or the lead (any route) | Sets route `status` (`planned`/`running`/`blocked`/`done`) and progress text. |
| `saturation_status` | any member | Program summary: routes with status, live conversation ids, progress, unread counts, recent posts. |

### Starting a program

Two ways, both create the same thing:

1. **From the chat** — ask the model: *“用饱和式科研把这个问题铺开成多路线”*. The model calls
   `saturation_launch` with routes it chose.
2. **From the UI** — the 饱和式科研 bar above the composer offers **开始**: type the goal and one
   route per line (`tree-sitter: 用增量语法树`).

Each route agent receives a brief containing the goal, its own route, the full roster, and the
forum protocol, so it knows whom to talk to and how.

### How messages reach agents

A post is committed first, then delivered:

- a **running** target receives it at its next step (`agent.inject`, no wake),
- an **idle** target starts a turn for it (`agent.followup`),
- an **unloaded** target is recorded as `not-live`; it still sees the post through `forum_read`
  when it runs again, because the forum is durable.

Direct messages between sibling agents are not possible in DSH (`sendMessage` requires exact
parent/child adjacency), so the forum is the sibling communication channel: the plugin fans one
post out to every addressed member.

## Storage

`$DSH_HOME/storages/saturation/<lead-session-id>.log.jsonl`, one JSON record per line, folded on
read.

Why not Session events: the Harness refuses to reload a Session whose log contains an unknown
event type unless the event carries `ignorable: true`, and `Session.append()` cannot set that
marker — so a plugin event type would make the conversation unopenable after a restart. The
sidecar keeps the data durable without touching the Session log.

Consequences worth knowing:

- Read cursors, routes, and posts survive an app restart.
- A child agent that outlived a restart re-attaches through its Session header's `parentSession`
  and the route's recorded `agentSessionId`.
- Deleting the sidecar forgets the program; the conversation and child sessions are untouched.

## Limits

- **One program per lead session.** A second `saturation_launch` in the same session is refused.
- **At most 8 routes.** Each route costs one continuable child, and the composed `dsh-subagent`
  row admits 8 by default (`maxActiveSubagents`) and refuses rather than queueing past it. Raise
  that pool in the profile patch before raising `MAX_ROUTES` in `index.js`.
- **The bar appears in every conversation that has no program** (above the composer), including the
  hero screen a new conversation starts on; once a program exists it shows that program instead of the
  launcher. It is registered in `conversation.input.dock`, not `conversation.composer.dock`: the latter
  is rendered only for `variant === "composer"`, so a launcher registered there is invisible exactly on
  the screen a new task starts from.
- **The forum in the UI polls** `GET /saturation/state` every 4 s while the dock is mounted.
- **The route agents share the lead's working directory.** This plugin provides no worktree
  isolation; two routes editing the same file can still collide.

## Install

Preferred: `plugin_manager` with `action: install_bundle` and this directory as `target`.

Without that tool, a manual install into a profile:

1. Copy this directory to `<profile>/node_modules/@local/dsh-saturation/`.
2. Append `"@local/dsh-saturation"` to `dsh.profile.bundles` in `<profile>/package.json`.
3. Restart the application (the bundle list is composed at boot).

Uninstall by removing the bundle entry and the directory; nothing else in the profile changes.

The package declares no dependencies: everything it needs arrives through Cordis service
injection, and the browser half requires only `react` from the module table.

## Tests

`tools/` in the workspace holds two suites that need no Harness process:

```bash
node tools/test-host.mjs     # 20 checks: tools, forum routing, cursors, HTTP routes, restart recovery
node tools/test-client.mjs   # 11 checks: factory, slots, locale, every render branch, posting
```

They drive the real modules with fake Cordis services and a minimal React hook model.
