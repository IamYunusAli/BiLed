# DAPS Tracker

A small **multi-tenant project tracker**. Several organizations share one app and one database, and each organization only ever sees its own projects, tasks and members. Projects have a budget in Ethiopian Birr (ETB); tasks have an estimated cost, an optional actual cost, a priority, an assignee and a due date. Every project shows **budget vs committed vs actually spent** and a status: **On track**, **At risk** or **Overrun**.

**Live:** https://daps-tracker.onrender.com (production, deployed from `main`).

It runs on Render's free tier: the first request after about 15 minutes idle takes 30–60 s while the instance wakes up. Demo logins are sent separately; seed passwords are GitHub secrets, never committed.

## What it does

- Registration and login. Organizations, with **admin**, **member** and read-only **viewer** roles. A user can belong to many organizations.
- Members join through **single-use invite links** that expire after 7 days. Only a hash of each link is stored, and admins can revoke links.
- Projects with an ETB budget. Tasks with status, **priority (high / medium / low) and a priority filter**, assignee, due date (overdue tasks are flagged), and **estimated and actual cost**.
- A **My tasks** page across all of a user's organizations.
- A per-organization **activity log**: append-only, written in the same transaction as each change.
- Server-rendered pages (the "Ledger" design, typed TSX components) and a JSON API that enforce exactly the same rules.

## Architecture

```
Browser (HTML forms, cookie JWT) ─┐
API client (Bearer JWT) ──────────┴─► Express 5 on Render (Node 22, TypeScript built with tsc)
                                        helmet · CSRF guard · authenticate
                                        loadMembership  ◄── the tenant boundary
                                        routes (TSX pages + JSON API) → services → repositories (SQL)
                                                                                     │ TLS
                                                                     Neon PostgreSQL (production branch)
```

- **One service, server-rendered.** Pages and API share the same services and repositories, so authorization exists exactly once. The browser never filters data; even the priority filter runs in SQL.
- **PostgreSQL with hand-written, parameterised SQL** (`pg`). No ORM, so the tenant filter is visible in every query.
- **Migrations** with `node-pg-migrate`. Each file has `up` and `down`, runs in one transaction, and is recorded in `pgmigrations`.
- **TypeScript everywhere, strict.** `tsc` compiles `src/` to `dist/` for production (`node dist/server.js`); tests, scripts and migrations run through `tsx`. Pages are **TSX components** rendered on the server by a ~60-line JSX runtime (`src/views/jsx.ts`) with no client framework: every page's data is type-checked, and every string is HTML-escaped by default (`raw()` is the only bypass, used for the static icon set). The small progressive-enhancement script is TypeScript too (`src/client/app.ts` → `public/app.js`). A **branded `OrgId` type** makes tenant scoping a compile-time rule: tenant-scoped repository functions only accept an `OrgId`, and the only way to get one is from the verified membership (see below).
- **Auth:** bcrypt-hashed passwords; a JWT holding only the user id, in an `httpOnly; SameSite=Lax; Secure` cookie (or an `Authorization: Bearer` header for API clients).

Code map: `src/middleware/tenant.ts` (membership check) · `src/domain.ts` (roles, `OrgId`, `Tenant`) · `src/repositories/*` (all SQL) · `src/services/*` (rules and activity-log entries) · `src/routes/{api,web}.ts` · `src/views/` (TSX pages, partials, JSX runtime) · `src/client/` (browser script) · `migrations/` · `test/` · `scripts/`.

## Branches and deployment

```
feature/* | release/*  ──PR──►  development  ──PR──►  staging  ──PR──►  main
                                 tested,             tested,            │ tested, then deployed
                                 not deployed        not deployed       ▼
                                                                    Production
                                                         (Neon "production", Render daps-tracker)
```

- Work happens on a `feature/*` (or `fix/*`, `hotfix/*`, `release/*`) branch and reaches `development` **only through a pull request**.
- A PR is merged only when CI is green: every PR shows the **Test** and **Promotion rules** checks. (Enforcing this with branch protection needs a public repository or GitHub Pro; on this private Free repo the rule is followed by convention.)
- Promotion always goes **development → staging → main**. The **Promotion rules** check fails any PR whose source branch isn't the allowed one (for example, a feature branch straight into `main`).
- **Only `main` is deployed**, to production. `development` and `staging` are integration branches: every push and PR on them runs the full **Test** job (typecheck, build, migrations up, down and up again, all tests), but nothing is deployed from them. A change reaches users only after passing that gate three times, once per promotion.

## CI/CD pipeline (`.github/workflows/ci-cd.yml`)

On **every push and every pull request**, the **Test** job:
1. Checks out the code and installs Node from `.node-version` (the same file Render reads).
2. Runs `npm ci`, then `npm run typecheck` (strict `tsc --noEmit` over the app, pages, browser script, tests, scripts and migrations) and `npm run build` (the same build Render runs).
3. Starts a throwaway PostgreSQL 16 service container.
4. Applies all migrations.
5. Runs `npm run check:migrations`:
   - It rolls back to just before the priority migration and inserts a task without a priority.
   - It migrates up again and asserts that task became `medium` with its other data unchanged, and that the constraints hold.
   - It then rolls **every** migration back to an empty schema and applies them all again.
6. Runs `npm test` (63 API and page tests against the real database, including the cross-tenant suite and an XSS suite that checks user-supplied names render escaped).

On **every pull request**, the **Promotion rules** job checks the source branch: `staging` only from `development`, `main` only from `staging`, `development` only from `feature/*`, `fix/*`, `hotfix/*` or `release/*`.

On a **push to `main`** (which only happens by merging a green PR from `staging`), the **Deploy to production** job runs with `needs: Test`, so it **never starts unless every test passed**. It runs in the `production` GitHub Environment, the only place the production secrets exist:
1. Checks the environment is configured.
2. Applies migrations to the production Neon branch through the **direct** connection (the pooled connection can't hold the migration lock).
3. Calls the Render deploy hook with `ref=<this commit's SHA>`, so Render deploys exactly the tested commit.
4. Polls `/healthz` until it reports that SHA (`RENDER_GIT_COMMIT`), then runs a smoke test.

**Render auto-deploy is off**, so the only way code reaches production is this job. The service builds with `npm ci --include=dev && npm run build` and starts with `node dist/server.js`; `/healthz` is its health check.

**Ops (manual)** (`.github/workflows/ops.yml`) runs `verify-data`, `seed` or `reset-demo-passwords` against production, with the same secrets.

| GitHub Environment | Secrets | Variable |
|---|---|---|
| `production` | `DATABASE_URL_DIRECT`, `RENDER_DEPLOY_HOOK_URL` | `APP_URL` |
| repository-wide | `SEED_ADMIN_PASSWORD`, `SEED_MEMBER_PASSWORD` (optional `SEED_VIEWER_PASSWORD`, `SEED_OTHER_PASSWORD`) | |

## Migrations

| File | Change | Rollback (`down`) |
|---|---|---|
| `…_initial-schema` | users, organizations, memberships, projects, tasks, invites | drops them |
| `…_add-task-priority` | **Part 3**: priority column (see below) | drops index, constraint, column |
| `…_add-viewer-role` | allows role `viewer` on memberships and invites | **removes** viewers (fails closed instead of upgrading them to members) |
| `…_add-task-assignee-due-date` | `assignee_id` with a composite FK to memberships, and `due_date` | drops them |
| `…_add-task-actual-cost` | nullable `actual_cost_santim` (NULL = not recorded yet) | drops it |
| `…_add-activity-log` | `activity` table and an append-only trigger | drops them |

### The priority migration (Part 3)

`migrations/1763384400000_add-task-priority.ts` is written the way it has to run against a live table:
1. **Expand:** `ADD COLUMN priority text`, nullable. Metadata-only: no table rewrite, no long lock.
2. **Backfill:** `UPDATE tasks SET priority = 'medium' WHERE priority IS NULL`. Existing tasks become medium.
3. **Tighten:** `DEFAULT 'medium'`, `NOT NULL`, `CHECK (priority IN ('low','medium','high'))`.
4. **Index:** `(org_id, project_id, priority)` for the filter.

All four steps run in **one transaction**: if any fails, nothing changes and the deploy step never runs. Old application code keeps working after it (it doesn't read the column, and inserts get the default), so code and schema can be rolled back independently. The backfill on pre-existing tasks is proven on every pipeline run by `check:migrations`, on `development`, `staging` and `main` alike, before the deploy job may start.

**Proving live data survives a migration:** run **Ops → verify-data** before and after the deploy. It prints row counts and content checksums, which must be identical. Production after migrate and seed: 3 users, 2 organizations, 3 memberships, 2 projects, 7 tasks (high 3 · medium 3 · low 1).

**Rollback plan:**

| Situation | Action |
|---|---|
| A migration fails in the pipeline | Its transaction rolls back; the deploy step never runs; the old code keeps serving. Fix forward through a new PR. |
| New code is broken, schema is fine | Redeploy the previous commit (`<deploy hook>&ref=<previous sha>`, or Render → Rollback). Old code ignores the extra columns. |
| The schema change itself must go | 1) Deploy the previous code. 2) `npm run migrate:down` against the production direct URL. ⚠️ Priorities set since the migration are lost, so export them first: `COPY (SELECT id, priority FROM tasks) TO STDOUT`. |
| Data damage | Restore from a Neon snapshot branch taken just before the migration. |

## How tenant isolation is enforced

1. **Membership check on every request.** All org data lives under `/orgs/:orgId/…`. `loadMembership` looks up `(orgId, currentUser)` in `memberships`; no row means **404** (not 403), so outsiders can't even confirm an org exists. The URL's org id is only a *selector*: handlers read the org only from the verified, frozen tenant (`tenantOf(req)`), never from `req.params` or the body.
2. **Every query is scoped by `org_id`, and the compiler checks it.** Repository functions take an `OrgId` first. `OrgId` is a branded type: a plain string from a URL or body doesn't type-check, and `verifiedOrgId()` (which creates one) is called only after membership is verified: in `loadMembership`, and when creating an org or accepting an invite, where the membership is created in the same transaction. At runtime `assertOrg` still throws if the id is missing. Lookups by id use `WHERE id = $2 AND org_id = $1`, so `/orgs/MY-ORG/tasks/THEIR-TASK` matches nothing and returns 404.
3. **Creating a task** is one `INSERT … SELECT … FROM projects WHERE id = $project AND org_id = $org`: a project of another org inserts nothing.
4. **The database enforces it too.** `(project_id, org_id) → projects(id, org_id)` means a task can't be attached to another org's project. `(org_id, assignee_id) → memberships(org_id, user_id)` means a task can only be assigned to a member of its own org.
5. **Roles are read from the database on each request**, not stored in the token, so removing a member or changing a role takes effect immediately.
6. **"My tasks"** spans orgs, so it joins `memberships` for the current user explicitly.
7. **Tested** in `test/tenant-isolation.test.ts` and the viewer, assignee, invite and activity suites: another org's user tries to read, change, delete and create, including ID-swap URLs and an `org_id` smuggled in the body. The tests assert 404 *and* check the database to prove nothing changed. The same probes were run against production with real IDs from three organizations: 38 of 38 returned 404.

**Where it could still leak:**
- A future query that forgets `org_id` in its SQL. The `OrgId` type proves the id reaches the repository, not that the SQL uses it. The repository-only rule, the isolation tests and code review cover that gap.
- A new `verifiedOrgId()` call in the wrong place would bypass the type check. Its three call sites are documented in `tenant-guard.ts`; any new one should be treated as a review red flag.
- Aggregate or reporting queries added later.
- Caches keyed without the tenant.
- **Invite links are bearer credentials.** Whoever holds one can join with its role. To limit that, links are single use, expire after 7 days, can be revoked, and only a SHA-256 hash is stored; the UI warns before creating an admin link.
- The JWT can't be revoked before it expires (8 h). Org access is still revoked immediately, because membership is checked on every request.

## Roles

| Action | admin | member | viewer | not a member |
|---|---|---|---|---|
| View org, projects, tasks, members, activity | ✅ | ✅ | ✅ | 404 |
| Create, edit or delete tasks; be assigned tasks | ✅ | ✅ | 403 | 404 |
| Create, edit or delete projects and budgets | ✅ | 403 | 403 | 404 |
| Create or revoke invite links, change roles, remove members, rename org | ✅ | 403 | 403 | 404 |

The last admin can't be demoted or removed; the check locks the membership rows (`SELECT … FOR UPDATE`) so two concurrent requests can't both pass it.

## Budget model

| Figure | Meaning |
|---|---|
| **Budget** | Set by an admin, per project, in ETB |
| **Committed** | Sum of all task **estimates** |
| **Actually spent** | Sum of recorded **actual costs** |
| **Status** | **Overrun** if actual > budget · **At risk** if committed > budget · otherwise **On track** |

Money is stored as integer santim (1 ETB = 100 santim) and formatted as `ETB 0,000.00` only for display.

## Decisions

- **Explicit org-scoped SQL plus composite foreign keys, instead of ORM scopes or Row-Level Security.** Isolation is readable in every query, the database itself rejects cross-org links, and it's easy to walk through. RLS is the next layer to add.
- **Migrations run from the pipeline, before a commit-pinned deploy hook, with Render auto-deploy off; every change is promoted development → staging → main, and only main deploys.** The test gate, the schema change and the "is it live" check sit in one auditable run. A failed migration never ships code, and one production environment keeps the free-tier footprint (and the secrets) to a single place.
- Also:
  - Neon instead of Render Postgres (Render's free database is deleted after 30 days; Neon branches also make a throwaway copy of production cheap when a risky migration needs rehearsing).
  - TypeScript in strict mode, compiled with plain `tsc` (no bundler), so `dist/` mirrors `src/` file for file. Server-side TSX instead of a template engine, so views are type-checked like the rest of the code.
  - Money as integer santim.
  - 404 instead of 403 for outsiders.
  - CSRF handled by Fetch Metadata plus an Origin check (OWASP), since login is stateless.
  - Activity entries written in the same transaction as the change.

## Before real production I would add

- **PostgreSQL Row-Level Security** (`FORCE` RLS, a non-owner app role, `set_config('app.org_id', …, true)` per transaction) as a second enforcement layer.
- Revocable sessions or refresh tokens; signed CSRF tokens for sensitive actions; Argon2id; MFA, email verification, password reset.
- Required reviewers on the `production` environment, structured logs and error tracking, an uptime alert on `/healthz`.
- A paid always-on instance, point-in-time-recovery backups with tested restores.
- Migration guard rails: `lock_timeout`, batched backfills, `NOT VALID` constraints.
- A shared rate-limit store (Redis), pagination, dependency and secret scanning, Node 24 LTS.

## Run it locally

```bash
cp .env.example .env            # set DATABASE_URL and JWT_SECRET
npm ci
npm run migrate:up
SEED_ADMIN_PASSWORD=... SEED_MEMBER_PASSWORD=... npm run seed
npm run dev                     # http://localhost:3000 (tsx, restarts on change)
npm run typecheck               # strict tsc over everything
npm run build && npm start      # the production build: dist/server.js
```

Tests use `.env.test` (a separate database): `npm run check:migrations` then `npm test`. On Windows, `npm run db:start` starts the local Postgres kept in `.local/pgdata`.

`DEMO_BASE_URL=http://localhost:3000 npm run demo` creates 9 demo users, 3 organizations, 6 projects and 28 tasks through the app's own forms, then checks isolation and roles for them. Passwords go to `.local/demo-accounts.json`, which is git-ignored.
