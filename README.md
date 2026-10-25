# Read It Later

A small, quiet place to save links for later. Built as an offline-first PWA with
Svelte, Tailwind CSS, Dexie, and Dexie Cloud.

![Read It Later](public/icons/icon-192.png)

## Features

- Collapsible sidebar with **Unread** and **Read** lists
- Article cards with page title, favicon, domain, and saved date
- One-click checkbox to move an article between unread and read
- Add a link from the `+` button using only a URL
- Page titles are fetched automatically and fall back to a title derived from the URL
- Light mode (white) and dark mode (pure black), remembered across visits
- Email one-time-code sign-in (no password) via Dexie Cloud
- Every change syncs automatically to your Dexie Cloud database and other devices
- Installable PWA with an app shell that works offline

## Tech stack

- [Svelte 5](https://svelte.dev/) + [Vite](https://vite.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Dexie.js](https://dexie.org/) for IndexedDB
- [Dexie Cloud](https://dexie.org/cloud/) for authentication and sync
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Workbox service worker + web app manifest)

## Getting started

```bash
npm install
npm run dev
```

Open the printed local URL. The first visit asks for an email address, then for
the one-time code Dexie Cloud emails to you.

### Cloud configuration

Dexie Cloud is configured from `dexie-cloud.json` in the project root:

```json
{
  "serviceUrl": "https://dexie.cloud",
  "dbUrl": "https://<your-database>.dexie.cloud"
}
```

Generate it once with:

```bash
npx dexie-cloud create
```

`src/lib/db.js` reads `dbUrl` from that file. You can override it at build time
with a `VITE_DEXIE_CLOUD_URL` environment variable, which is handy for
deployments that do not ship the JSON file.

> `dexie-cloud.json`, `dexie-cloud.key`, and other `.dexie-cloud*` artifacts are
> gitignored. The key file contains server credentials and must never be sent to
> the browser or committed.

Add every origin you use to the allowed origins of the database, for example
`http://localhost:5173` for local development, plus your production URL.

## Build & preview

```bash
npm run build
npm run preview
```

The production build is written to `dist/`. It uses a relative `base`, so the
same build works at a domain root or in a subdirectory (for example GitHub
Pages). Deploy the contents of `dist/` to any static host over HTTPS.

The service worker is only active in the production build. After visiting the
deployed app once, the shell loads without a connection.

## How syncing works

1. **Write locally first.** Adding, checking off, or deleting an article writes
   straight to IndexedDB. The UI updates immediately, even offline.
2. **Dexie Cloud queues the change.** The cloud addon records every mutation in
   a local queue and pushes it to your Dexie Cloud database as soon as the app
   is online and signed in.
3. **Other devices pull it down.** Those devices receive the change through
   Dexie Cloud (live while the app is open) and write it into their own
   IndexedDB, where the `liveQuery` store re-renders the list.
4. **On startup**, after authentication the app calls
   `db.cloud.sync({ purpose: 'pull', wait: true })` once so the first render
   already contains everything from the cloud.

Foreground sync is used. Background sync while the app is closed would require
importing Dexie Cloud's service-worker module into the generated Workbox
service worker; that is intentionally left out because `vite-plugin-pwa` uses
`generateSW` here. Dexie Cloud still syncs changes made while the app is dormant
as soon as it is opened again.

### Existing local data

The pre-cloud schema used an auto-incrementing numeric `id`. Dexie Cloud needs
string primary keys, so database version 3 recreates the `articles` table with
an `@id` primary key. Articles from the old table are first copied into a
local-only `legacyArticles` table (database version 2), then uploaded into the
synced table after the first successful pull. Duplicate URLs are skipped.

## Notes

- **Titles:** Browsers block direct cross-origin page requests, so titles are
  looked up through public metadata services (Microlink, Jina Reader, then HTML
  proxies). If all of them are unreachable, the app simply keeps a title derived
  from the URL. You can replace `src/lib/metadata.js` with your own endpoint.
- **Favicons:** loaded from Google's favicon service and cached by the service
  worker. If an icon is unavailable, a letter tile is shown instead.
- **Privacy:** links, read state, and the signed-in session live in IndexedDB;
  the theme preference lives in localStorage. Titles are fetched from the
  metadata services above. If you sign out, the local copy of your library stays
  on the device for the next sign-in.
- **Icons:** regenerate the PWA PNG icons after editing the mark with
  `npm run icons`.
