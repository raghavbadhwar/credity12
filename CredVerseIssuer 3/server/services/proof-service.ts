import crypto from 'crypto';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import path from 'node:path';
import type { ProofGenerationRequestContract, ProofGenerationResultContract } from '@credverse/shared-auth';
import { deterministicHash } from './proof-lifecycle';

export class ProofGenerationError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type CredentialLike = {
  id: string;
  issuerDid?: string | null;
  subjectDid?: string | null;
  vcJwt?: string | null;
  credentialData?: Record<string, unknown> | null;
};

type GenerateProofInput = {
  request: ProofGenerationRequestContract;
  credential?: CredentialLike | null;
  issuerBaseUrl?: string;
};

const SUPPORTED_ZK_CIRCUITS = new Set(['score_threshold', 'age_verification', 'cross_vertical_aggregate']);

function isTrue(value: string | undefined): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function resolveZkRoot(): string {
  return process.env.ZK_ROOT || path.resolve(process.cwd(), '..', 'zk');
}

function generateRuntimeZkProof(circuit: string, inputs: Record<string, unknown>): { proof: unknown; publicSignals: unknown } {
  const zkRoot = resolveZkRoot();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'credity-zk-'));
  const inputPath = path.join(tempDir, `${circuit}-input.json`);

  try {
    fs.writeFileSync(inputPath, JSON.stringify(inputs), 'utf8');
    execFileSync(
      process.execPath,
      [path.join(zkRoot, 'scripts', 'generate-zk-proof.mjs'), circuit, inputPath],
      {
        cwd: zkRoot,
        stdio: 'pipe',
        timeout: Number(process.env.ZK_RUNTIME_TIMEOUT_MS || 45_000),
      },
    );

    const base = path.join(zkRoot, 'artifacts', circuit);
    const proofPath = path.join(base, 'proof.json');
    const publicPath = path.join(base, 'public.json');
    return {
      proof: JSON.parse(fs.readFileSync(proofPath, 'utf8')),
      publicSignals: JSON.parse(fs.readFileSync(publicPath, 'utf8')),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function extractZkHookMetadata(request: ProofGenerationRequestContract): Record<string, unknown> | null {
  const metadata = request.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const zk = (metadata as Record<string, unknown>).zk;
  if (!zk || typeof zk !== 'object') return null;

  const circuit = (zk as Record<string, unknown>).circuit;
  if (typeof circuit !== 'string' || !SUPPORTED_ZK_CIRCUITS.has(circuit)) {
    return null;
  }

  const baseMetadata: Record<string, unknown> = {
    circuit,
    schema: 'credity.zk-hook/v1',
  };

  const inputs = (zk as Record<string, unknown>).inputs;
  if (!inputs || typeof inputs !== 'object') {
    return {
      ...baseMetadata,
      status: 'metadata-only',
    };
  }

  if (!isTrue(process.env.PROOF_ZK_RUNTIME_ENABLED)) {
    return {
      ...baseMetadata,
      status: 'runtime-disabled',
    };
  }

  try {
    const runtimeProof = generateRuntimeZkProof(circuit, inputs as Record<string, unknown>);
    return {
      ...baseMetadata,
      status: 'generated',
      proof: runtimeProof.proof,
      public_signals: runtimeProof.publicSignals,
    };
  } catch (error: any) {
    return {
      ...baseMetadata,
      status: 'runtime-error',
      error: error?.message || 'unknown_zk_runtime_error',
    };
  }
}

function toObjectPayload(credential: CredentialLike): Record<string, unknown> {
  if (credential.credentialData && typeof credential.credentialData === 'object') {
    return credential.credentialData;
  }

  if (typeof credential.vcJwt === 'string' && credential.vcJwt.length > 0) {
    return { vc_jwt: credential.vcJwt };
  }

  return { credential_id: credential.id };
}

export function generateProof({ request, credential, issuerBaseUrl }: GenerateProofInput): ProofGenerationResultContract {
  const format = request.format;

  if (format !== 'merkle-membership') {
    return {
      id: `proof_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      status: 'unsupported',
      format,
      proof: null,
      public_signals: null,
      credential_id: request.credential_id ?? null,
      created_at: new Date().toISOString(),
      reason: `Proof format ${format} is not enabled in this deployment`,
    };
  }

  if (!request.credential_id) {
    throw new ProofGenerationError(400, 'PROOF_CREDENTIAL_ID_REQUIRED', 'credential_id is required for merkle-membership proof generation');
  }

  if (!credential || credential.id !== request.credential_id) {
    throw new ProofGenerationError(404, 'PROOF_CREDENTIAL_NOT_FOUND', 'Credential not found for proof generation');
  }

  const sourcePayload = toObjectPayload(credential);
  const claimsDigest = deterministicHash(sourcePayload, 'sha256', 'RFC8785-V1');
  const leafHash = deterministicHash(
    {
      credential_id: request.credential_id,
      claims_digest: claimsDigest,
      nonce: request.nonce ?? null,
    },
    'sha256',
    'RFC8785-V1',
  );

  const createdAt = new Date().toISOString();
  const zkHook = extractZkHookMetadata(request);
  const proof = {
    type: 'credity.merkle-membership-proof/v1',
    verification_contract: 'credity-proof-verification/v1',
    canonicalization: 'RFC8785-V1',
    hash_algorithm: 'sha256',
    issued_at: createdAt,
    credential_id: request.credential_id,
    issuer_did: credential.issuerDid || null,
    subject_did: request.subject_did || credential.subjectDid || null,
    challenge: request.challenge || null,
    domain: request.domain || null,
    nonce: request.nonce || null,
    claims_digest: claimsDigest,
    leaf_hash: leafHash,
    verification_endpoint: `${issuerBaseUrl || ''}/api/v1/proofs/verify`.replace(/\/\/+/, '/').replace(':/', '://'),
    zk_hook: zkHook,
  };

  return {
    id: `proof_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    status: 'generated',
    format,
    proof,
    public_signals: {
      claims_digest: claimsDigest,
      leaf_hash: leafHash,
      challenge: request.challenge || null,
      domain: request.domain || null,
    },
    credential_id: request.credential_id,
    created_at: createdAt,
  };
}
