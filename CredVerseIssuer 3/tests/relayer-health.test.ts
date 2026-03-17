import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { registerRoutes } from '../server/routes';
import { blockchainService } from '../server/services/blockchain-service';

const app = express();
app.use(express.json());
const httpServer = createServer(app);
await registerRoutes(httpServer, app);

describe('relayer health endpoint policy semantics', () => {
    const previousRpcUrl = process.env.RPC_URL;
    const previousRelayerPrivateKey = process.env.RELAYER_PRIVATE_KEY;
    const previousContractAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
    const previousNodeEnv = process.env.NODE_ENV;

    afterEach(() => {
        if (previousRpcUrl === undefined) {
            delete process.env.RPC_URL;
        } else {
            process.env.RPC_URL = previousRpcUrl;
        }
        if (previousRelayerPrivateKey === undefined) {
            delete process.env.RELAYER_PRIVATE_KEY;
        } else {
            process.env.RELAYER_PRIVATE_KEY = previousRelayerPrivateKey;
        }
        if (previousContractAddress === undefined) {
            delete process.env.REGISTRY_CONTRACT_ADDRESS;
        } else {
            process.env.REGISTRY_CONTRACT_ADDRESS = previousContractAddress;
        }
        if (previousNodeEnv === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = previousNodeEnv;
        }
        vi.restoreAllMocks();
    });

    it('reports resolved RPC env path and fails when writes are disallowed by policy', async () => {
        process.env.RPC_URL = 'https://rpc.sepolia.example';
        process.env.RELAYER_PRIVATE_KEY = '0x' + '1'.repeat(64);
        process.env.REGISTRY_CONTRACT_ADDRESS = '0x' + '2'.repeat(40);

        vi.spyOn(blockchainService, 'getRuntimeStatus').mockReturnValue({
            chainNetwork: 'ethereum-sepolia',
            writesAllowed: false,
            writePolicyReason: 'policy blocked',
            configured: true,
            chainId: 11155111,
            networkName: 'sepolia',
        });

        const response = await request(app).get('/api/health/relayer');
        expect(response.status).toBe(503);
        expect(response.body.ok).toBe(false);
        expect(response.body.relayerReady).toBe(false);
        expect(response.body.writesAllowed).toBe(false);
        expect(response.body.rpc.resolvedFrom).toBe('env:RPC_URL');
        expect(response.body.missingEnvVars).toEqual([]);
    });

    it('returns healthy when configured + writesAllowed + required env are present', async () => {
        process.env.RPC_URL = 'https://rpc.sepolia.example';
        process.env.RELAYER_PRIVATE_KEY = '0x' + '3'.repeat(64);
        process.env.REGISTRY_CONTRACT_ADDRESS = '0x' + '4'.repeat(40);

        vi.spyOn(blockchainService, 'getRuntimeStatus').mockReturnValue({
            chainNetwork: 'ethereum-sepolia',
            writesAllowed: true,
            writePolicyReason: undefined,
            configured: true,
            chainId: 11155111,
            networkName: 'sepolia',
        });

        const response = await request(app).get('/api/health/relayer');
        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(response.body.relayerReady).toBe(true);
        expect(response.body.rpc.resolvedFrom).toBe('env:RPC_URL');
        expect(response.body.missingEnvVars).toEqual([]);
    });
});
