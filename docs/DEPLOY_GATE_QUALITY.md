# Production deploy gate — GitHub `quality` only

**Goal:** Production domains (`bino.casa`, `bamakor.vercel.app`, …) must not receive a new alias until GitHub Actions job **`quality`** succeeds.  
**Hard rule:** Do **not** require **`Supabase Preview`**. A failed Supabase Preview must never block production.

Verified on `main` after [#280](https://github.com/YoniLevy10/Bino/pull/280): `.github/workflows/ci.yml` job `quality` runs on **`ubuntu-24.04`**.

---

## Why this exists

- Audit F-01: Vercel can promote Production while CI is red.
- On commit `2ee7162` (`main` after #280): **`quality` = success**, **`Supabase Preview` = failure**. Gate must key off `quality` only so paid Branching noise cannot red-flag releases.

---

## OWNER_ACTION checklist

Do these in order. Agents cannot finish steps marked OWNER_ACTION (API/token scope blocked).

### A. Vercel — Deployment Checks (required)

Project: **bino** · id `prj_vb7qh0ngxJ02zbjmTI1kt5AUzd4q` · team `yonilevy10s-projects` (`team_WWxoCoCEGaEAK0e2JknuqGxq`)

1. Open **[Deployment Checks](https://vercel.com/yonilevy10s-projects/bino/settings/deployment-checks)**.
2. Click **Add Checks**.
3. Provider: **GitHub** (not Vercel Native Lint/Typecheck as a substitute for CI — keep the gate on the full `quality` job).
4. Search/select the GitHub check named exactly **`quality`** (GitHub Actions job name from `.github/workflows/ci.yml`).
5. Apply to **Production** only (do not add `Supabase Preview`).
6. Save. Next Production build should stay unaliased until `quality` is green, then auto-promote.
7. Confirm the checks list does **not** include **Supabase Preview**.

**Do not** use `commandForIgnoringBuildStep` / Ignored Build Step hacks for this.

Optional API (owner token with project write), equivalent to the UI:

```bash
curl -X POST "https://api.vercel.com/v2/projects/prj_vb7qh0ngxJ02zbjmTI1kt5AUzd4q/checks?teamId=team_WWxoCoCEGaEAK0e2JknuqGxq" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "quality",
    "requires": "none",
    "targets": ["production"],
    "blocks": "deployment-promotion",
    "source": {
      "kind": "git-provider",
      "provider": "github",
      "externalCheckName": "quality"
    }
  }'
```

`requires: "none"` is correct for a pre-existing GitHub Actions job on the commit (not a post-deploy `repository_dispatch` test). If the dashboard offers “block promotion until check passes”, that is the same intent as `blocks: "deployment-promotion"`.

### B. GitHub — branch protection on `main` (required)

Repo: [YoniLevy10/Bino](https://github.com/YoniLevy10/Bino)

1. Open **Settings → Branches → Branch protection rules** (or **Rules → Rulesets**).
2. Protect **`main`**.
3. Enable **Require status checks to pass before merging**.
4. Required check: **`quality` only**.
5. Do **not** require **Supabase Preview** (leave it optional / unchecked).
6. Prefer “Require branches to be up to date” only if you already use it; not required for this gate.

Agent attempt (2026-11-09): `PUT /repos/YoniLevy10/Bino/branches/main/protection` → **403** `Resource not accessible by integration`. Needs a repo **admin** (owner) click.

### C. Supabase Branching / Preview (strongly recommended)

**Supabase Preview failing must not block production.** Prefer disabling the paid Branching ↔ GitHub integration so failed preview DBs stop posting a red check and stop spawning compute.

1. Supabase dashboard for Bamakor → **Settings → Integrations / Branching** (or GitHub integration).
2. Disable automatic preview branches for this repo / PRs.
3. In GitHub, ensure branch protection and Vercel Deployment Checks do **not** list Supabase Preview.
4. Never create paid Supabase preview branches for agent testing (see `.cursor/rules/no-supabase-preview-branches.mdc`).

---

## How to verify after OWNER_ACTION

| Scenario | Expected |
|----------|----------|
| `quality` green, Supabase Preview red/absent | Production **can** promote / alias |
| `quality` red or pending | Production build may exist but **must not** alias to `bino.casa` / Bamakor until `quality` succeeds |
| Force Promote in Vercel UI | Emergency bypass only — avoid for normal releases |

---

## Agent status (this closeout task)

| Item | Result |
|------|--------|
| Confirm `main` CI `ubuntu-24.04` + job `quality` | **Done** (post-#280) |
| Vercel MCP create project check | **Blocked** — Checks v2 API exists (`POST /v2/projects/.../checks`) but MCP has no create/list project-check tools; no CLI token in agent env |
| GitHub branch protection require `quality` | **403** — OWNER_ACTION |
| Paid Supabase preview branches created | **None** |
| Runbook | This file |
