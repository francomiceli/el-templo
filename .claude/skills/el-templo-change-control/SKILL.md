---
name: el-templo-change-control
description: Change-control rules for the El Templo monorepo. Load BEFORE committing, staging files (git add), branching, pushing, merging, shipping to staging or production, cutting a hotfix, releasing or triggering store builds, bumping app versions, installing or updating any dependency, deploying frontends, SSHing to the server, or touching production data. Covers staging-first workflow, hotfix routing, the migration-numbering constraint, explicit git add, human approval gates, version bump conventions, CDN policy, pre-commit hooks, and small-fix vs GSD-phase classification.
---

# El Templo — Change Control Runbook

Ground rules for moving code from a local branch to production in this monorepo
(`el-templo-api` Fastify+Drizzle+MySQL, `el-templo-app` Quasar+Capacitor,
`el-templo-admin` Quasar web). Every rule here exists because something broke.
The incident is documented next to each rule — do not relitigate them.

## Glossary (defined once, used throughout)

| Term               | Meaning                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **staging-first**  | All feature work reaches production only via the `staging` branch. Nothing feature-shaped is pushed straight to `master`.                                                                          |
| **tren** ("train") | A batch merge of `staging` → `master` that ships everything accumulated on staging to production at once. Example: commit `0e8b928c` "Merge staging into master — tren v5.2+v5.3+144+148+143-fix". |
| **hotfix**         | An urgent fix branched from `origin/master` (clean prod state), shipped to prod without waiting for whatever is cooking on staging.                                                                |
| **GSD phase**      | Milestone-level planned work tracked under `.planning/` (ROADMAP, PLAN.md, phase directories). Contrast: a _small fix_, done directly without planning artifacts.                                  |
| **worktree**       | A `git worktree` checkout used to work on a different base (usually `origin/master`) without disturbing the current branch.                                                                        |
| **human gate**     | An action that requires the user's explicit OK in the current conversation before executing. Memory, prior turns, or standing context never count as authorization.                                |

## Deployment topology (as of 2026-07-05)

- Remote: `origin` = `git@github.com:francomiceli/el-templo.git`.
- Push to `staging` → `.github/workflows/deploy-staging.yml` deploys to staging.
- Push to `master` → `.github/workflows/deploy.yml` deploys to **production** (detect changes → build changed apps → backup → rsync to EC2 → run migrations via `NODE_ENV=production node dist/db/run-migrations.js` → restart → smoke test → auto-rollback on failure).
- CI (`ci.yml`) runs on every push/PR to `master`/`main`/`develop`/`staging`: type check, lint, security audit, API integration tests against a real MySQL 8.0 service, builds.
- Staging and prod share the same EC2 host and MySQL server (separate databases). A migration merged to master runs against prod on deploy.

**Consequence: any push to `master` is a production deploy. Treat `git push origin <x>:master` as "deploy to prod now".**

---

## 1. Staging-first — strict

Feature work NEVER merges directly into `master`.

Flow: local feature branch → (user OK) → push to `staging` → CI + UAT on staging → (user OK) → tren `staging` → `master`.

Rules:

- GSD executor worktrees merge into a **local feature branch** (e.g. `feat/roster-effective-dated`), never into `master` and never into `master`-as-current-branch.
- When phase work is done, report that it lives on a local branch and _suggest_ pushing to staging. Do not push.
- Merge to master only when the user explicitly says "push to production" / "merge to master".
- If the user wants a quick fix deployed, ship _only_ that fix — never let unfinished feature work hitchhike on the same push.
- Milestone work can accumulate locally for weeks unpushed. That is intentional; do not "helpfully" sync it.

**Incident (the reason this is strict):** Phase 78 worktrees were merged directly into master. When the user later pushed a small unrelated fix, ALL of phase 78 rode along to production and broke `/auth/me` (its migration wasn't committed). Recovery required a revert plus a "revert of the revert".

Related hard sub-rule: **always commit migration SQL files alongside schema changes** — executor agents sometimes create the Drizzle TS schema but skip the SQL file. Verify the `el-templo-api/src/db/migrations/*.sql` file exists and is staged before calling a change complete.

## 2. Hotfix path

Hotfixes bypass whatever is parked on staging, but never bypass the staging _environment_.

```bash
git checkout -b hotfix/<description> origin/master   # base = clean prod state, NOT staging, NOT local master
# ...fix, commit...
# ASK THE USER FOR OK, then:
git push origin hotfix/<description>:staging          # staging FIRST
git push origin hotfix/<description>:master           # then master (prod deploy)
```

- Never push a hotfix only to master. The user expects staging-first even for urgent fixes.
- If `staging` has diverged (merge commits), merge master into a local staging checkout first, then push.
- Real examples in history: `65efec0d` (Horarios roster hotfix), PR #3 `hotfix/roster-effective-dated` (`44905fbd`).

## 3. Shipping to prod while staging is busy with a long milestone

`master` = source of truth for prod. `staging` = integration/testing lane. They are **not** forced to be sequential: when staging is occupied for weeks with a half-tested milestone, other work can still ship to prod without dragging the milestone along.

```bash
git worktree add ../et-fix origin/master   # isolated worktree, base = prod
# ...work, commit in ../et-fix...
# ASK FOR OK, then:
git push origin HEAD:master                # deploy to prod
# then back-merge so staging keeps testing on the newest base:
#   merge origin/master into staging (local), push staging (with OK)
```

The back-merge (`master` → `staging` after every such ship) is mandatory — otherwise the fix gets lost when the milestone train eventually merges.

**HARD CONSTRAINT — migration numbering.** Migrations are numbered sequentially (`0169_...` is the highest as of 2026-07-05) and tracked in the `_migrations` DB table. While a milestone accumulates migrations on staging, master falls behind in numbering (historical example: master at 0152 while staging was at 0157). Therefore:

- **Code-only changes (no migration):** free to ship direct-to-master any time.
- **Changes WITH a migration:** shipping to master ahead of the milestone collides with the milestone's numbering and diverges the apply order between staging and prod. Only safe if the migration is fully independent of the milestone's tables AND divergent apply order is explicitly accepted. The clean path: land the milestone in master first, then number the new migration after the milestone's top.

Precedents of this pattern working: phase 143, the Fran-Scaine training gating (`25c2df97`, pushed directly to origin/master from a master-based worktree), the Horarios hotfix.

## 4. Committing safely

### `git add` is ALWAYS by explicit path

Never `git add -A`, never `git add .` in this repo. Stage the exact files you touched:

```bash
git add el-templo-api/src/modules/foo/service.ts el-templo-api/test/foo/foo.test.ts
```

**Why:** the working tree permanently contains dangerous untracked files. Verified present as of 2026-07-05 (`git status --porcelain | grep '^??'`):

- `.claude/worktrees/` — embedded git repos (agent worktrees)
- `digital-initiatives/` — embedded repos (`El-Templo-Net`, `arete-app`, `arete-web`, `whatsapp-agent-renovafacil`)
- `eltemplo-upload-key.keystore`, `eltemplo-upload-key.base64.txt` — Android signing key material
- `tools/el-templo-*-firebase-adminsdk-*.json`, `tools/google-services_prod.json`, `tools/google-services_staging.json`, `tools/GoogleService-Info.plist` — Firebase credentials
- Member-data exports at repo root (`*.xlsx`, `*.csv`, `*.tsv`)
- Assorted build output (`el-templo-web/dist`) and handoff/brief `.md` files

**Incident:** a `git add -A` once committed 43 junk files; the push to staging was **rejected** by repository rules ("repository rule violations", embedded repos), requiring `git reset --mixed HEAD~1` and a re-commit of only the correct files. The repo protection caught the secrets that time — do not depend on it.

### Pre-commit hooks

Husky runs lint-staged on every commit (root `package.json`): ESLint `--fix` for `el-templo-app`/`el-templo-admin`/`el-templo-web` TS+Vue files, Prettier for all `*.{ts,vue,js,json,md}`.

- If a commit fails on lint-staged: fix the issue and make a **new commit**. Do not amend.
- Note that lint-staged may rewrite staged files (`--fix`, `--write`) — another reason explicit staging matters.

## 5. Human gates — always ask first

These require the user's explicit OK **in the current conversation, per action**. Blanket approval earlier in the session does not carry over to the next push.

| Action                                                                | Gate                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git push` to any remote branch                                       | Show the commit summary/diff, ask "Ready to push to staging / master?", wait for OK. Confirm before _each_ push, even after the user said "push to staging and production" earlier.                                                                                                                                                                                                              |
| SSH / remote exec (`ssh`, `scp`, `rsync` to remote, session managers) | Surface the exact intended command and wait for approval — every single time, for any reason (logs, diagnostics, restarts). Host/user/key details remembered from past context are context, **not** authorization. This gate survives permission-bypass flags. (Incident: an agent once SSHed into the shared prod EC2 unprompted, using credentials inferred from past conversations.)          |
| Manual frontend builds/deploys                                        | Don't. Push and let CI deploy. (Incident: a manual admin build shipped with `.env.development` defaults — requests went to `localhost:3000` instead of the staging API, breaking staging.) If the user explicitly asks for a manual build: `VITE_API_URL=https://api-staging.eltemplo.org/api npx quasar build`. Manual API deploys (dist rsync + pm2 restart) are env-safe but still SSH-gated. |
| Installing or updating dependencies                                   | See section 6.                                                                                                                                                                                                                                                                                                                                                                                   |

## 6. Dependencies: never install or update without asking

- Never run `pnpm add`, `npm install <pkg>`, `pnpm update`, `npm update`, dedupe, or anything that changes the dependency tree, without explicit approval.
- Never bump a version in `package.json` by hand without asking — patch releases get compromised too.
- Applies to runtime, dev, and peer deps. No exceptions.
- Adding a dependency is the last resort: first try stdlib, existing deps, or writing the code.

**Why:** the axios@1.14.1 supply-chain compromise (March 2026) poisoned a patch release of one of the most trusted packages on npm; the litellm/Trivy incident in the same window harvested SSH keys, AWS tokens, and K8s configs. Every dependency change is attack-surface expansion.

## 7. Production data changes go through migrations

Gate rule only (mechanics live in the sibling skill `el-templo-db-migrations`):

- Any prod data change — new branch, plan, schedule, price — is a **SQL migration file** in `el-templo-api/src/db/migrations/`, applied by `pnpm db:migrate` (same runner the deploy pipeline uses).
- Never re-run `seed-production.ts` against prod, even though it is labeled idempotent. It touches many tables at once, can clobber manually-adjusted prod rows (schedule times, prices), and leaves no audit trail in `_migrations`. Migrations are targeted, tracked, reviewable.
- Because staging and prod share the MySQL host, a migration merged to master runs against prod — test data goes in via ad-hoc scripts, never via a migration.

## 8. Version bumps for store builds

Bump on production pushes that will trigger a mobile app build:

- **Feature / new functionality** → minor (`1.5.6` → `1.6.0`)
- **Bug fix** → patch (`1.5.6` → `1.5.7`)

**`el-templo-app/version.txt` is the ONLY version CI reads.** Verified: `build-ios-production.yml`, `build-ios-staging.yml`, and `build-android-production.yml` all read it (`tr -d '[:space:]' < …version.txt`) and inject it as `MARKETING_VERSION` / `VERSION_NAME`, overriding whatever is hardcoded in `build.gradle`, `project.pbxproj`, or `package.json`.

Process:

```bash
# 1. edit el-templo-app/version.txt (X.Y.Z)
# 2. propagate to native projects for local-build parity:
el-templo-app/bump-version.sh
# 3. optionally sync el-templo-app/package.json "version" (cosmetic, manual)
# 4. commit, get OK, push, trigger build workflows
```

Never edit `build.gradle` / `project.pbxproj` directly for versions — the script does it, and CI ignores them anyway.

**Incident (2026-04-17):** package.json + build.gradle + pbxproj were bumped to 1.2.1 but `version.txt` was forgotten → CI built 1.2.0 → App Store Connect rejected the submission because the 1.2.0 version record was already locked from an earlier failed delivery.

## 9. No CDN dependencies in production

No runtime third-party CDN fetches (unpkg, jsdelivr, Google Fonts `<link>`, etc.) in production builds. Self-host: copy assets into the app's `public/` at build time; prefer `@fontsource/*` packages over Google Fonts tags (the project already does this). If a CDN shortcut is the only way to unblock a build, ship it but flag it explicitly as tech debt to be self-hosted later. Known acknowledged debt: ffmpeg.wasm core files loaded from unpkg in `el-templo-admin/src/utils/videoTranscoder.ts`.

## 10. Tests run in CI, not locally

- Local: typecheck (`npx tsc --noEmit`) freely; optionally run one narrow test file to sanity-check new code.
- Do NOT run broad integration suites locally — they hit real MySQL (~500ms/test, minutes per file) and block the machine. CI runs the full suite in parallel on push to staging.
- When tests are written: announce they're ready and ask for OK to push to staging so CI runs them. Accepted tradeoff: a red CI commit on staging gets fixed forward.

## 11. Change classification: small fix vs GSD phase

| Signal                                                                          | Route                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scoped fix, clear intent, even if it touches several files                      | **Direct**: read the code, do it, commit. No plan mode, no `.planning/` artifacts.                                                                                                                          |
| New feature area, milestone-level scope, needs requirements/phases/verification | **GSD phase**: goes through `.planning/` (roadmap → discuss → plan → execute → verify).                                                                                                                     |
| Chaining multiple GSD phases unattended                                         | Sequential `/gsd-execute-phase <N>` calls on **already-planned** phases. Avoid `/gsd-autonomous` (history of stalling and making decisions the user wants to make). If a phase isn't planned, stop and ask. |

Keep responses proportional: for simple data/CRUD tasks, a short bullet plan and **one** confirmation question.

## 12. Branch hygiene in the shared main checkout

The main checkout (`/home/franco/projects/el-templo`) is shared across sessions, and code work happens in worktrees — so the only thing that regularly commits here is GSD docs work, which commits wherever HEAD happens to be. Without these rules the checkout drifts onto a stale branch indefinitely.

- **New branches are ALWAYS cut from `origin/<target>`** (`origin/master` for fixes/hotfixes, `origin/staging` when the work rides the milestone lane) — never from HEAD. Before editing anything, verify the base: `git fetch && git rev-list --left-right --count origin/master...HEAD`. A large left count means HEAD is stale; `N 0` means the branch is already fully merged.
- **Re-park the checkout when you finish.** Never leave it sitting on the feature/fix branch you just shipped. Park it on a branch that equals `origin/master` (or on `staging`). A parked stale branch silently becomes the base for the next weeks of docs commits.
- **`.planning` docs commits must not accumulate unpushed on a side branch.** They are docs-only: after a batch, propose pushing them to **master AND staging** (push gate still applies). Verify no drift with `git log origin/master..HEAD -- .planning`.

**Incident (2026-08-05, the reason for this section):** the checkout sat parked on `fix/referral-preview-y-refresh-ficha` for 2+ weeks after that fix shipped. GSD sessions committed **154 docs commits (fases 164→173, 3 weeks of planning history)** onto it, reachable only from a stale branch whose name suggested it was safe to delete; 29 more GSD artifacts were never committed at all. Recovery required a docs-only rescue merge to master (`9da97479`) and staging (`dff0be6a`), plus a second batch for the orphans (`8179d875`), conflict-resolving 4 global state files by recency.

## When NOT to use this skill

- Migration mechanics (writing SQL, the runner's `;`-splitting caveat, `_migrations` tracking, drizzle-kit quirks) → **el-templo-db-migrations**
- Diagnosing bugs, prod incidents, Sentry, log spelunking → **el-templo-debugging-playbook**
- Running the apps locally, env vars, build commands → **el-templo-build-and-run**
- Past incidents in depth / why the codebase looks the way it does → **el-templo-failure-archaeology**

## Provenance & maintenance

Facts above dated "as of 2026-07-05" drift. Re-verify with:

```bash
# deploy triggers and migration step
grep -n 'branches:' .github/workflows/deploy.yml .github/workflows/deploy-staging.yml .github/workflows/ci.yml
grep -n 'run-migrations' .github/workflows/deploy.yml
# which build workflows read version.txt
grep -rn 'version.txt' .github/workflows/
# current app version + bump script targets
cat el-templo-app/version.txt && sed -n '1,30p' el-templo-app/bump-version.sh
# dangerous untracked inventory (keystores, Firebase JSON, embedded repos)
git status --porcelain | grep '^??' | grep -viE '\.md$|\.gitkeep'
# highest migration number
ls el-templo-api/src/db/migrations/ | sort | tail -3
# pre-commit behavior
cat .husky/pre-commit && grep -A14 'lint-staged' package.json
# remote / branch model
git remote -v && git branch -a | head
```
