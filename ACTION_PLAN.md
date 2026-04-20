# Audible — Action Plan

## YOU (manual, requires dashboard/CLI access)

### Immediate (before deploy)
- [ ] `vercel env add PLAYER_SESSION_SECRET_CURRENT` in production/preview/development
- [ ] Provision Upstash Redis via Vercel Marketplace, confirm env vars connected
- [ ] Confirm Clerk keys match: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
- [ ] Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` in Vercel envs
- [ ] Set `AI_GATEWAY_API_KEY` if using Vercel AI Gateway
- [ ] Create Vercel Blob store, set `BLOB_READ_WRITE_TOKEN`
- [ ] `vercel env pull .env.local` after all env vars are set

### Deploy
- [ ] `npm i -g vercel@latest`
- [ ] `vercel link --yes --project audible`
- [ ] `vercel --prod`

### Post-deploy verification
- [ ] `/api/player-auth` returns 429 under repeated bad attempts
- [ ] Board → Push install → player-data works with real player token
- [ ] Player token invalidates when player status changes

## ME (code changes — executing now)

### P0: Blocking bugs
1. [x] Fix hash direction hardcode in game-breakdown.ts
2. [x] Wire Clerk to frontend program-context (replace localStorage)

### P1: Core missing features
3. [x] Playbook management API (`/api/playbook` — CRUD)
4. [x] Playbook management UI (new dashboard page)
5. [x] Seasons API (`/api/seasons` — CRUD)
6. [x] Seasons UI (wire into games page)

### P2: Polish
7. [x] Film upload status GET endpoint (`GET /api/ingest?programId=X`)
8. [x] Clean up orphaned evalBench table (documented as forward-looking, not dead)
9. [x] Player progress season stats — stat cards, readiness bars, season overview

## Completed This Session

| Change | Files |
|--------|-------|
| Hash direction: infer from playDirection instead of hardcoding 'Middle' | `src/lib/cv/game-breakdown.ts` |
| Clerk → frontend: `useOrganization()` as source of truth, localStorage as cache only | `src/lib/auth/program-context.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/setup/page.tsx`, `src/app/(dashboard)/scouting/[opponentId]/page.tsx` |
| Playbook API (CRUD) | `src/app/api/playbook/route.ts` |
| Playbook UI page with formation grouping, type filters, situation tags | `src/app/(dashboard)/playbook/page.tsx`, `src/components/layout/sidebar.tsx` |
| Seasons API (CRUD) | `src/app/api/seasons/route.ts` |
| Seasons wired into Games page: create, filter, assign to games | `src/app/(dashboard)/games/page.tsx` |
| Film upload status GET | `src/app/api/ingest/route.ts` |
| evalBench documented as forward-looking (not removed) | `src/lib/db/schema.ts` |
| Player progress: stat cards, readiness bars, film grade avg, season overview | `src/app/(player)/progress/page.tsx` |
| Coaching staff API (list, add, update role, remove) | `src/app/api/coaches/route.ts` |
| Staff management UI on roster page (cards, promote/demote, remove) | `src/app/(dashboard)/roster/page.tsx` |
