import { Router } from 'express';
import { authMiddleware, requireRole } from '../services/auth-service';
import { deterministicHash, deterministicHashLegacyTopLevel, parseProofAlgorithm } from '../services/proof-lifecycle';
import { verificationEngine } from '../services/verification-engine';

const router = Router();

const MAX_PROOF_SIZE = 100 * 1024; // 100KB explicit limit for metadata proofs
const processedHashes = new Set<string>(); // In-memory replay protection

router.post('/v1/proofs/metadata', authMiddleware, requireRole('recruiter'), (req, res) => {
    try {
        const { credential, hash_algorithm } = req.body;
        if (!credential) {
            return res.status(400).json({ error: 'credential is required', code: 'PROOF_METADATA_INPUT_INVALID' });
        }

        const size = JSON.stringify(credential).length;
        if (size > MAX_PROOF_SIZE) {
            return res.status(400).json({ error: 'credential too large', code: 'PROOF_METADATA_INPUT_INVALID' });
        }

        const algo = parseProofAlgorithm(hash_algorithm);
        const hash = deterministicHash(credential, algo);
        res.json({ hash, code: 'PROOF_METADATA_READY' });
    } catch (err: any) {
        if (err instanceof TypeError || (err.message && err.message.includes('JSON'))) {
             return res.status(400).json({ error: err.message, code: 'PROOF_METADATA_INPUT_INVALID' });
        }
        res.status(500).json({ error: 'Internal error' });
    }
});

router.post('/v1/proofs/verify', authMiddleware, requireRole('recruiter'), async (req, res) => {
    try {
        const { proof, expected_hash, hash_algorithm, expected_issuer_did } = req.body;

        if (expected_issuer_did && !expected_issuer_did.startsWith('did:')) {
             return res.status(400).json({ error: 'Invalid expected_issuer_did', code: 'PROOF_INPUT_INVALID' });
        }

        // Replay protection: hash the entire request body to detect identical replays
        const payloadHash = deterministicHash(req.body, 'sha256');
        if (processedHashes.has(payloadHash)) {
            return res.status(409).json({ error: 'Replay detected', code: 'PROOF_REPLAY_DETECTED' });
        }
        processedHashes.add(payloadHash);

        const algo = parseProofAlgorithm(hash_algorithm);
        const strictHash = deterministicHash(proof, algo);
        const legacyHash = deterministicHashLegacyTopLevel(proof, algo);

        if (strictHash !== expected_hash && legacyHash !== expected_hash) {
            return res.json({
                valid: false,
                reason_codes: ['PROOF_HASH_MISMATCH'],
                code: 'PROOF_HASH_MISMATCH'
            });
        }

        // Hash matched, now verify content validity
        const result = await verificationEngine.verifyCredential({ raw: proof });

        if (result.status === 'verified') {
             return res.json({ valid: true, code: 'PROOF_VALID' });
        } else {
             return res.json({
                 valid: false,
                 reason_codes: result.riskFlags,
                 code: result.riskFlags[0] || 'PROOF_VERIFICATION_FAILED'
             });
        }

    } catch (err) {
        res.status(500).json({ error: 'Verification failed' });
    }
});

export default router;
