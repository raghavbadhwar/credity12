import crypto from 'crypto';
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
