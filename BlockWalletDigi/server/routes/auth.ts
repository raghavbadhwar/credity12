import { Router } from 'express';
import { storage } from '../storage';
import {
    hashPassword,
    comparePassword,
    generateAccessToken,
    generateRefreshToken,
    refreshAccessToken,
    invalidateRefreshToken,
    invalidateAccessToken,
    verifyAccessToken,
    authMiddleware,
    checkRateLimit,
    validatePasswordStrength,
    AuthUser,
} from '../services/auth-service';

const router = Router();
const allowLegacyLoginBypass =
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_ROUTES === 'true';

/**
 * Register a new user
 */
router.post('/auth/register', async (req, res) => {
    try {
        const { username, email, password, name } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const passwordValidation = validatePasswordStrength(password);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                error: 'Password does not meet security requirements',
                details: passwordValidation.errors,
            });
        }

        // Rate limit registration
        if (!checkRateLimit(`register:${req.ip}`, 5, 60 * 60 * 1000)) {
            return res.status(429).json({ error: 'Too many registration attempts' });
        }

        // Check if user exists
        const existing = await storage.getUserByUsername(username);
        if (existing) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Hash password and create user
        const passwordHash = await hashPassword(password);
        const user = await storage.createUser({
            username,
            name: name || username,
            email,
            password: passwordHash,
        });

        // Generate tokens
        const authUser: AuthUser = {
            id: user.id,
            username: user.username,
            email: user.email || undefined,
            role: 'holder',
        };

        const accessToken = generateAccessToken(authUser);
        const refreshToken = generateRefreshToken(authUser);

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
            },
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: 900, // 15 minutes
            },
        });
    } catch (error: any) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * Login with username/password
 */
router.post('/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        // Rate limit login attempts
        if (!checkRateLimit(`login:${username}`, 10, 15 * 60 * 1000)) {
            return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
        }

        // Find user
        const user = await storage.getUserByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Verify password
        const passwordHash = (user as any).password;
        if (!passwordHash) {
            if (!allowLegacyLoginBypass) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            console.warn('[Auth] Allowing legacy no-password login because ALLOW_DEMO_ROUTES=true');
        } else {
            const valid = await comparePassword(password, passwordHash);
            if (!valid) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
        }

        // Generate tokens
        const authUser: AuthUser = {
            id: user.id,
            username: user.username,
            email: user.email || undefined,
            role: 'holder',
        };

        const accessToken = generateAccessToken(authUser);
        const refreshToken = generateRefreshToken(authUser);

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                email: user.email,
                did: user.did,
            },
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: 900,
            },
        });
    } catch (error: any) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * Refresh access token
 */
router.post('/auth/refresh', (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ error: 'Refresh token required' });
        }

        const tokens = refreshAccessToken(refreshToken);
        if (!tokens) {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }

        res.json({
            success: true,
            tokens: {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: 900,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Token refresh failed' });
    }
});

/**
 * Logout - invalidate tokens
 */
router.post('/auth/logout', authMiddleware, (req, res) => {
    try {
        const { refreshToken } = req.body;
        const authHeader = req.headers.authorization;

        if (refreshToken) {
            invalidateRefreshToken(refreshToken);
        }

        if (authHeader) {
            const accessToken = authHeader.substring(7);
            invalidateAccessToken(accessToken);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * Get current user profile
 */
router.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await storage.getUser(Number(req.user!.userId));
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            id: user.id,
            username: user.username,
            name: user.name,
            email: user.email,
            did: user.did,
            avatarUrl: user.avatarUrl,
            bio: user.bio,
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

/**
 * Update user profile
 */
router.patch('/auth/me', authMiddleware, async (req, res) => {
    try {
        const { name, email, bio, avatarUrl } = req.body;

        const updated = await storage.updateUser(Number(req.user!.userId), {
            name,
            email,
            bio,
            avatarUrl,
        });

        res.json({
            success: true,
            user: {
                id: updated.id,
                username: updated.username,
                name: updated.name,
                email: updated.email,
                bio: updated.bio,
                avatarUrl: updated.avatarUrl,
            },
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * Change password
 */
router.post('/auth/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!newPassword) {
            return res.status(400).json({ error: 'newPassword is required' });
        }

        const passwordValidation = validatePasswordStrength(newPassword);
        if (!passwordValidation.isValid) {
            return res.status(400).json({
                error: 'Password does not meet security requirements',
                details: passwordValidation.errors,
            });
        }

        const user = await storage.getUser(Number(req.user!.userId));
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password if exists
        const passwordHash = (user as any).password;
        if (passwordHash && currentPassword) {
            const valid = await comparePassword(currentPassword, passwordHash);
            if (!valid) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }
        }

        // Update password
        const newHash = await hashPassword(newPassword);
        await storage.updateUser(Number(req.user!.userId), { password: newHash } as any);

        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

/**
 * Verify token - Cross-app token validation endpoint
 * Used by other CredVerse apps to validate tokens from this app
 */
router.post('/auth/verify-token', (req, res) => {
    try {
        const { token } = req.body;

        if (!token) {
            return res.status(400).json({ valid: false, error: 'Token required' });
        }

        const payload = verifyAccessToken(token);

        if (!payload) {
            return res.status(401).json({ valid: false, error: 'Invalid or expired token' });
        }

        res.json({
            valid: true,
            user: {
                userId: payload.userId,
                username: payload.username,
                role: payload.role,
            },
            app: 'wallet',
        });
    } catch (error) {
        res.status(500).json({ valid: false, error: 'Token verification failed' });
    }
});

export default router;
