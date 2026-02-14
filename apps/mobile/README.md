# CredVerse Mobile (Expo Go MVP)

All-in-one mobile client for Holder, Issuer, and Recruiter roles.

## Prerequisites

- Node.js 18+
- Expo Go app on iOS/Android
- Local backend services running:
  - Gateway `5173`
  - Issuer `5001`
  - Wallet `5002`
  - Recruiter `5003`

## Setup

```bash
cd apps/mobile
cp .env.example .env
npm install
npm run start
```

Set `EXPO_PUBLIC_GATEWAY_URL` in `.env` to your machine LAN IP for physical-device testing:

```env
EXPO_PUBLIC_GATEWAY_URL=http://192.168.x.x:5173
```

If issuer APIs are protected with API-key auth, set:

```env
EXPO_PUBLIC_ISSUER_API_KEY=your-issuer-api-key
```

## Scope (MVP)

- Role selector with isolated sessions
- Holder: auth, profile, wallet status, credentials list, share QR trigger
- Issuer: auth, list credentials, issue credential action
- Recruiter: auth, instant verify, verification history
- Secure refresh token storage via `expo-secure-store`
- Biometric gate for protected actions (holder unlock/share, issuer issue, recruiter verify) via `expo-local-authentication`
