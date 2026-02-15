# DB Migration Safety (Rollback-Safe)

Scope: `BlockWalletDigi`, `CredVerseIssuer 3`, `CredVerseRecruiter`.

## Current baseline

- All three services use Drizzle schema definitions (`shared/schema.ts`).
- Migration output directories are configured as:
  - `BlockWalletDigi` → `migrations/`
  - `CredVerseIssuer 3` → `drizzle/`
  - `CredVerseRecruiter` → `migrations/`
- In current repo state, migration SQL history is not committed for these services.

## Safe migration policy (expand/contract)

1. **Expand first (backward compatible):**
   - Add nullable columns/tables.
   - Add indexes concurrently where possible.
   - Avoid changing/removing existing columns in same release.

2. **Backfill safely:**
   - Backfill in batches.
   - Keep old + new fields live while app writes both (or reads with fallback).

3. **Cut over in app code:**
   - Deploy app that can read new schema before removing old schema.

4. **Contract later (separate release):**
   - Only drop/rename after at least one stable release cycle and verified no reads remain.

## Rollback guardrails

- Before apply:
  - Snapshot/backup DB (`pg_dump` or provider snapshot).
  - Run: `npm run db:safety:check`.
  - Review migration SQL for `DROP`, `ALTER TYPE`, `TRUNCATE`, mass `DELETE`.
- During rollout:
  - Apply schema first, then app deploy.
  - Monitor error rate + DB locks/latency.
- If rollback needed:
  - Roll back application first.
  - Prefer forward-fix migration over destructive down migration.
  - Restore DB snapshot only for severe corruption/data-loss events.

## CI recommendation

Add `npm run db:safety:check` to CI for PRs touching:

- `*/shared/schema.ts`
- `*/migrations/**` or `*/drizzle/**`
- `*/drizzle.config.ts`

## Team conventions

- Commit generated migration SQL files; avoid `db:push`-only workflows for production.
- One migration concern per PR (small, auditable diffs).
- Include a rollback note in PR description.
