import dns from 'node:dns/promises';
import net from 'node:net';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const LOCAL_HOSTNAMES = new Set(['localhost', 'localhost.localdomain']);

type SafeFetchInit = RequestInit & {
    timeoutMs?: number;
    allowPrivateNetwork?: boolean;
    allowedProtocols?: Set<string>;
};

export type JsonReadOptions = {
    maxBytes?: number;
    allowedContentTypes?: string[];
};

export class SafeFetchError extends Error {
    readonly statusCode: number;
    readonly code: string;

    constructor(message: string, statusCode: number, code: string) {
        super(message);
        this.name = 'SafeFetchError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

export function readEnvNumber(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readEnvFlag(name: string): boolean {
    const raw = process.env[name];
    if (!raw) return false;
    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

function isPrivateIpv4(ip: string): boolean {
    const parts = ip.split('.').map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }

    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
}

function isPrivateIpv6(ip: string): boolean {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
        return true;
    }
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length);
        if (net.isIP(mapped) === 4) {
            return isPrivateIpv4(mapped);
        }
    }
    return false;
}

function isPrivateIpAddress(address: string): boolean {
    const ipVersion = net.isIP(address);
    if (ipVersion === 4) return isPrivateIpv4(address);
    if (ipVersion === 6) return isPrivateIpv6(address);
    return false;
}

function isPrivateHostname(hostname: string): boolean {
    const normalized = hostname.trim().toLowerCase();
    if (!normalized) return true;
    if (LOCAL_HOSTNAMES.has(normalized)) return true;
    if (normalized.endsWith('.localhost') || normalized.endsWith('.local')) return true;
    return false;
}

async function assertPublicNetworkTarget(url: URL): Promise<void> {
    const hostname = url.hostname.trim();
    if (isPrivateHostname(hostname)) {
        throw new SafeFetchError('URL host is local/private and is not allowed', 400, 'VERIFICATION_LINK_HOST_BLOCKED');
    }

    if (isPrivateIpAddress(hostname)) {
        throw new SafeFetchError('URL IP resolves to local/private network and is not allowed', 400, 'VERIFICATION_LINK_PRIVATE_IP_BLOCKED');
    }

    try {
        const resolved = await dns.lookup(hostname, { all: true, verbatim: true });
        if (resolved.some((entry) => isPrivateIpAddress(entry.address))) {
            throw new SafeFetchError('URL host resolves to local/private network and is not allowed', 400, 'VERIFICATION_LINK_PRIVATE_DNS_BLOCKED');
        }
    } catch (error) {
        if (error instanceof SafeFetchError) {
            throw error;
        }
    }
}

function getHeader(response: Response, header: string): string | null {
    if (!response || typeof response !== 'object') return null;
    const headers = (response as Response).headers as Headers | undefined;
    if (!headers || typeof headers.get !== 'function') return null;
    return headers.get(header);
}

async function readTextWithLimit(response: Response, maxBytes: number): Promise<string> {
    const body = response.body;
    if (body && typeof body.getReader === 'function') {
        const reader = body.getReader();
        const chunks: Buffer[] = [];
        let total = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new SafeFetchError(
                    `Upstream response exceeded max allowed size (${maxBytes} bytes)`,
                    413,
                    'VERIFICATION_LINK_RESPONSE_TOO_LARGE',
                );
            }
            chunks.push(Buffer.from(value));
        }

        return Buffer.concat(chunks).toString('utf8');
    }

    if (typeof response.text === 'function') {
        const text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new SafeFetchError(
                `Upstream response exceeded max allowed size (${maxBytes} bytes)`,
                413,
                'VERIFICATION_LINK_RESPONSE_TOO_LARGE',
            );
        }
        return text;
    }

    if (typeof response.json === 'function') {
        const json = await response.json();
        const text = JSON.stringify(json);
        if (Buffer.byteLength(text, 'utf8') > maxBytes) {
            throw new SafeFetchError(
                `Upstream response exceeded max allowed size (${maxBytes} bytes)`,
                413,
                'VERIFICATION_LINK_RESPONSE_TOO_LARGE',
            );
        }
        return text;
    }

    throw new SafeFetchError('Upstream response body is unavailable', 502, 'VERIFICATION_LINK_INVALID_BODY');
}

function assertAllowedContentType(response: Response, allowedContentTypes: string[]): void {
    const contentType = getHeader(response, 'content-type');
    if (!contentType) return;
    const normalized = contentType.toLowerCase();
    const isAllowed = allowedContentTypes.some((allowed) => normalized.includes(allowed.toLowerCase()));
    if (!isAllowed) {
        throw new SafeFetchError(
            `Unsupported content-type "${contentType}" from credential link`,
            415,
            'VERIFICATION_LINK_CONTENT_TYPE_BLOCKED',
        );
    }
}

function assertContentLength(response: Response, maxBytes: number): void {
    const rawContentLength = getHeader(response, 'content-length');
    if (!rawContentLength) return;
    const parsed = Number(rawContentLength);
    if (Number.isFinite(parsed) && parsed > maxBytes) {
        throw new SafeFetchError(
            `Upstream response exceeded max allowed size (${maxBytes} bytes)`,
            413,
            'VERIFICATION_LINK_RESPONSE_TOO_LARGE',
        );
    }
}

export async function safeFetch(urlInput: string, init: SafeFetchInit = {}): Promise<Response> {
    let url: URL;
    try {
        url = new URL(urlInput);
    } catch {
        throw new SafeFetchError('Invalid link URL', 400, 'VERIFICATION_LINK_URL_INVALID');
    }

    const allowedProtocols = init.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;
    if (!allowedProtocols.has(url.protocol)) {
        throw new SafeFetchError('Only http/https URLs are allowed for link verification', 400, 'VERIFICATION_LINK_PROTOCOL_BLOCKED');
    }
    if (!url.hostname) {
        throw new SafeFetchError('Link URL must include a hostname', 400, 'VERIFICATION_LINK_HOST_INVALID');
    }
    if (url.username || url.password) {
        throw new SafeFetchError('Link URL credentials are not allowed', 400, 'VERIFICATION_LINK_CREDENTIALS_BLOCKED');
    }

    if (!init.allowPrivateNetwork) {
        await assertPublicNetworkTarget(url);
    }

    const timeoutMs = Number.isFinite(init.timeoutMs) && init.timeoutMs && init.timeoutMs > 0
        ? init.timeoutMs
        : DEFAULT_TIMEOUT_MS;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), timeoutMs);

    try {
        return await fetch(url.toString(), {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (controller.signal.aborted) {
            throw new SafeFetchError(
                `External verification request timed out after ${timeoutMs}ms`,
                504,
                'VERIFICATION_FETCH_TIMEOUT',
            );
        }
        throw new SafeFetchError('Failed to fetch external verification resource', 502, 'VERIFICATION_FETCH_FAILED');
    } finally {
        clearTimeout(timeout);
    }
}

export async function readJsonResponseWithGuards(
    response: Response,
    options: JsonReadOptions = {},
): Promise<Record<string, unknown>> {
    const maxBytes = Number.isFinite(options.maxBytes) && options.maxBytes && options.maxBytes > 0
        ? options.maxBytes
        : DEFAULT_MAX_RESPONSE_BYTES;
    const allowedContentTypes = options.allowedContentTypes ?? ['application/json', '+json'];

    assertAllowedContentType(response, allowedContentTypes);
    assertContentLength(response, maxBytes);

    const text = await readTextWithLimit(response, maxBytes);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new SafeFetchError('Credential link response is not valid JSON', 502, 'VERIFICATION_LINK_INVALID_JSON');
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new SafeFetchError('Invalid credential response payload', 400, 'VERIFICATION_LINK_PAYLOAD_INVALID');
    }
    return parsed as Record<string, unknown>;
}

export function getExternalVerificationTimeoutMs(): number {
    return readEnvNumber('VERIFICATION_FETCH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS);
}
