/**
 * Platform Connections API Routes
 * Manages platform connections as defined in PRD Section 5.1 Feature 5
 */

import { Router, Request, Response } from 'express';

const router = Router();

// In-memory storage for demo (would be DB in production)
interface PlatformConnection {
    id: string;
    userId: number;
    platformId: string;
    platformName: string;
    platformLogo?: string;
    status: 'active' | 'pending' | 'revoked' | 'expired';
    sharedCredentials: string[];
    permissions: {
        shareIdentity: boolean;
        shareCredentials: boolean;
        shareActivity: boolean;
    };
    connectedAt: Date;
    lastAccessedAt: Date | null;
    expiresAt: Date | null;
    accessCount: number;
}

interface ConnectionRequest {
    id: string;
    userId: number;
    platformId: string;
    platformName: string;
    requestedCredentials: string[];
    requestedPermissions: string[];
    status: 'pending' | 'approved' | 'denied' | 'expired';
    createdAt: Date;
    expiresAt: Date;
}

// Mock data
const connections: Map<string, PlatformConnection> = new Map();
const pendingRequests: Map<string, ConnectionRequest> = new Map();

// Initialize with demo data
function initDemoData() {
    const demoConnections: PlatformConnection[] = [
        {
            id: 'conn-1',
            userId: 1,
            platformId: 'platform-recruiter',
            platformName: 'CredVerse Recruiter',
            platformLogo: '/logos/recruiter.png',
            status: 'active',
            sharedCredentials: ['degree', 'employment'],
            permissions: { shareIdentity: true, shareCredentials: true, shareActivity: false },
            connectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            lastAccessedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
            expiresAt: null,
            accessCount: 12
        },
        {
            id: 'conn-2',
            userId: 1,
            platformId: 'platform-linkedin',
            platformName: 'LinkedIn',
            platformLogo: '/logos/linkedin.png',
            status: 'active',
            sharedCredentials: ['degree'],
            permissions: { shareIdentity: true, shareCredentials: true, shareActivity: false },
            connectedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            lastAccessedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            expiresAt: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
            accessCount: 5
        }
    ];

    const demoPendingRequests: ConnectionRequest[] = [
        {
            id: 'req-1',
            userId: 1,
            platformId: 'platform-insurer',
            platformName: 'SafeGuard Insurance',
            requestedCredentials: ['verified_identity', 'age_18+'],
            requestedPermissions: ['identity', 'age_verification'],
            status: 'pending',
            createdAt: new Date(Date.now() - 30 * 60 * 1000),
            expiresAt: new Date(Date.now() + 23.5 * 60 * 60 * 1000)
        }
    ];

    demoConnections.forEach(c => connections.set(c.id, c));
    demoPendingRequests.forEach(r => pendingRequests.set(r.id, r));
}

initDemoData();

/**
 * GET /api/connections
 * List all platform connections
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;

        const userConnections = Array.from(connections.values())
            .filter(c => c.userId === userId && c.status !== 'revoked')
            .sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());

        const activeCount = userConnections.filter(c => c.status === 'active').length;

        res.json({
            success: true,
            connections: userConnections,
            stats: {
                total: userConnections.length,
                active: activeCount,
                totalAccessCount: userConnections.reduce((sum, c) => sum + c.accessCount, 0)
            }
        });
    } catch (error: any) {
        console.error('Connections list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list connections'
        });
    }
});

/**
 * GET /api/connections/requests
 * List pending connection requests
 */
router.get('/requests', async (req: Request, res: Response) => {
    try {
        const userId = parseInt(req.query.userId as string) || 1;

        const userRequests = Array.from(pendingRequests.values())
            .filter(r => r.userId === userId && r.status === 'pending')
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        res.json({
            success: true,
            requests: userRequests,
            pendingCount: userRequests.length
        });
    } catch (error: any) {
        console.error('Requests list error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list requests'
        });
    }
});

/**
 * POST /api/connections/requests/:id/approve
 * Approve a connection request
 */
router.post('/requests/:id/approve', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        const request = pendingRequests.get(id);
        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        // Create connection from request
        const connection: PlatformConnection = {
            id: `conn-${Date.now()}`,
            userId: request.userId,
            platformId: request.platformId,
            platformName: request.platformName,
            status: 'active',
            sharedCredentials: request.requestedCredentials,
            permissions: permissions || {
                shareIdentity: true,
                shareCredentials: true,
                shareActivity: false
            },
            connectedAt: new Date(),
            lastAccessedAt: null,
            expiresAt: null,
            accessCount: 0
        };

        connections.set(connection.id, connection);
        request.status = 'approved';
        pendingRequests.set(id, request);

        res.json({
            success: true,
            connection,
            message: `Connected to ${request.platformName}`
        });
    } catch (error: any) {
        console.error('Approve request error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to approve request'
        });
    }
});

/**
 * POST /api/connections/requests/:id/deny
 * Deny a connection request
 */
router.post('/requests/:id/deny', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const request = pendingRequests.get(id);
        if (!request) {
            return res.status(404).json({
                success: false,
                error: 'Request not found'
            });
        }

        request.status = 'denied';
        pendingRequests.set(id, request);

        res.json({
            success: true,
            message: `Denied request from ${request.platformName}`
        });
    } catch (error: any) {
        console.error('Deny request error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to deny request'
        });
    }
});

/**
 * PUT /api/connections/:id/permissions
 * Update permissions for a connection
 */
router.put('/:id/permissions', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { permissions } = req.body;

        const connection = connections.get(id);
        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Connection not found'
            });
        }

        connection.permissions = {
            ...connection.permissions,
            ...permissions
        };
        connections.set(id, connection);

        res.json({
            success: true,
            connection,
            message: 'Permissions updated'
        });
    } catch (error: any) {
        console.error('Update permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update permissions'
        });
    }
});

/**
 * DELETE /api/connections/:id
 * Disconnect/revoke a platform connection
 */
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const connection = connections.get(id);
        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Connection not found'
            });
        }

        connection.status = 'revoked';
        connections.set(id, connection);

        res.json({
            success: true,
            message: `Disconnected from ${connection.platformName}`
        });
    } catch (error: any) {
        console.error('Disconnect error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect'
        });
    }
});

/**
 * GET /api/connections/:id/activity
 * Get activity log for a specific connection
 */
router.get('/:id/activity', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const connection = connections.get(id);
        if (!connection) {
            return res.status(404).json({
                success: false,
                error: 'Connection not found'
            });
        }

        // Mock activity log
        const activity = [
            { type: 'access', timestamp: connection.lastAccessedAt, description: 'Accessed your credentials' },
            { type: 'verify', timestamp: new Date(Date.now() - 60 * 60 * 1000), description: 'Verified degree credential' },
            { type: 'connect', timestamp: connection.connectedAt, description: 'Initial connection established' }
        ].filter(a => a.timestamp !== null);

        res.json({
            success: true,
            connection: {
                id: connection.id,
                platformName: connection.platformName
            },
            activity
        });
    } catch (error: any) {
        console.error('Activity log error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get activity log'
        });
    }
});

export default router;
