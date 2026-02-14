# Credity P0C — Launch Secrets / Operator Handoff Pack (Strict Gate + Production Wiring)

Prepared for: **priority lane P0C**  
Scope: `/Users/raghav/Desktop/credity` only  
Date: 2026-02-14 IST

---

## 1) Scope completed

Validated docs/scripts/runtime references for:

- `REDIS_URL`
- `SENTRY_DSN` / `GATEWAY_SENTRY_DSN`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- issuer key vars (`ISSUER_KEY_ENCRYPTION`, `ISSUER_KEY_ENCRYPTION_PREVIOUS`)

Validated files included:

- `.env.launch.example`
- `DEPLOYMENT.md`
- `scripts/launch-gate-check.mjs`
- `docs/gates/production-launch-gate.md`
- `infra/gcp/cloudrun/env.example.yaml`
- runtime service files in issuer/wallet/recruiter/gateway

No secret values were invented or inserted.

---

## 2) Consistency verdict (P0C)

## ✅ Consistent

1. **JWT secrets**
   - Docs/templates define `JWT_SECRET`, `JWT_REFRESH_SECRET`.
   - Runtime services consume these vars.

2. **Redis requirement**
   - Docs/templates define `REDIS_URL`.
   - Runtime strict mode requires it in issuer queue/gateway session store.

3. **Issuer key vars (runtime + docs)**
   - Runtime issuer signer uses `ISSUER_KEY_ENCRYPTION` and optional `ISSUER_KEY_ENCRYPTION_PREVIOUS`.
   - Docs/templates include both vars.

## ❌ Inconsistent / gaps (must resolve for clean production wiring)

### GAP-1 (Critical): `GATEWAY_SENTRY_DSN` is accepted by strict gate but not used by runtime

- `scripts/launch-gate-check.mjs` passes when **either** `SENTRY_DSN` or `GATEWAY_SENTRY_DSN` is present.
- `.env.launch.example` includes both.
- Gateway runtime (`credverse-gateway/server/services/sentry.ts`) reads **only** `SENTRY_DSN`.
- Net effect: strict gate can pass while gateway Sentry is effectively disabled if only `GATEWAY_SENTRY_DSN` is set.

### GAP-2 (Critical): strict launch gate does not validate issuer encryption key vars

- `scripts/launch-gate-check.mjs` currently does **not** enforce:
  - `ISSUER_KEY_ENCRYPTION`
  - (optional rotation) `ISSUER_KEY_ENCRYPTION_PREVIOUS`
- This allows a false-positive strict gate pass even when issuer key setup is missing.
- Issuer runtime will fail in production strict mode, but gate should catch this earlier.

### GAP-3 (Important): Cloud Run env example missing Sentry entries

- `infra/gcp/cloudrun/env.example.yaml` maps JWT/Redis/issuer keys, but does not include:
  - `SENTRY_DSN`
  - `GATEWAY_SENTRY_DSN`
- This is a deployment wiring blind spot vs launch-gate expectations.

---

## 3) Operator no-go/go policy for P0C

**NO-GO** until all three are true:

1. `SENTRY_DSN` is wired for gateway/runtime (or runtime updated to honor `GATEWAY_SENTRY_DSN`).
2. Strict gate validates issuer key requirement (`ISSUER_KEY_ENCRYPTION` at minimum).
3. Cloud Run secret mapping includes Sentry variable(s) used by runtime.

---

## 4) Exact operator checklist (execution order)

1. **Secret inventory present in secret manager** (no `.env` prod path):
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `REDIS_URL`
   - `SENTRY_DSN` (required in current runtime)
   - `ISSUER_KEY_ENCRYPTION`
   - `ISSUER_KEY_ENCRYPTION_PREVIOUS` (only when rotating)

2. **Format checks (before deploy):**
   - `JWT_SECRET`, `JWT_REFRESH_SECRET`: non-empty, high entropy (recommended 64 hex chars).
   - `ISSUER_KEY_ENCRYPTION`: exactly 64 hex chars (`^[a-fA-F0-9]{64}$`).
   - `REDIS_URL`: valid redis URI.
   - `SENTRY_DSN`: non-empty HTTPS DSN.

3. **Runtime wiring checks:**
   - Gateway has `SENTRY_DSN` (not just `GATEWAY_SENTRY_DSN`).
   - Issuer has `ISSUER_KEY_ENCRYPTION` and production flags (`NODE_ENV=production`, `REQUIRE_QUEUE=true` as applicable).

4. **Strict gate checks:**
   - `npm run gate:launch:strict`
   - `npm run gate:foundation`
   - `npm run gate:contracts:security`

5. **Health checks post-deploy:**
   - Issuer/Wallet/Recruiter/Gateway `/api/health` all green.

---

## 5) Exact commands (copy/paste)

## A) Local preflight env validation (no secret leakage)

```bash
cd /Users/raghav/Desktop/credity

set -a
source .env.launch.local
set +a

# Required presence checks
for v in JWT_SECRET JWT_REFRESH_SECRET REDIS_URL SENTRY_DSN ISSUER_KEY_ENCRYPTION; do
  if [ -z "${!v}" ]; then
    echo "MISSING: $v"; exit 1;
  fi
done

# Issuer key format check
printf '%s' "$ISSUER_KEY_ENCRYPTION" | grep -Eq '^[a-fA-F0-9]{64}$' || {
  echo "INVALID: ISSUER_KEY_ENCRYPTION must be 64-char hex"; exit 1;
}

echo "Preflight env checks: PASS"
```

## B) Strict launch + core gates

```bash
cd /Users/raghav/Desktop/credity

set -a
source .env.launch.local
set +a

npm run gate:launch:strict
npm run gate:foundation
npm run gate:contracts:security
```

## C) Consistency audit commands

```bash
cd /Users/raghav/Desktop/credity

# Gate expectation vs runtime usage
a="scripts/launch-gate-check.mjs"
b="credverse-gateway/server/services/sentry.ts"

echo "-- launch gate sentry condition --"
rg -n "SENTRY_DSN|GATEWAY_SENTRY_DSN" "$a"

echo "-- gateway sentry runtime vars --"
rg -n "SENTRY_DSN|GATEWAY_SENTRY_DSN" "$b"

# Issuer key vars references
rg -n "ISSUER_KEY_ENCRYPTION|ISSUER_KEY_ENCRYPTION_PREVIOUS" \
  "CredVerseIssuer 3/server/services/vc-signer.ts" \
  .env.launch.example DEPLOYMENT.md infra/gcp/cloudrun/env.example.yaml
```

## D) GCP Secret Manager + Cloud Run wiring (placeholder commands)

```bash
# Set your project
PROJECT_ID="<your-project-id>"

# Create secrets if missing (idempotent pattern)
for s in JWT_SECRET JWT_REFRESH_SECRET REDIS_URL SENTRY_DSN ISSUER_KEY_ENCRYPTION ISSUER_KEY_ENCRYPTION_PREVIOUS; do
  gcloud secrets describe "$s" --project "$PROJECT_ID" >/dev/null 2>&1 || \
    gcloud secrets create "$s" --replication-policy="automatic" --project "$PROJECT_ID"
done

# Add a new version (example: JWT_SECRET)
printf '%s' '<value-from-secure-source>' | \
  gcloud secrets versions add JWT_SECRET --data-file=- --project "$PROJECT_ID"
```

Then ensure `infra/gcp/cloudrun/env.example.yaml`-equivalent runtime mapping includes the same secret names used by code.

---

## 6) Minimal remediation required for clean P0C close

1. **Choose one sentry naming contract and enforce it end-to-end**:
   - Preferred fast path: standardize on `SENTRY_DSN` for all services and docs.
   - Or update gateway runtime to fall back to `GATEWAY_SENTRY_DSN`.

2. **Update strict gate to include issuer key requirement**:
   - Require `ISSUER_KEY_ENCRYPTION` presence (and optionally format check).

3. **Add Sentry entries to Cloud Run env template**:
   - Add `SENTRY_DSN` (and `GATEWAY_SENTRY_DSN` only if kept by contract).

---

## 7) Final P0C status

- **Status:** `CONDITIONAL GO` (blocked by GAP-1 and GAP-2; GAP-3 must be fixed for infra parity).
- **Secret values:** none generated, none guessed, none embedded.
- **This handoff pack is ready for operator execution once remediations are applied.**
