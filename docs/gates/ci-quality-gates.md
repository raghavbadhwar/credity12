# CI Quality Gates (Check / Test / Contracts / Security)

This document defines the required CI quality gates and what counts as pass/fail.

## Workflow

- **Primary workflow:** `.github/workflows/quality-gates-ci.yml`
- **Focused contracts workflow:** `.github/workflows/contract-security-ci.yml`

The quality workflow is path-aware and only runs impacted module jobs for pull requests and pushes to `main`/`master`.

## Gate Criteria

### 1) Check gate (type/build correctness)

**Purpose:** catch compile/type errors before merge.

Runs on impacted modules:
- `packages/shared-auth`: `npm run build`
- `BlockWalletDigi`: `npm run check`
- `CredVerseIssuer 3`: `npm run check`
- `CredVerseRecruiter`: `npm run check`

**Pass:** command exits 0.
**Fail:** any non-zero exit code.

### 2) Test gate (unit/integration regression guard)

Runs on impacted modules:
- `BlockWalletDigi`: `npm test`
- `CredVerseIssuer 3`: `npm test`
- `CredVerseRecruiter`: `npm test`
- `credverse-gateway`: `npm run test:proxy`
- `apps/mobile`: `npm test`

**Pass:** all selected module tests pass.
**Fail:** any selected module test command fails.

### 3) Contracts security gate

Runs when smart contract files are touched, or manually via workflow dispatch:
- `CredVerseIssuer 3/contracts`: `npm run analyze:static`

`analyze:static` includes:
- Solidity linting
- Contract compilation
- Hardhat tests

**Pass:** full pipeline exits 0.
**Fail:** lint, compile, or tests fail.

### 4) Dependency security gate

Runs for impacted module lockfile/package changes:
- `npm audit --omit=dev --audit-level=high`

Scope includes root and all major modules (wallet, issuer, recruiter, gateway, mobile, shared-auth, contracts).

**Pass:** no High/Critical runtime dependency vulnerabilities in selected scope.
**Fail:** audit reports High/Critical findings.

## Practicality Controls

To keep CI practical while still strict:
- Path-based filtering avoids running unrelated module jobs.
- Matrix jobs run with `fail-fast: false` to show full failure surface in one CI run.
- Job timeouts cap runaway executions.
- Concurrency cancellation prevents stale duplicate runs on the same branch.

## Operator Notes

- Use **workflow_dispatch** to run full checks manually before release.
- If `npm audit` fails on a known transitive issue with no patch, document exception + mitigation in launch evidence and track owner/ETA for remediation.
- For hosted audit evidence, use `docs/gates/hosted-ci-evidence-path.md`. The workflow now publishes `quality-gates-evidence-<run_id>` artifact containing run URL + job result summary for release board mapping.
