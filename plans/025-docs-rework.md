# 025 Docs rework

Status: in progress · Branch: `dev` · Owner feedback 2026-09-25: pages carry too much, names are inconsistent ("React" next to "react", "Core" next to "core"), the sidebar repeats the tab links.

This plan is the single source of truth for the docs structure. Every page and every link uses the slugs below.

## Rules

- One topic per page. A page answers one question. Target: under 120 lines of MDX. Split a page that grows past that.
- Every page has: frontmatter `title` and `description`, one intro paragraph (what it is, when you need it), sections, and `## Related` at the end.
- Prose follows `.agents/skills/simple-english`. Run its self-check on every page you write.
- Code samples compile against the current API. Verify API names in `packages/*/src/index.ts` and the source before you write them.
- No content is lost. Content that moves gets a new home in this structure. Remove duplicates: one fact lives on one page, other pages link to it.

### Names

| Thing                   | Write                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Product                 | Anchor Presence                                                                                                          |
| Packages in prose       | `@anchor-presence/core`, `@anchor-presence/dom`, `@anchor-presence/react` (code format, full name)                       |
| Tabs (sidebar switcher) | Get started, Core, DOM, React, Examples. The tab `description` names the package.                                        |
| Page titles             | Sentence case ("Quick start", "Visibility policy"). A title never repeats the tab name and never is a bare package name. |
| API names in titles     | Exact casing, no code format: "usePresenceClient", "CursorLayer", "createDomBinding".                                    |
| Folder index page       | Title "Overview".                                                                                                        |
| Technologies            | React, Next.js, Bun, Node.js, Hono, Elysia, Socket.IO, SignalR, WebSocket, TypeScript                                    |
| Terms (one per concept) | anchor, fallback chain, resolution tier, visibility policy, relay, room, transport, codec, presence client, binding      |

### Sidebar

Each tab lists its pages with `---Separator---` groups in `meta.json` (see gridcn `content/docs/meta.json`). API reference pages sit in an "API reference" group at the end of each package tab, titled by what they cover, never by the package name.

## Structure

### Get started (`/docs/get-started`, root)

| Group       | Slug                          | Title              | Content source                                |
| ----------- | ----------------------------- | ------------------ | --------------------------------------------- |
| Get started | `introduction`                | Introduction       | introduction                                  |
|             | `installation`                | Installation       | installation                                  |
|             | `quick-start`                 | Quick start        | quick-start                                   |
| Concepts    | `concepts/how-it-works`       | How it works       | concepts/architecture                         |
|             | `concepts/anchors`            | Anchors            | concepts/anchors-and-fallbacks (IDs, naming)  |
|             | `concepts/fallback-chain`     | Fallback chain     | concepts/anchors-and-fallbacks (chain, tiers) |
|             | `concepts/ui-context`         | UI context         | concepts/ui-context                           |
|             | `concepts/responsive-layouts` | Responsive layouts | responsive-layouts                            |
| Guides      | `guides/security`             | Security           | security                                      |
|             | `guides/performance`          | Performance        | performance                                   |
|             | `guides/troubleshooting`      | Troubleshooting    | troubleshooting                               |
|             | `guides/ai-agents`            | AI agents          | ai-agents                                     |

### Core (`/docs/core`, root, package `@anchor-presence/core`)

| Group         | Slug                        | Title                     | Content                                                                                        |
| ------------- | --------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| Core          | `index`                     | Overview                  | what core owns, framework- and DOM-free                                                        |
| Client        | `presence-client`           | Presence client           | `createPresenceClient`, lifecycle, `dispose`, publish rate, heartbeat                          |
|               | `remote-presence`           | Remote presence           | store, stale timeout, idle stage, `maxRemoteClients`                                           |
|               | `validation`                | Validation                | `validatePresence`, `ValidationLimits`, the boundary (limits table stays on Security; link it) |
| Transports    | `transports`                | Transports                | the `LiveCursorTransport` contract, connect/disconnect ownership, status                       |
|               | `in-memory-transport`       | In-memory transport       | `createInMemoryPair` for tests and prototypes                                                  |
|               | `custom-transport`          | Custom transport          | write your own; BroadcastChannel sketch; managed services                                      |
| Codecs        | `codecs`                    | Codecs                    | `CursorCodec`, `jsonCodec`, choosing a codec, same codec per room                              |
|               | `binary-codec`              | Binary codec              | `binaryCodec` layout, precision, encode limits                                                 |
|               | `custom-codec`              | Custom codec              | MessagePack sketch, debugging wrapper                                                          |
| Adapters      | `interpolation`             | Interpolation             | `Interpolator`, `linearInterpolator`, `noneInterpolator`                                       |
|               | `build-a-framework-adapter` | Build a framework adapter | existing page                                                                                  |
| API reference | `api/client`                | Client API                | `createPresenceClient`, options, `PresenceClient`, constants                                   |
|               | `api/protocol`              | Protocol types            | `CursorPresence`, `AnchorPoint`, `RemotePresence`, protocol constants                          |
|               | `api/transports-and-codecs` | Transport and codec API   | `LiveCursorTransport`, `createInMemoryPair`, `CursorCodec`, codecs                             |

### DOM (`/docs/dom`, root, package `@anchor-presence/dom`)

| Group         | Slug                      | Title                   | Content                                                         |
| ------------- | ------------------------- | ----------------------- | --------------------------------------------------------------- |
| DOM           | `index`                   | Overview                | what the binding does, how it sits between core and adapters    |
| Binding       | `binding`                 | Binding                 | `createDomBinding`, options, lifecycle, `invalidate()`          |
|               | `anchor-registration`     | Anchor registration     | `data-anchor`, `anchorAttribute`, auto-registration, duplicates |
|               | `pointer-capture`         | Pointer capture         | what is sent and when, blur/leave, touch                        |
| Resolution    | `resolution`              | Resolution              | resolution tiers, `ResolvedCursor`, viewport coordinates        |
|               | `visibility-policy`       | Visibility policy       | `VisibilityPolicy`, `pointVisible`, examples                    |
|               | `occlusion-and-scroll`    | Occlusion and scroll    | clipped anchors, scroll containers                              |
|               | `motion`                  | Motion                  | interpolation in the binding, reduced motion                    |
| Transport     | `websocket-transport`     | WebSocket transport     | `createWebSocketTransport`, URL, token, reconnect and backoff   |
| API reference | `api/binding`             | Binding API             | `createDomBinding`, `DomBinding`, options types                 |
|               | `api/resolution`          | Resolution types        | `ResolvedCursor`, `ResolutionTier`, `VisibilityPolicy`          |
|               | `api/websocket-transport` | WebSocket transport API | `createWebSocketTransport` and its options                      |

### React (`/docs/react`, root, package `@anchor-presence/react`)

| Group         | Slug                   | Title               | Content                                                                    |
| ------------- | ---------------------- | ------------------- | -------------------------------------------------------------------------- |
| React         | `index`                | Overview            | what the adapter provides, minimal setup, link to quick start              |
| Setup         | `use-presence-client`  | usePresenceClient   | client lifecycle, `key`, `dispose`, connect in the factory                 |
|               | `live-cursor-provider` | LiveCursorProvider  | props, `bindingOptions` read once, `client={null}`                         |
|               | `ssr-and-strict-mode`  | SSR and Strict Mode | existing page                                                              |
| Rendering     | `cursor-layer`         | CursorLayer         | props: `getLabel`, `getColor`, `filterCursor`, `getCursorProps`            |
|               | `custom-cursors`       | Custom cursors      | `renderCursor`, `DefaultCursor`, positioning contract, idle, forced colors |
| Hooks         | `remote-cursors`       | Remote cursors      | `useRemoteCursors`, `useRemoteCursorsSelector`                             |
|               | `remote-users`         | Remote users        | `useRemoteUsers`                                                           |
|               | `cursor-presence`      | Cursor presence     | `useCursorPresence`                                                        |
|               | `cursor-context`       | Cursor context      | `useCursorContext`                                                         |
|               | `connection-status`    | Connection status   | `useCursorStatus`                                                          |
|               | `rerenders`            | Rerenders           | which hook rerenders when; choosing the smallest hook                      |
| API reference | `api/components`       | Components API      | `LiveCursorProvider`, `CursorLayer`, `DefaultCursor` props                 |
|               | `api/hooks`            | Hooks API           | every hook signature and return type                                       |

### Examples (`/docs/examples`, root)

Keep the pages. Fix titles:

- Backends folder: index title "Overview". Pages: "Bun", "Node.js (ws)", "Hono", "Elysia", "Socket.IO", "SignalR". Slugs stay.

## Owners (parallel work, 2026-09-25)

| Area                          | Owner              |
| ----------------------------- | ------------------ |
| Get started + Examples titles | agent A            |
| Core                          | agent B            |
| DOM                           | agent C            |
| React                         | agent D            |
| Whole-site QA pass            | agent E, after A–D |

Each agent edits only its own tab folder under `apps/docs/content/docs/`. Links to other tabs use the slugs above, even when the target page does not exist yet.
