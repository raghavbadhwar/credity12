# @credverse/trust (SDK scaffold)

SDK-first client for Credity Reputation Rail and vertical verification APIs.

## Install (monorepo)

```bash
cd packages/trust-sdk
npm install
npm run build
```

## Usage

```ts
import { CredVerse } from '@credverse/trust';

const cv = new CredVerse({
  baseUrl: 'https://issuer.credity.example/api',
  apiKey: process.env.CREDVERSE_API_KEY,
});

const result = await cv.verify({
  subjectDid: 'did:cred:holder:123',
  vertical: 'DATING',
  requiredScore: 70,
});

// { score: 87, recommendation: 'APPROVE', zkProof: null, ... }
console.log(result);
```

## Supported methods

- `verify({ vertical, subjectDid|userId, requiredScore })`
- `getReputationScore({ subjectDid|userId, vertical? })`
- `getSafeDateScore({ subjectDid|userId })`
- `ingestReputationEvent(...)`
- `getReputationProfile(subjectDid)`
- `createShareGrant(...)`
- `revokeShareGrant(id)`
