# AGENTS.md

## Cursor Cloud specific instructions

### What this is
`findgagu-os-cursor` is an internal operations/CRM web app (Korean furniture company "파인드가구"). Stack: React 18 + TypeScript + Vite + Tailwind/shadcn-ui frontend, with a Supabase backend (Auth, DB, Storage, Edge Functions in `supabase/`). It is a frontend-only dev experience — there is no separate local backend process to run; the app talks to a hosted Supabase project.

### Running / building (single service: the Vite frontend)
Standard scripts in `package.json`:
- Dev server: `npm run dev` → Vite on `http://127.0.0.1:5173` (`strictPort`, host `127.0.0.1`).
- Build + typecheck: `npm run build` (`tsc -b && vite build`).
- Lint: `npm run lint` (`eslint .`).

Non-obvious notes:
- `npm run lint` currently exits non-zero due to many pre-existing lint errors in `src/` (unused vars, `no-explicit-any`, hook-deps). This is the repo's existing state, not a setup problem — do not "fix" these unless asked.
- `npm run build` succeeds and is the reliable signal that TypeScript compiles.

### Environment variables (required to even boot)
`src/lib/supabase.ts` calls `getSupabase()` at module import time and THROWS if `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing. Because `main.tsx` imports the client transitively, the app white-screens at startup without them. A local `.env` (gitignored) with these two vars is required just to load the page. Placeholder values (e.g. `https://placeholder.supabase.co` / `placeholder-anon-key`) are enough to render `/login` and the public routes; all other `VITE_*` vars (Gemini, OpenAI, Cloudinary, Kakao, Google Sheet sync) are optional/feature-gated.

### Auth gate / what you can test without a real backend
- Public routes (no login): `/login`, `/contact`, `/share`, `/share/gallery`, `/public/share`, `/p/estimate/:id`.
- Everything else (`/` dashboard, `/consultation`, `/measurement`, `/image-assets`, `/showroom`, `/admin/*`) is behind `ProtectedRoute`, which requires Supabase Google OAuth login. Without a real Supabase project + configured Google provider you cannot reach protected pages.
- With placeholder credentials, public pages render and forms are interactive, but any DB write (e.g. the `/contact` consultation intake form) fails at the network boundary with an error toast — expected. To exercise real flows, set real `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and provide test login).
