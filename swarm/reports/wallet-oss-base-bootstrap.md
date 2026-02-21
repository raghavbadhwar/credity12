# Wallet OSS Base Bootstrap Report

## Task
Bootstrap mobile wallet OSS base using selective integration (no rewrite), with Veramo as primary OSS direction and OID4VC interoperability hooks mapped to existing wallet/mobile APIs.

## Branch
- `feat/wallet-oss-veramo-bootstrap`

## Delivered

### A) Migration-safe OSS abstraction in wallet backend
- Added: `BlockWalletDigi/server/services/oss/wallet-oss-bridge.ts`
- Includes:
  - `WalletOssProvider` contract
  - `internal` provider (legacy-safe default)
  - `veramo` provider scaffold (shadow mode)
  - runtime switch: `WALLET_OSS_PROVIDER=veramo`
- Purpose:
  - Normalize imported credentials through a stable OSS adapter surface
  - Keep current wallet-service behavior intact

### B) OID4VC import path hooked into OSS bridge
- Updated: `BlockWalletDigi/server/routes/credentials.ts`
- `/wallet/offer/claim` now routes imported payload through `walletOssBridge.normalizeImportedCredential(...)` before storing.
- Result:
  - Existing claim flow preserved
  - OSS interoperability metadata added in a non-breaking way

### C) Wallet capability surface for controlled rollout
- Updated: `BlockWalletDigi/server/routes/wallet.ts`
- Added endpoint: `GET /api/v1/wallet/oss/capabilities`
- Returns:
  - active provider (`internal` / `veramo`)
  - OID4VC hook flags (`oid4vci`, `oid4vp`)
  - migration mode (`legacy` / `shadow`)

### D) Mobile API mapping
- Updated: `apps/mobile/src/lib/api-client.ts`
- Added helper: `getHolderWalletOssCapabilities()`
- Allows apps/mobile to detect and stage OSS-mode UX without breaking current flows.

### E) Compatibility notes
- Added: `docs/wallet-oss-veramo-bootstrap-notes.md`
- Covers scope, compatibility guarantees, and phased migration plan.

## Preservation of current flows
- No route removals or contract-breaking changes.
- Existing wallet-service remains source-of-truth for store/read/share behavior.
- New OSS layer currently acts as normalization and capability signaling bridge.

## Follow-up work (recommended)
1. Wire real Veramo agent internals (DID manager, KMS, credential plugins) behind provider.
2. Add dual-write observability for parity validation.
3. Progressive per-tenant rollout flag for active Veramo persistence.
4. Add parity tests for claim/import and selective disclosure behavior across providers.
