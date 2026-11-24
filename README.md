# Read It Later

A small, quiet place to save links for later. Built as an offline-first PWA
with Svelte, Tailwind CSS, Dexie, and a Cloudflare Worker + D1 sync backend.

![Read It Later](public/icons/icon-192.png)

## Features

- Collapsible sidebar with **Unread** and **Read** lists
- Article cards with page title, favicon, domain, and saved date
- One-click checkbox to move an article between unread and read
- Add a link from the `+` button using only a URL
- Page titles are fetched automatically and fall back to a title derived from the URL
- Light mode (white) and dark mode (pure black), remembered across visits
- One shared mixed-alphanumeric PIN unlocks the library on every device
- Changes sync automatically through Cloudflare D1, with a local outbox for offline use
- Installable PWA with an app shell that works offline

## Tech stack

- [Svelte 5](https://svelte.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Dexie.js](https://dexie.org/) for IndexedDB (local-first reads/writes)
- [Cloudflare Workers + D1](https://developers.cloudflare.com/d1/) for sync
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox service worker + web app manifest)

## Getting started

```bash
npm install
npm run db:migrate:local   # create the local D1 schema
npm run sync:token         # derive the token for your chosen PIN
```

Copy `.dev.vars.example` to `.dev.vars` and paste the token printed by
`npm run sync:token` next to `SYNC_SECRET=`.

Then run the API and the UI in two terminals:

```bash
npm run worker:dev   # builds dist/, then runs the Worker + local D1 on :8787
npm run dev          # Vite on :5173, proxying /api to :8787
```

Open the printed Vite URL and enter the same PIN you used to derive the token.

## Deploying to Cloudflare

The project is already configured for a Worker with static assets and the
`bookmarks-db` D1 database in `wrangler.toml`.

1. Apply the schema to the remote database:

   ```bash
   npm run db:migrate
   ```

2. Derive the token from your PIN and store it as a Worker secret:

   ```bash
   npm run sync:token
   npx wrangler secret put SYNC_SECRET   # paste the printed 64-char hex token
   ```

3. Build and deploy:

   ```bash
   npm run deploy
   ```

`npm run deploy` builds the PWA into `dist/` and deploys the Worker, static
assets, and D1 binding together. Wrangler prints the deployed URL.

### Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `SYNC_SECRET` | Worker secret | The 64-char hex token derived from your PIN. Required. |
| `ALLOWED_ORIGIN` | Worker variable (optional) | Comma-separated origins allowed to call `/api/*` cross-origin. Not needed when the app and API share a domain. |
| `VITE_API_BASE` | Build-time (optional) | Absolute API origin if the PWA is hosted separately from the Worker. Defaults to same-origin `/api`. |

The PIN and the derived token are never hardcoded in the client or in Vite
environment variables. Only the fixed PBKDF2 salt and iteration count are part
of the source, because every device must derive the same token.

## How the PIN works

1. You choose one PIN made of letters and numbers (8+ characters).
2. The browser stretches it with `PBKDF2-SHA-256`:
   - salt: `read-it-later.sync.v1`
   - iterations: `150,000`
   - output: 256 bits, rendered as 64 lowercase hex characters
3. The derived token is sent as `Authorization: Bearer <token>`.
4. The Worker compares it with `env.SYNC_SECRET` using a timing-safe comparison.

The raw PIN is never written to disk and never sent to the server.

- By default the token lives in memory and in `sessionStorage`, so a reload in
  the same tab stays unlocked but closing the tab asks for the PIN again.
- **Trust this device** stores the derived token in `localStorage` so the app
  stays unlocked across restarts. Use **Lock library** to remove it.
- The PIN cannot be recovered or reset from an email address. Changing it means
  rotating `SYNC_SECRET` and re-entering the new PIN on each device.

## How syncing works

1. **Write locally first.** Adding, checking off, or deleting an article writes
   straight to IndexedDB. The UI updates immediately, even offline.
2. **Queue an outbox row.** Each mutation also writes the latest snapshot of the
   article into an `outbox` table in the same Dexie transaction.
3. **Push.** A debounced background sync sends the outbox in batches to
   `POST /api/bookmarks/sync`. The Worker applies each row with
   `INSERT … ON CONFLICT(id) DO UPDATE … WHERE excluded.updatedAt > articles.updatedAt`
   (last write wins by `updatedAt`).
4. **Pull.** The client requests `GET /api/bookmarks?updated_after=<ms>` and
   applies anything newer than its saved cursor. Local edits that are newer
   than the incoming row win and stay queued.
5. **Deletes are tombstones.** Deleting an article sets `deleted = 1` instead of
   removing the row outright, so other devices can learn about the deletion
   during an incremental pull.

Sync runs after each edit (debounced), when the app comes back online, when the
tab becomes visible, every minute while unlocked, and once at startup.

### Service worker

`vite-plugin-pwa` generates a Workbox service worker that precaches the app
shell and static assets. `/api/*` requests are explicitly registered as
`NetworkOnly` for `GET` and `POST`, so sync traffic never comes from the cache.
The app's own offline copy lives in IndexedDB.

### Existing local data

The previous version used Dexie Cloud. Database version 4 removes the cloud
tables, backfills `updatedAt`/`deleted`, and copies every existing local article
into the outbox. The first unlock therefore uploads the local library to D1
instead of discarding it. Articles staged by the older numeric-key migration
(`legacyArticles`) are moved across on startup as well.

## Notes

- **Titles:** Browsers block direct cross-origin page requests, so titles are
  looked up through public metadata services (Microlink, Jina Reader, then HTML
  proxies). If all of them are unreachable, the app keeps a title derived from
  the URL. You can replace `src/lib/metadata.js` with your own endpoint.
- **Favicons:** loaded from Google's favicon service and cached by the service
  worker. If an icon is unavailable, a letter tile is shown instead.
- **Privacy:** links and read state live in IndexedDB and in your private D1
  database. The theme preference lives in localStorage. Titles are fetched from
  the metadata services above.
- **Icons:** regenerate the PWA PNG icons after editing the mark with
  `npm run icons`.

## Troubleshooting

- **401 / “PIN rejected”**: run `npm run sync:token` with the PIN you actually
  type, then update the secret with `npx wrangler secret put SYNC_SECRET`.
  Re-deploy if you changed the Worker.
- **Local API unreachable**: make sure `npm run worker:dev` is running on port
  8787 and that `.dev.vars` contains `SYNC_SECRET`.
- **Remote schema missing**: run `npm run db:migrate` (add `--force` for
  non-interactive environments).
- **Start over locally**: clear the site's IndexedDB and storage, or use the
  browser devtools Application panel. The remote D1 rows are unaffected.
