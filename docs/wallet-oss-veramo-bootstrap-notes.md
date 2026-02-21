# Wallet OSS Base Bootstrap (Veramo-first, migration-safe)

## Scope
- Keep current wallet issuance/claim/share flows intact.
- Introduce OSS abstraction layer for wallet core with Veramo as the primary target base.
- Add OID4VC interoperability hooks without forcing immediate datastore/runtime cutover.

## What was added

### 1) Wallet OSS bridge abstraction
- File: `BlockWalletDigi/server/services/oss/wallet-oss-bridge.ts`
- Introduces provider contract:
  - `WalletOssProvider`
  - `getCapabilities()`
  - `normalizeImportedCredential()`
- Providers:
  - `internal` (default, legacy-safe)
  - `veramo` (shadow-mode scaffold)
- Runtime switch:
  - `WALLET_OSS_PROVIDER=veramo` enables Veramo-labeled provider behavior in shadow mode.

### 2) Credentials import path integration
- File: `BlockWalletDigi/server/routes/credentials.ts`
- `/wallet/offer/claim` now uses `walletOssBridge.normalizeImportedCredential(...)` before storing.
- Existing downstream wallet persistence remains unchanged (`walletService.storeCredential(...)`).

### 3) OSS capability API for mobile + ops visibility
- File: `BlockWalletDigi/server/routes/wallet.ts`
- New endpoint: `GET /api/v1/wallet/oss/capabilities`
- Returns provider/mode + OID4VC hooks to allow controlled client rollout.

### 4) Mobile API mapping hook
- File: `apps/mobile/src/lib/api-client.ts`
- New helper:
  - `getHolderWalletOssCapabilities()`

## Compatibility guarantees
- No breaking changes to existing route contracts used by current mobile flows.
- Legacy wallet-service remains source of truth.
- New OSS layer currently acts as normalization + capability signaling layer (safe for phased migration).

## Migration plan (next)
1. Add real Veramo agent wiring behind `veramo` provider (KMS, DID manager, credential plugin).
2. Keep dual-write/shadow-read telemetry for imported credentials.
3. Introduce controlled per-tenant flag for active Veramo credential persistence.
4. Switch reads to Veramo-backed store after parity checks.
5. Keep rollback via `WALLET_OSS_PROVIDER=internal`.

## OID4VC interoperability stance
- OID4VCI/OID4VP are declared as supported hooks in capabilities contract.
- Existing OID4VC flow endpoints continue to run on current implementation until cutover phase.
