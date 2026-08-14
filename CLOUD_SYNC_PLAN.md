# Cloud sync — implementation plan

Handoff doc. Goal: let a single user work on their canvases from more than one
machine without manually moving anything.

## Context

This app currently has **no backend and no accounts**. Every canvas lives in
`localStorage`, behind one module: `lib/storage.ts`. The only server route,
`app/api/generate/route.ts`, is a stateless relay to OpenRouter using an API key
the user pastes in settings.

Stack: Next.js 16 (App Router), React 19, Tailwind 4, React Flow (`@xyflow/react`).

**Read `AGENTS.md` first.** This version of Next has breaking changes from what
you probably remember; the relevant guides are in `node_modules/next/dist/docs/`.
Read the ones covering anything you touch before writing code.

## Goal

Signed-in users get their canvases mirrored to Supabase and reconciled across
machines. Signed-out users get today's app, byte for byte.

## Non-goals

Not in this change; don't build toward them beyond the schema notes below.

- Public/community publishing. May come later — see "Forward compatibility".
- Realtime or multiplayer editing. One user, several machines, not concurrent.
- Moving images out of node data into object storage.
- Syncing the OpenRouter API key or export-layout preference. Both stay local,
  permanently, by design.

## Hard constraints

These are the things most likely to get broken by a reasonable-looking
implementation. Treat them as requirements, not suggestions.

1. **Storage reads must stay synchronous.** `components/Canvas.tsx:133` does
   `useState(() => toFlowNodes(loadNodes(canvasId)))` and
   `components/CanvasList.tsx:14` calls `listCanvases()` inline during render.
   If `loadNodes`/`listCanvases` become async, this turns into a rewrite of every
   consumer. localStorage stays the synchronous source of truth for rendering.
   Sync happens in the background and writes *back into* localStorage, then
   notifies open views to re-read.

2. **Never prefix-scan `proto:*` when building a sync payload.** The user's
   OpenRouter key is stored at `proto:openrouter-key`, immediately adjacent to
   `proto:canvas:*`. A `for (key of Object.keys(localStorage))` sweep uploads
   every user's API key to the database. Enumerate canvases via `listCanvases()`
   and read only the keys you explicitly name.

3. **Anon/publishable key only.** RLS does the authorization work. This app has
   no trusted server component, so a `service_role` key must not appear anywhere
   in the codebase, `.env*`, or client bundle.

4. **Signed-out behavior is unchanged.** No auth walls, no prompts, no network
   calls. The existing single-machine experience is the fallback, not a
   degraded mode.

5. **Don't compare timestamps across clocks.** Local `updatedAt` comes from the
   client (`Date.now()` in `saveNodes`); `updated_at` comes from Postgres. A
   work laptop and a home machine can be minutes apart. See the sync algorithm
   for how to handle this — comparing local time directly against server time
   will silently lose edits.

## Current storage layout

From `lib/storage.ts`:

| Key | Contents |
| --- | --- |
| `proto:canvases` | `CanvasMeta[]` index — `{ id, name, createdAt, updatedAt }` |
| `proto:canvas:<id>:nodes` | `StoredNode[]`, the whole canvas |
| `proto:canvas:<id>:instructions` | per-canvas system-prompt additions |
| `proto:openrouter-key` | **never syncs** |
| `proto:export-layout` | **never syncs** |
| `proto:canvas`, `proto:instructions` | legacy, migrated on read |

`lib/storage.ts` also contains two one-time migrations (`migrateLegacyCanvas`,
`migrateGlobalInstructions`) that run inside `listCanvases()`. Sync must run
*after* migration, never in parallel with it.

## Schema

```sql
create table canvases (
  id           uuid primary key,          -- reuse the client's crypto.randomUUID()
  user_id      uuid not null references auth.users on delete cascade,
  name         text not null,
  nodes        jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  created_at   timestamptz not null,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create index canvases_user_updated on canvases (user_id, updated_at desc);

alter table canvases enable row level security;

create policy "own canvases: select" on canvases
  for select using (auth.uid() = user_id);
create policy "own canvases: insert" on canvases
  for insert with check (auth.uid() = user_id);
create policy "own canvases: update" on canvases
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own canvases: delete" on canvases
  for delete using (auth.uid() = user_id);
```

Notes:

- **Client-generated ids.** The app already mints `crypto.randomUUID()` in
  `createCanvas`/`forkCanvas`. Reusing them means a canvas created offline keeps
  its identity when it first reaches the server — no id remapping.
- **`nodes` as a single jsonb blob** mirrors the existing serialization exactly
  (`saveNodes` already writes the whole array at once). This is a translation of
  the current model, not a remodel.
- **`updated_at` is set by the server** on every write. Do not let the client
  write it directly; use a trigger or `default now()` plus explicit `now()` on
  update.
- **Soft delete via `deleted_at`.** Required — see tombstones below.

### Size ceiling

A canvas holds base64 data-URL images (`lib/images.ts`) and up to 20 prior HTML
versions per node (`MAX_VERSIONS` in `lib/types.ts`). Multi-megabyte rows are
realistic, and every save re-uploads the whole blob. Add a payload cap (start at
~5 MB) with a clear, user-visible error when a canvas exceeds it. Do not let
oversized saves fail silently — that reads as data loss. Moving images to
Supabase Storage is the eventual fix; not now.

## Sync engine

New module, `lib/sync/`. It wraps `lib/storage.ts` rather than replacing it.

### Baseline record

Per canvas, keep a local record of what was last reconciled:

```ts
// proto:sync:<canvasId>
type Baseline = {
  remoteUpdatedAt: string;  // server timestamp at last successful sync
  localUpdatedAt: number;   // client timestamp at last successful sync
};
```

Divergence is then determined **per side against its own baseline**, never by
comparing the two clocks to each other:

- `local.updatedAt !== baseline.localUpdatedAt` → local changed
- `remote.updated_at !== baseline.remoteUpdatedAt` → remote changed

### Reconciliation, per canvas

| local changed | remote changed | action |
| --- | --- | --- |
| no | no | nothing |
| yes | no | push local; store new baseline |
| no | yes | pull remote into localStorage; store new baseline |
| yes | yes | **conflict** — see below |
| n/a (missing locally) | exists | pull as new canvas |
| exists | missing remotely | push as new row |

### Conflicts

Never clobber. On a two-sided change: pull the remote version into the canvas's
existing id, and copy the local version into a **new** canvas named
`<name> (conflict copy)`. `forkCanvas` in `lib/storage.ts` already does almost
exactly this, so reuse it. The user sees both, loses nothing, and resolves it by
hand. This is the Dropbox model and it's the right cost/benefit here.

### Tombstones

`deleteCanvas` currently hard-removes the local keys. Without a tombstone,
deleting on machine A and then syncing from machine B resurrects the canvas.

- Local: append `{ id, deletedAt }` to `proto:sync:tombstones` on delete.
- Push: set `deleted_at` on the row; drop the tombstone once the server confirms.
- Pull: a row with `deleted_at` set removes the local canvas — but only if local
  hasn't changed since baseline. If it has, keep it locally and treat it as a
  conflict copy.

### Triggers

- On app load, after migrations run.
- On tab focus / `visibilitychange`.
- Debounced after writes. `Canvas.tsx:142` already debounces `saveNodes` at
  300 ms; sync should ride a slower timer (~2 s) so typing doesn't generate a
  request per keystroke.
- After a successful push, to pick up anything that landed meanwhile.

### Notifying the UI

After sync writes into localStorage, open views need to re-read. A
`CustomEvent` on `window` that `Canvas` and `CanvasList` subscribe to is enough;
no state-management library. Be careful not to stomp a canvas the user is
actively editing — if the open canvas received a pull, that's exactly the
conflict path above.

## Auth

Supabase magic link. No passwords to store or handle, and no OAuth app to
register.

**Use `@supabase/supabase-js` directly in the browser.** Do *not* reach for
`@supabase/ssr` and middleware cookie plumbing — this app renders nothing
server-side from user data (`CanvasClient` is `ssr: false` precisely because
storage is client-only), so the cookie-sync machinery buys nothing and adds a
middleware layer to maintain. Client-side session with `detectSessionInUrl` and
a `/auth/callback` route is the right size.

UI surface: a sign-in control in `SettingsModal.tsx` (it already owns settings),
showing signed-in email plus last-synced time, or an email field when signed
out.

On sign-out: keep the local copies. Deleting the user's canvases because they
signed out would be a nasty surprise.

## Files

| File | Change |
| --- | --- |
| `lib/supabase.ts` | new — client singleton from env |
| `lib/sync/engine.ts` | new — reconciliation loop, conflict + tombstone handling |
| `lib/sync/baseline.ts` | new — baseline + tombstone bookkeeping |
| `lib/sync/types.ts` | new — row type, explicit payload type (see constraint 2) |
| `lib/storage.ts` | add tombstone write in `deleteCanvas`; emit change events |
| `components/SettingsModal.tsx` | auth UI, sync status |
| `components/Canvas.tsx` | subscribe to sync events, re-read on remote change |
| `components/CanvasList.tsx` | subscribe to sync events |
| `app/auth/callback/page.tsx` | new — magic-link landing |
| `supabase/migrations/*.sql` | new — schema above |

## What I need from you (human steps)

1. **Create the Supabase project.** I can't sign up for accounts or enter
   credentials into web forms. Alternatively, provisioning Supabase through the
   Vercel Marketplace wires the env vars in automatically and *can* be driven
   from the CLI — say so and take that route instead.
2. **Put credentials in `.env.local`** — not in chat.
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Newer Supabase dashboards label this the *publishable* key (`sb_publishable_…`);
   either naming is fine, it's the same public client key. Not the service role key.
3. **Configure redirect URLs** in Supabase Auth settings: `http://localhost:3000/auth/callback`
   and the production URL.
4. **A second test account** (any second email you control) so RLS can actually
   be verified rather than assumed.

## Verification

Not optional, and not satisfied by "it compiles":

- [ ] **RLS blocks cross-user reads.** Sign in as user B, attempt to fetch user
      A's canvas rows by id, confirm empty. This is the test that matters most.
- [ ] Two browser profiles, edits on both, both converge.
- [ ] Offline edit on both sides → conflict copy appears, **nothing is lost**.
- [ ] Delete on A propagates to B and does not resurrect on the next sync.
- [ ] Signed out: no network requests, behavior identical to `main`.
- [ ] **The API key never leaves the browser.** Inspect the actual request
      payloads; don't just read the code.
- [ ] A canvas over the size cap fails with a visible error, not silently.
- [ ] Existing localStorage canvases survive first sign-in and upload intact
      (test with the legacy-migration path too).

## Forward compatibility

Public/community publishing is a likely follow-on. It isn't in scope, but two
choices here make it cheap later and cost nothing now: rows are owned by
`user_id` from day one, and deletes are soft. Don't build publishing
machinery — just don't foreclose it.

If publishing does happen later, the security analysis is: published canvases
must render on a **separate registrable domain** (not a subdomain), sandboxed,
and `lib/markdown.ts` deliberately passes raw HTML through — which is fine for
local rendering inside `sandbox="allow-scripts"` iframes, and an XSS hole the
moment that markdown is served un-framed to other users, as it currently is in
the stacked export path (`lib/export.ts:52`).

## Open decisions

1. **One shot or staged?** Schema + engine first behind a signed-out no-op, then
   auth UI? Or all at once?
2. **Conflict copy naming** — `(conflict copy)` vs. something with a date.
3. **Sync cadence** — is ~2 s after edit right, or is on-focus + on-load enough?
