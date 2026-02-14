# CredVerse Production Deployment Guide

This guide covers deploying the CredVerse ecosystem to Railway (recommended) or other platforms.

## ☁️ GCP Deployment Baseline (Cloud Run + Cloud SQL, Mumbai)

This repo now includes a production baseline under `infra/gcp` targeting `asia-south1`:

- `infra/gcp/cloudrun/services.yaml`
- `infra/gcp/cloudrun/env.example.yaml`
- `infra/gcp/README.md`

Recommended production controls:

- `REQUIRE_DATABASE=true`
- `REQUIRE_QUEUE=true`
- `ALLOW_DEMO_ROUTES=false`
- `BLOCKCHAIN_ANCHOR_MODE=async`

Use Secret Manager for all secrets and connect Cloud Run services to Cloud SQL (PostgreSQL regional HA) and Memorystore (Redis).

## 🏗️ Architecture Overview

CredVerse is a monorepo with 4 services:

| Service | Description | Port | Health Endpoint |
|---------|-------------|------|-----------------|
| **CredVerse Issuer** | University/Institution dashboard for issuing credentials | 5001 | `/api/health` |
| **BlockWallet** | Student digital wallet for managing credentials | 5002 | `/api/health` |
| **CredVerse Recruiter** | Employer portal for verifying credentials | 5003 | `/api/health` |
| **CredVerse Gateway** | Landing page & OAuth authentication | 5173 | `/api/health` |

## 📋 Prerequisites

1. Railway account at https://railway.app
2. GitHub repository (already connected)
3. Environment variables configured (see below)

## 🚀 Deploy to Railway

### Step 1: Create Project

1. Go to https://railway.app/new
2. Select **"Deploy from GitHub repo"**
3. Choose your `raghavbadhwar/credity` repository

### Step 2: Deploy Each Service

Since this is a monorepo, you need to deploy each service separately:

#### Deploy Issuer Service
1. Click **"New Service"** → **"GitHub Repo"** → Select `credity`
2. Go to **Settings** → **Source**
3. Set **Root Directory** to: `CredVerseIssuer 3`
4. Click **Deploy**

#### Deploy Wallet Service
1. Click **"New Service"** → **"GitHub Repo"** → Select `credity`
2. Set **Root Directory** to: `BlockWalletDigi`
3. Click **Deploy**

#### Deploy Recruiter Service
1. Click **"New Service"** → **"GitHub Repo"** → Select `credity`
2. Set **Root Directory** to: `CredVerseRecruiter`
3. Click **Deploy**

#### Deploy Gateway Service
1. Click **"New Service"** → **"GitHub Repo"** → Select `credity`
2. Set **Root Directory** to: `credverse-gateway`
3. Click **Deploy**

### Step 3: Configure Environment Variables

For each service, add these environment variables in Railway:

#### Required for ALL Services
```env
NODE_ENV=production
JWT_SECRET=<64-char-random-string>
JWT_REFRESH_SECRET=<64-char-random-string>
ALLOWED_ORIGINS=https://issuer.yourdomain.com,https://wallet.yourdomain.com,https://recruiter.yourdomain.com,https://gateway.yourdomain.com
```

Generate secure secrets:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### Issuer Service (Additional)
```env
ISSUER_KEY_ENCRYPTION=<64-char-hex-key>
# Optional key-rotation support (keep previous keys temporarily while rotating):
ISSUER_KEY_ENCRYPTION_PREVIOUS=<old-64-char-hex-key>[,<older-64-char-hex-key>]
# Optional:
CHAIN_NETWORK=ethereum-sepolia
ENABLE_ZKEVM_MAINNET=false
CHAIN_RPC_URL=
RPC_URL=  # Optional backward-compatible override
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology
POLYGON_ZKEVM_CARDONA_RPC_URL=https://rpc.cardona.zkevm-rpc.com
POLYGON_ZKEVM_RPC_URL=https://zkevm-rpc.com
DEPLOYER_PRIVATE_KEY=0x...
RELAYER_PRIVATE_KEY=0x...  # 32-byte hex with 0x prefix (required for on-chain writes)
REDIS_URL=redis://...  # For bulk issuance queue
RESEND_API_KEY=re_...  # For email notifications
SENTRY_DSN=https://...  # Error monitoring
```

`CHAIN_NETWORK` supported values:
- `ethereum-sepolia` (default, safest pilot)
- `polygon-mainnet`
- `polygon-amoy`
- `polygon-zkevm-cardona` (recommended zkEVM testnet path)
- `polygon-zkevm-mainnet` (enable only after cost and stability sign-off)

`ENABLE_ZKEVM_MAINNET` must be set to `true` before write operations (anchor/revoke) are allowed on `polygon-zkevm-mainnet`.

#### Gateway Service (Additional)
```env
GOOGLE_CLIENT_ID=<your-google-client-id>
GOOGLE_CLIENT_SECRET=<your-google-client-secret>
GOOGLE_REDIRECT_URI=https://gateway.yourdomain.com/api/auth/google/callback
```

### Step 4: Add Custom Domains (Optional)

1. Click on each service → **Settings** → **Networking**
2. Add custom domain (e.g., `issuer.credverse.io`)
3. Configure DNS:
   - Add CNAME record pointing to Railway domain
   - Wait for SSL certificate provisioning

### Step 5: Verify Deployment

Test each health endpoint:
```bash
curl https://issuer.yourdomain.com/api/health
curl https://wallet.yourdomain.com/api/health
curl https://recruiter.yourdomain.com/api/health
curl https://gateway.yourdomain.com/api/health
```

Each should return:
```json
{"status":"ok","app":"<service-name>"}
```

## 🔐 Security Checklist

Before going live, ensure:

- [x] **JWT Secrets**: Using strong, unique 64-character secrets
- [x] **HTTPS Only**: All production URLs use HTTPS
- [x] **CORS Configured**: Only your domains in `ALLOWED_ORIGINS`
- [x] **Rate Limiting**: Built-in API rate limiting active
- [x] **Helmet Headers**: Security headers enabled in production
- [x] **Error Monitoring**: Sentry DSN configured (optional but recommended)
- [x] **Database**: For production, configure PostgreSQL via `DATABASE_URL`

## 🗄️ Database Setup (Optional)

Currently CredVerse uses in-memory storage. For production persistence:

1. Add a PostgreSQL database in Railway
2. Copy the `DATABASE_URL` from Railway
3. Add to each service's environment variables
4. Run migrations: `npm run db:push`

## 📊 Monitoring

### Sentry Error Tracking
1. Create project at https://sentry.io
2. Add `SENTRY_DSN` to each service

### PostHog Analytics
1. Create project at https://posthog.com
2. Add `POSTHOG_API_KEY` to each service

## 🔄 CI/CD

Railway automatically deploys on push to main branch. Each service watches for changes in its root directory.

## 🧪 Testing Production Builds Locally

```bash
# Build all services
cd "CredVerseIssuer 3" && npm run build && cd ..
cd BlockWalletDigi && npm run build && cd ..
cd CredVerseRecruiter && npm run build && cd ..
cd credverse-gateway && npm run build && cd ..

# Test production start (in separate terminals)
cd "CredVerseIssuer 3" && npm run start
cd BlockWalletDigi && npm run start
cd CredVerseRecruiter && npm run start
cd credverse-gateway && npm run start
```

## 🆘 Troubleshooting

### Build Fails
- Check Railway build logs
- Ensure `packages/shared-auth` is built first (handled automatically)
- Verify all dependencies are in `package.json`

### Health Check Fails
- Wait 60 seconds for startup
- Check `healthcheckTimeout` in `railway.toml`
- Verify `PORT` environment variable is not overridden

### CORS Errors
- Update `ALLOWED_ORIGINS` with production domains
- Include both www and non-www versions

### API Not Working
- Check `NODE_ENV=production` is set
- Verify all required environment variables

## 📞 Support

- GitHub Issues: https://github.com/raghavbadhwar/credity/issues
- Documentation: Check `/docs` folder in repository
