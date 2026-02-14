/**
 * CredVerse Gateway - Express Backend Server with Vite Frontend
 */

// Initialize Sentry BEFORE importing anything else
import { initSentry, sentryErrorHandler } from './services/sentry';
initSentry('credverse-gateway');

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth';
import mobileProxyRoutes from './routes/mobile-proxy';
import { initGoogleOAuth } from './services/google';
import { errorHandler } from './middleware/error-handler';
import { ERROR_CODES } from './services/observability';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { setupSecurity } from '@credverse/shared-auth';

const app = express();
const httpServer = createServer(app);

// Use shared security (Cors, Helmet, Rate Limit, etc)
setupSecurity(app, {
    allowedOrigins: [
        'http://localhost:5173',
        'http://localhost:5000',
        'http://localhost:5001',
        'http://localhost:5002',
        'http://localhost:5003',
    ]
});

app.use(express.json());
app.use(cookieParser());

// Initialize Google OAuth if configured
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:5173/api/auth/google/callback';

if (googleClientId && googleClientSecret) {
    initGoogleOAuth({
        clientId: googleClientId,
        clientSecret: googleClientSecret,
        redirectUri: googleRedirectUri,
    });
    console.log('[Gateway] Google OAuth configured');
} else {
    console.warn('[Gateway] Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

// API Routes
app.use('/api', authRoutes);
app.use('/api/mobile', mobileProxyRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'credverse-gateway' });
});

app.use('/api', (_req, res) => {
    res.status(404).json({
        message: 'API route not found',
        code: ERROR_CODES.NOT_FOUND,
    });
});

// Sentry error handler (must be before custom error handler)
app.use(sentryErrorHandler);
app.use(errorHandler);

// Simple inline HTML for gateway login page (fallback when Vite unavailable)
const gatewayHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CredVerse Gateway</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
        }
        .container { text-align: center; padding: 40px; }
        h1 { font-size: 3rem; margin-bottom: 1rem; background: linear-gradient(90deg, #00d4ff, #7c3aed); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        p { color: #94a3b8; margin-bottom: 2rem; }
        .buttons { display: flex; gap: 1rem; flex-wrap: wrap; justify-content: center; }
        a { 
            display: inline-block;
            padding: 14px 28px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            transition: all 0.3s;
        }
        .google-btn { background: #4285f4; color: white; }
        .google-btn:hover { background: #3367d6; transform: translateY(-2px); }
        .portal-btn { background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.2); }
        .portal-btn:hover { background: rgba(255,255,255,0.2); }
        .status { margin-top: 2rem; padding: 1rem; background: rgba(0,212,255,0.1); border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>CredVerse</h1>
        <p>Select your portal to continue</p>
        <div class="buttons">
            <a href="/api/auth/google" class="google-btn">🔐 Sign in with Google</a>
        </div>
        <div class="buttons" style="margin-top: 1rem;">
            <a href="http://localhost:5001" class="portal-btn">📋 Issuer Dashboard</a>
            <a href="http://localhost:5002" class="portal-btn">👛 BlockWallet</a>
            <a href="http://localhost:5003" class="portal-btn">👔 Recruiter Portal</a>
        </div>
        <div class="status" id="status"></div>
    </div>
    <script>
        const params = new URLSearchParams(window.location.search);
        const statusDiv = document.getElementById('status');
        if (params.get('login') === 'success') {
            statusDiv.innerHTML = '✅ Welcome, ' + decodeURIComponent(params.get('name') || 'User') + '!';
        } else if (params.get('error')) {
            statusDiv.innerHTML = '❌ Error: ' + params.get('error');
        } else {
            statusDiv.style.display = 'none';
        }
    </script>
</body>
</html>
`;

// Start server
(async () => {
    // Setup Vite in development or serve static in production
    if (process.env.NODE_ENV !== 'production') {
        try {
            const { setupVite } = await import('./vite');
            await setupVite(httpServer, app);
            console.log('[Gateway] Vite dev server attached');
        } catch (error) {
            console.log('[Gateway] Vite unavailable, using inline HTML fallback');
            app.get('/', (req, res) => {
                res.setHeader('Content-Type', 'text/html');
                res.send(gatewayHTML);
            });
        }
    } else {
        app.use(express.static(path.join(__dirname, '../dist')));
        app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../dist/index.html'));
        });
    }

    const port = parseInt(process.env.PORT || '5173', 10);
    httpServer.listen(port, '0.0.0.0', () => {
        console.log(`[Gateway] Server running on port ${port}`);
    });
})();
