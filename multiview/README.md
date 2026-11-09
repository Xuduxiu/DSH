# 多栏工作区 / Multiview

`@local/dsh-multiview` adds a **real multi-pane workspace inside the main
window**. It does not use the right Sidebar: the center conversation surface is
replaced by one to three side-by-side panes, while the left navigation and all
stock session actions stay where they are.

## Gestures

| Gesture | Result |
|---|---|
| **Single-click** a session on the left | navigates the focused pane to that Session |
| **Double-click** a session on the left | opens it in a new pane (or focuses it if already open) |
| Click a pane | focuses that pane and makes its Session the active sidebar row |
| **≡ / ▤** in a pane's top bar | toggles that pane between **Chat** and **Trajectory** |
| **×** in a pane's top bar | closes that pane (shown when more than one pane is open) |

Double-clicking a session row intentionally replaces the stock “rename on
double-click” gesture. Rename remains available from the row's `...` menu.

## Layout

- One pane fills the main area.
- Two panes split evenly.
- Three panes split evenly and form the ultrawide layout.
- Each pane has a minimum width of 320 px; if the window is narrower than the
  three columns, the main area scrolls horizontally instead of squeezing text
  into unreadable slivers.
- The active pane carries a thin accent line on its top border.

The workspace is capped at **three panes**. Opening a fourth Session replaces
the focused pane, matching the “open in the current column” browser gesture.

## Implementation

The plugin registers a new keyed `main` panel (`multiview`) rather than
replacing the stock conversation entry. Its registration declares a
session-scoped child slot, so the Slot renderer provides `SessionProvider` and
`renderSlot` to the panel. With those two pieces the panel can:

1. retain any Session through `ctx.sessions.retain`;
2. wrap each retained reference in `SessionProvider`;
3. render a session-scoped `multiview.pane` body; and
4. reuse the shipped `conversation.content` Factory with a fixed `views` slot
   for either Chat or Trajectory.

A silent root controller watches `activePanelId` and the active Session. When
the normal conversation surface would show, it selects the `multiview` main
panel; when the active Session changes, it focuses an existing pane or replaces
the focused pane. Pane state is persisted under
`dsh.multiview.main.v1`.

## Install

Preferred: `plugin_manager` with `action: install_bundle` and this directory as
`target`. Refresh the Web page once after installing so the new Client module
generation loads.

The Host half is intentionally empty. The Client half declares dependencies on
the stock Conversation, Trajectory, Session and Workspace client packages in
`dsh.client.inject`.

## Notes

- The plugin intentionally hides the Arknights theme dock while the multi-pane
  main panel is active, so it does not overlap the third column. Theme selection
  remains available in **Settings → General → 视觉协议**.
- The stock conversation header is replaced by the per-pane headers; the
  composer, model selector, attachments and session-scoped conversation store
  still come from the stock Conversation factory.
- The last remaining pane cannot be closed; use the left sidebar to navigate it
  to another Session.
