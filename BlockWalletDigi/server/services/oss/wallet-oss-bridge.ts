import { randomUUID } from "crypto";

export interface ImportedCredentialInput {
  vcJwt?: string;
  credentialPayload?: Record<string, unknown>;
  issuerHint?: string;
  typeHint?: string;
  categoryHint?: string;
  proof?: Record<string, unknown> | null;
}

export interface ImportedCredentialNormalized {
  type: string[];
  issuer: string;
  issuanceDate: Date;
  expirationDate?: Date;
  data: Record<string, unknown>;
  jwt?: string;
  category: string;
}

export interface WalletOssCapabilities {
  provider: "internal" | "veramo";
  enabled: boolean;
  oid4vc: {
    oid4vci: boolean;
    oid4vp: boolean;
  };
  migration: {
    mode: "shadow" | "legacy" | "active";
    notes: string;
  };
}

export interface WalletOssProvider {
  readonly id: "internal" | "veramo";
  getCapabilities(): WalletOssCapabilities;
  normalizeImportedCredential(
    input: ImportedCredentialInput,
  ): Promise<ImportedCredentialNormalized>;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toDateOrUndefined(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function inferCredentialType(
  payload: Record<string, unknown>,
  typeHint?: string,
): string[] {
  const vc = payload.vc;
  if (vc && typeof vc === "object" && !Array.isArray(vc)) {
    const vcType = (vc as Record<string, unknown>).type;
    if (Array.isArray(vcType) && vcType.length > 0) {
      const normalized = vcType.filter(
        (entry): entry is string => typeof entry === "string",
      );
      if (normalized.length > 0) return normalized;
    }
  }

  if (typeof typeHint === "string" && typeHint.trim()) {
    return ["VerifiableCredential", typeHint.trim()];
  }

  return ["VerifiableCredential", "ImportedCredential"];
}

function normalizeCommon(
  providerId: "internal" | "veramo",
  input: ImportedCredentialInput,
): ImportedCredentialNormalized {
  const jwtPayload = input.vcJwt ? decodeJwtPayload(input.vcJwt) : null;
  const payload: Record<string, unknown> = {
    ...(input.credentialPayload || {}),
    ...(jwtPayload || {}),
    ...(input.proof ? { proof: input.proof } : {}),
    ossInteroperability: {
      normalizedBy: providerId,
      normalizedAt: new Date().toISOString(),
      importId: randomUUID(),
      ...(providerId === "veramo"
        ? { primaryWalletBase: "veramo", migrationMode: "shadow" }
        : {}),
    },
  };

  const issuerFromPayload = typeof payload.iss === "string" ? payload.iss : undefined;
  const issuer = input.issuerHint || issuerFromPayload || "External Issuer";

  const vcObj =
    payload.vc && typeof payload.vc === "object" && !Array.isArray(payload.vc)
      ? (payload.vc as Record<string, unknown>)
      : undefined;

  const issuanceDate =
    toDateOrUndefined(payload.nbf) ||
    toDateOrUndefined(payload.iat) ||
    toDateOrUndefined(vcObj?.issuanceDate) ||
    new Date();

  const expirationDate =
    toDateOrUndefined(payload.exp) || toDateOrUndefined(vcObj?.expirationDate);

  return {
    type: inferCredentialType(payload, input.typeHint),
    issuer,
    issuanceDate,
    expirationDate,
    data: payload,
    jwt: input.vcJwt,
    category: input.categoryHint || "academic",
  };
}

class InternalWalletOssProvider implements WalletOssProvider {
  readonly id = "internal" as const;

  getCapabilities(): WalletOssCapabilities {
    return {
      provider: this.id,
      enabled: true,
      oid4vc: { oid4vci: true, oid4vp: true },
      migration: {
        mode: "legacy",
        notes: "Default legacy runtime. OSS adapter hooks are available for migration-safe cutover.",
      },
    };
  }

  async normalizeImportedCredential(
    input: ImportedCredentialInput,
  ): Promise<ImportedCredentialNormalized> {
    return normalizeCommon(this.id, input);
  }
}

class VeramoWalletOssProvider implements WalletOssProvider {
  readonly id = "veramo" as const;

  getCapabilities(): WalletOssCapabilities {
    return {
      provider: this.id,
      enabled: true,
      oid4vc: { oid4vci: true, oid4vp: true },
      migration: {
        mode: "shadow",
        notes:
          "Veramo-first scaffold active in shadow mode. Existing wallet-service remains source-of-truth until datastore cutover.",
      },
    };
  }

  async normalizeImportedCredential(
    input: ImportedCredentialInput,
  ): Promise<ImportedCredentialNormalized> {
    return normalizeCommon(this.id, input);
  }
}

export const walletOssBridge: WalletOssProvider =
  process.env.WALLET_OSS_PROVIDER === "veramo"
    ? new VeramoWalletOssProvider()
    : new InternalWalletOssProvider();
