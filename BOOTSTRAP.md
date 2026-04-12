# Bootstrap Audible — Account Setup & First Deploy

This is the step-by-step runbook for taking Audible from "scaffolded files on disk" to "deployed to a real Vercel URL with a real database and real auth." You (the human) drive this. I can walk through it with you live; most steps are click-and-paste.

**Estimated time: 45–60 minutes the first time.**

---

## Phase A — Your accounts (≈ 15 minutes)

All accounts are free to create. You're setting up the minimum viable infrastructure, not committing to paid plans yet.

### A1. GitHub repo

If you don't already have a GitHub account, create one at [github.com/signup](https://github.com/signup).

Then create a new repository:

1. Go to [github.com/new](https://github.com/new)
2. **Repository name:** `audible`
3. **Visibility:** Private
4. **Do NOT** initialize with README, .gitignore, or license — our scaffold already has those
5. Click **Create repository**

Copy the repo URL (both HTTPS and SSH are fine). You'll give it to me and I'll push the scaffold.

### A2. Vercel account + team

1. Go to [vercel.com/signup](https://vercel.com/signup)
2. Sign up with GitHub (cleanest — auto-links your repo later)
3. Create a team when prompted — name it whatever you want (`ayush-dev` or similar)
4. Note the team slug; we'll reference it as `$TEAM` below

### A3. Anthropic API access

**If you haven't already rotated the compromised key, do that first** (see README.md safety section). Otherwise:

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Settings → Limits → set **Monthly spend cap: $10**
3. Settings → API Keys → create key named `audible-dev`
4. **Store the key in your password manager**, not in chat, not in a text file
5. You'll paste it into Vercel's env var UI in step B3 below

That's all three accounts.

---

## Phase B — Wire the scaffold up to your accounts (≈ 20 minutes)

### B1. Push the scaffold to GitHub

From the `audible/` directory:

```bash
git init
git add .
git commit -m "Phase 0: initial scaffold"
git branch -M main
git remote add origin git@github.com:<your-username>/audible.git
git push -u origin main
```

Replace `<your-username>` with yours. If you're using HTTPS instead of SSH, the URL looks like `https://github.com/<your-username>/audible.git`.

### B2. Link the Vercel project

```bash
# From the audible/ directory
bunx vercel link
```

Vercel CLI will:
- Detect Next.js, confirm the framework
- Ask which team to deploy to — pick the one you created
- Ask whether to create a new project or use existing — create new, call it `audible`
- Write `.vercel/` to the directory (gitignored)

### B3. Provision Marketplace integrations (Neon, Clerk, Resend)

All three are one-click installs from the Vercel dashboard. Go to:

```
https://vercel.com/<team-slug>/audible/integrations
```

Install each:

**Neon Postgres**
- Click **Add Integration** → Neon
- Create a new project, name it `audible-db`
- Connect to the `audible` Vercel project, both production and preview
- Vercel auto-sets `DATABASE_URL` as an environment variable

**Clerk**
- Click **Add Integration** → Clerk
- Create a new Clerk application, name it `Audible`
- Connect to the `audible` project
- Vercel auto-sets `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`

**Resend**
- Click **Add Integration** → Resend
- Connect to the `audible` project
- Vercel auto-sets `RESEND_API_KEY`

**Vercel Blob** (not an integration, just a resource)
- Go to `https://vercel.com/<team-slug>/audible/stores`
- Click **Create Database** → Blob
- Name it `audible-film`, scope it to the `audible` project
- Vercel auto-sets `BLOB_READ_WRITE_TOKEN`

**Vercel AI Gateway**
- Go to `https://vercel.com/<team-slug>/~/ai-gateway`
- Create a gateway API key
- Vercel auto-sets `AI_GATEWAY_API_KEY`

### B4. Add the Anthropic key manually

Anthropic isn't a Vercel Marketplace integration (yet), so you paste the key yourself:

```bash
bunx vercel env add ANTHROPIC_API_KEY
```

When prompted:
- **Environment:** select all three (Production, Preview, Development)
- **Value:** paste your new Anthropic key
- Press Enter

Alternatively, do it in the dashboard at `https://vercel.com/<team-slug>/audible/settings/environment-variables`.

### B5. Pull env vars locally

```bash
bunx vercel env pull .env.local
```

This writes all the Vercel-managed env vars into `.env.local` so `bun run dev` works on your machine. The file is gitignored.

---

## Phase C — First deploy and smoke test (≈ 10 minutes)

### C1. Install dependencies

```bash
bun install
```

Expected: ~30 seconds, no errors, a `bun.lockb` file created. Commit the lockfile:

```bash
git add bun.lockb
git commit -m "Add bun.lockb"
git push
```

### C2. Generate and apply the initial DB migration

```bash
bun run db:generate
```

This reads `src/lib/db/schema.ts` and writes `drizzle/0000_<name>.sql`. Review it to make sure it looks sane, then:

```bash
bun run db:migrate
```

This applies both `0000_<name>.sql` (tables) and `0001_enable_rls.sql` (RLS policies) to your Neon branch.

### C3. Run the tests

```bash
bun run typecheck   # passes immediately
bun run lint        # passes immediately
bun run test        # runs 33 tests:
                    #   14 reconcile cases
                    #   10 CSV parser cases
                    #   9 XML parser cases
                    #   (RLS isolation tests skipped — ungated until Phase 1)
```

If any unit test fails, that's a real bug — tell me and I'll fix it before anything ships.

### C4. First Vercel deploy

```bash
bunx vercel deploy
```

Vercel CLI will:
- Build the Next.js app
- Run your `bun run build` command
- Upload the bundle
- Return a preview URL like `https://audible-<hash>-<team>.vercel.app`

Open the URL in a browser. You should see the Phase 0 landing page saying "Audible" + "Football intelligence for high school and small college programs" + "Phase 0 scaffolding. Coming online now."

### C5. Health check

```bash
curl https://audible-<hash>-<team>.vercel.app/api/health
```

Expected response:

```json
{"status":"ok","phase":"phase-0-scaffolding","timestamp":"..."}
```

That's Phase 0 **shipped**. Real URL, real database, real infrastructure.

### C6. Promote to production

When you're ready:

```bash
bunx vercel deploy --prod
```

This promotes the build to your production domain (or the default `audible.vercel.app` until you add a custom domain).

---

## Phase D — Verify the CI pipeline (≈ 5 minutes)

Make a trivial PR to prove CI works end-to-end:

```bash
git checkout -b test/ci-smoke
echo "# CI smoke test" >> README.md
git commit -am "test: ci smoke"
git push -u origin test/ci-smoke
```

Open a PR on GitHub. Within a minute you should see:
- A **Vercel — Preview** check creating a preview URL
- A **CI — Typecheck, lint, test** check running Vitest

Both should go green. Close the PR without merging.

If either fails, tell me what failed and I'll fix it.

---

## You're done with bootstrap.

At this point you have:

- ✅ A GitHub repo with all Phase 0 code
- ✅ A Vercel project linked to it with auto-deploy on every push
- ✅ A Neon Postgres database with RLS-enforced schema
- ✅ Clerk auth ready to wire up in Phase 1
- ✅ Resend for transactional email
- ✅ Vercel Blob for film storage
- ✅ Vercel AI Gateway + Anthropic key ready for Phase 4.5 vision work
- ✅ A working preview URL serving the Next.js shell
- ✅ CI passing on PRs
- ✅ Health check endpoint returning 200
- ✅ 33 unit tests passing

**Next: Phase 1 — Clerk auth wiring + program setup + the first real UI screens.** Tell me when you're at "bootstrap complete" and I'll start building it.

---

## If something goes wrong

Most bootstrap errors fall into these buckets:

| Symptom | Likely cause | Fix |
|---|---|---|
| `bun install` fails with 403 | Private package needs auth | Tell me — there shouldn't be any private packages in Phase 0 |
| `db:migrate` fails with "permission denied" | Neon connection string uses the wrong role | Copy the pooled connection string from the Neon dashboard's "Connection Details" → Vercel env |
| `vercel deploy` builds locally but fails on Vercel | Env var missing in Vercel | Run `bunx vercel env pull .env.local` and compare with the Vercel dashboard |
| Health check returns 404 | App Router path mismatch | The route file should be at `src/app/api/health/route.ts` exactly |
| Clerk middleware error on first page load | Middleware not yet wired | Normal — we haven't enabled Clerk auth yet, Phase 1 does this |
| RLS tests fail with "relation does not exist" | Migration 0001 didn't run | Run `bun run db:migrate` explicitly |

For anything not in this list, paste the error and I'll walk through it.
