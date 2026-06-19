# AGENTS.md

## Cursor Cloud specific instructions

### What this project is
FINDGAGU OS — a Vite + React 18 + TypeScript SPA (internal CRM/ERP console for a Korean
furniture company) backed by Supabase (Auth + Postgres + Storage + Realtime + Edge Functions).
Package manager is **npm** (`package-lock.json`). Node 20+/22 works. There is no separate
backend in this repo; the frontend talks directly to Supabase.

### Standard commands (see `package.json` `scripts`)
- Dev server: `npm run dev` → http://127.0.0.1:5173 (Vite, `strictPort`, host `127.0.0.1`).
- Build: `npm run build` (`tsc -b && vite build`).
- Lint: `npm run lint` (ESLint). NOTE: the current codebase already reports many
  pre-existing lint errors/warnings — `npm run lint` exits non-zero on a clean checkout.
  Do not treat that as something your change broke unless you added new ones.

### Required env vars (app hard-throws without them)
`src/lib/supabase.ts` throws at module load if `VITE_SUPABASE_URL` or
`VITE_SUPABASE_ANON_KEY` are missing, so **the SPA renders nothing until a `.env` exists**.
Create a `.env` (gitignored) with both before running `npm run dev`.

Two ways to provide a backend:
1. **Hosted Supabase project (full functionality):** set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` to the real project. Required for Google-OAuth login and all
   authenticated internal pages (dashboard, consultations, image assets, etc.). Provide
   these as Cursor secrets if you need the full app.
2. **Local Supabase stack (self-contained, no secrets):** see below. Good enough to exercise
   the public lead-intake flow end-to-end, but login won't work (login is Google OAuth only).

### Running a local Supabase stack (self-contained testing)
Docker is required and is already installed in the snapshot, but the daemon and the Supabase
containers are NOT auto-started. Per session:

1. Start the Docker daemon (no systemd in this container): run `sudo dockerd` in a background
   tmux session, then `sudo chmod 666 /var/run/docker.sock` so non-root tooling can use it.
   Docker 29 here is configured for `fuse-overlayfs` with the containerd snapshotter disabled
   (`/etc/docker/daemon.json`) and iptables set to legacy — keep those settings.
2. Start Supabase: `npx supabase start` (config is in `supabase/config.toml`). Get keys with
   `npx supabase status -o env` (use `ANON_KEY` + `API_URL=http://127.0.0.1:54321`).
3. **Do NOT rely on `supabase db reset` / migrations to build a fresh DB.** The files in
   `supabase/migrations/` are incremental and assume a pre-existing base schema (many tables
   like `leads`, `products`, `image_assets` are never created), so applying them from scratch
   fails. Instead apply the minimal local seed:
   `docker cp supabase/local_dev_seed.sql supabase_db_workspace:/tmp/seed.sql && \
    docker exec -i supabase_db_workspace psql -U postgres -d postgres -f /tmp/seed.sql`
4. Point `.env` at the local stack:
   `VITE_SUPABASE_URL=http://127.0.0.1:54321` and `VITE_SUPABASE_ANON_KEY=<ANON_KEY>`.

### Testing notes
- Auth is **Google OAuth only** (no email/password). It cannot be completed against a bare
  local stack, so for self-contained UI testing use the public (no-login) routes:
  `/contact` (lead-intake form that inserts into `consultations`), `/share*`, `/public/share`,
  `/p/estimate/:id`, `/contact`.
- Verified hello-world flow: open `/contact`, submit the inquiry form, and a row is inserted
  into `public.consultations` (anon insert is allowed by RLS). supabase-js `.insert()` without
  `.select()` sends `Prefer: return=minimal`; an anon insert that asks for the row back
  (`return=representation` / `.select()`) is blocked by RLS since anon has no SELECT policy.
