/**
 * DigiLocker Integration Service
 * 
 * DigiLocker is India's government digital document wallet.
 * This service handles pushing credentials to DigiLocker.
 * 
 * For production, you need to:
 * 1. Register as DigiLocker Partner at https://partners.digilocker.gov.in
 * 2. Get Client ID and Secret
 * 3. Implement OAuth flow for user consent
 * 
 * API Documentation: https://developers.digilocker.gov.in/
 */

export interface DigiLockerConfig {
    clientId: string;
    clientSecret: string;
    baseUrl: string;
    redirectUri: string;
}

export interface DigiLockerDocument {
    docType: string;
    docRef: string;
    docName: string;
    docData: string; // Base64 encoded
    issuerName: string;
    issuerId: string;
    recipientAadhaar?: string;
    recipientMobile?: string;
    validFrom: Date;
    validUntil?: Date;
}

export interface DigiLockerPushResult {
    success: boolean;
    transactionId?: string;
    error?: string;
    digiLockerUri?: string;
}

class DigiLockerService {
    private config: DigiLockerConfig;
    private isConfigured: boolean;
    private allowDemoMode: boolean;

    constructor() {
        this.allowDemoMode =
            process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEMO_ROUTES === 'true';
        this.config = {
            clientId: process.env.DIGILOCKER_CLIENT_ID || '',
            clientSecret: process.env.DIGILOCKER_CLIENT_SECRET || '',
            baseUrl: process.env.DIGILOCKER_BASE_URL || 'https://api.digitallocker.gov.in',
            redirectUri: process.env.DIGILOCKER_REDIRECT_URI || 'http://localhost:5001/api/v1/digilocker/callback',
        };
        this.isConfigured = !!(this.config.clientId && this.config.clientSecret);

        if (!this.isConfigured && !this.allowDemoMode) {
            console.warn('[Issuer DigiLocker] Credentials are not configured. Demo mode is disabled.');
        }
    }

    /**
     * Generate OAuth URL for user consent
     */
    getAuthUrl(state: string): string {
        if (!this.isConfigured) {
            if (!this.allowDemoMode) {
                throw new Error('DigiLocker integration is not configured');
            }
            return `/digilocker/demo-auth?state=${state}`;
        }

        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            state,
            scope: 'docs:push',
        });

        return `${this.config.baseUrl}/oauth/authorize?${params.toString()}`;
    }

    /**
     * Push document to DigiLocker
     */
    async pushDocument(
        accessToken: string,
        document: DigiLockerDocument
    ): Promise<DigiLockerPushResult> {
        if (!this.isConfigured) {
            if (!this.allowDemoMode) {
                return {
                    success: false,
                    error: 'DigiLocker integration is not configured',
                };
            }
            // Demo mode - simulate successful push
            console.log("=".repeat(60));
            console.log("📱 DIGILOCKER PUSH (Demo Mode)");
            console.log("=".repeat(60));
            console.log(`Document: ${document.docName}`);
            console.log(`Type: ${document.docType}`);
            console.log(`Issuer: ${document.issuerName}`);
            console.log(`Reference: ${document.docRef}`);
            console.log("=".repeat(60));

            return {
                success: true,
                transactionId: `DL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                digiLockerUri: `digilocker://view/${document.docRef}`,
            };
        }

        try {
            // Real DigiLocker API call
            const response = await fetch(`${this.config.baseUrl}/v2/documents/push`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    doctype: document.docType,
                    documentreference: document.docRef,
                    documentname: document.docName,
                    documentcontent: document.docData,
                    issuername: document.issuerName,
                    issuerid: document.issuerId,
                    validfrom: document.validFrom.toISOString(),
                    validto: document.validUntil?.toISOString(),
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                return {
                    success: false,
                    error: error.message || 'Failed to push to DigiLocker',
                };
            }

            const result = await response.json();
            return {
                success: true,
                transactionId: result.transactionid,
                digiLockerUri: result.uri,
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'DigiLocker API error',
            };
        }
    }

    /**
     * Exchange authorization code for access token
     */
    async exchangeCode(code: string): Promise<{ accessToken: string; expiresIn: number } | null> {
        if (!this.isConfigured) {
            if (!this.allowDemoMode) {
                return null;
            }
            // Demo mode
            return {
                accessToken: `demo-token-${Date.now()}`,
                expiresIn: 3600,
            };
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/oauth/token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    redirect_uri: this.config.redirectUri,
                }),
            });

            if (!response.ok) return null;

            const data = await response.json();
            return {
                accessToken: data.access_token,
                expiresIn: data.expires_in,
            };
        } catch {
            return null;
        }
    }

    /**
     * Get supported document types for DigiLocker
     */
    getSupportedDocTypes(): { code: string; name: string; description: string }[] {
        return [
            { code: "DEGREE", name: "Degree Certificate", description: "University degree or diploma" },
            { code: "MARKSHEET", name: "Marksheet", description: "Academic grade card" },
            { code: "TRANSCRIPT", name: "Transcript", description: "Complete academic transcript" },
            { code: "CERTIFICATE", name: "Certificate", description: "Course completion certificate" },
            { code: "AWARD", name: "Award", description: "Achievement or recognition award" },
            { code: "LICENSE", name: "Professional License", description: "Professional qualification" },
        ];
    }

    isReady(): boolean {
        return this.isConfigured;
    }
}

export const digiLockerService = new DigiLockerService();
