# Credity GCP Deployment (India-First)

This folder provides a Cloud Run + Cloud SQL baseline for `asia-south1` (Mumbai).

## Services

- `gateway` -> `credverse-gateway`
- `issuer` -> `CredVerseIssuer 3`
- `wallet` -> `BlockWalletDigi`
- `recruiter` -> `CredVerseRecruiter`

## Runtime Defaults

- Region: `asia-south1`
- Compute: Cloud Run (managed)
- Database: Cloud SQL for PostgreSQL (regional HA)
- Cache/queue: Memorystore (Redis)
- Secrets: Secret Manager + CMEK

## Files

- `cloudrun/services.yaml`: declarative Cloud Run service specs
- `cloudrun/env.example.yaml`: required env var names (Secret Manager references)

## Notes

- Keep Aadhaar/identity and audit logs in India region.
- Set `REQUIRE_DATABASE=true` and `REQUIRE_QUEUE=true` in production services.
- Set `ALLOW_DEMO_ROUTES=false` in production.
