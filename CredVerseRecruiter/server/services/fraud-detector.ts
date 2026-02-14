/**
 * Fraud Detection Service for CredVerse Recruiter Portal
 * Analyzes credentials for potential fraud indicators
 */

export interface FraudAnalysisResult {
    score: number; // 0-100 (higher = more suspicious)
    flags: string[];
    recommendation: 'accept' | 'review' | 'reject';
    details: FraudDetail[];
}

export interface FraudDetail {
    check: string;
    status: 'passed' | 'warning' | 'failed';
    message: string;
}

/**
 * Fraud Detector Class
 */
class FraudDetector {
    private suspiciousPatterns: RegExp[] = [
        /test/i,
        /fake/i,
        /sample/i,
        /demo/i,
        /placeholder/i,
    ];

    private knownFraudulentIssuers: Set<string> = new Set([
        'fake-university',
        'diploma-mill.com',
        'instant-degrees.net',
    ]);

    getStatistics(): {
        suspiciousPatternCount: number;
        knownFraudulentIssuerCount: number;
        modelVersion: string;
        mode: 'rules-only';
    } {
        return {
            suspiciousPatternCount: this.suspiciousPatterns.length,
            knownFraudulentIssuerCount: this.knownFraudulentIssuers.size,
            modelVersion: 'rules-v1',
            mode: 'rules-only',
        };
    }

    /**
     * Analyze a credential for fraud indicators
     */
    async analyzeCredential(credential: any): Promise<FraudAnalysisResult> {
        const flags: string[] = [];
        const details: FraudDetail[] = [];
        let score = 0;

        // Check 1: Issuer Analysis
        const issuerCheck = this.checkIssuer(credential);
        details.push(issuerCheck);
        if (issuerCheck.status === 'failed') {
            score += 40;
            flags.push('FRAUDULENT_ISSUER');
        } else if (issuerCheck.status === 'warning') {
            score += 15;
            flags.push('UNKNOWN_ISSUER');
        }

        // Check 2: Temporal Anomalies
        const temporalCheck = this.checkTemporalAnomalies(credential);
        details.push(temporalCheck);
        if (temporalCheck.status === 'failed') {
            score += 30;
            flags.push('TEMPORAL_ANOMALY');
        } else if (temporalCheck.status === 'warning') {
            score += 10;
            flags.push('TEMPORAL_WARNING');
        }

        // Check 3: Content Patterns
        const contentCheck = this.checkContentPatterns(credential);
        details.push(contentCheck);
        if (contentCheck.status === 'failed') {
            score += 25;
            flags.push('SUSPICIOUS_CONTENT');
        } else if (contentCheck.status === 'warning') {
            score += 10;
            flags.push('CONTENT_WARNING');
        }

        // Check 4: Format Consistency
        const formatCheck = this.checkFormatConsistency(credential);
        details.push(formatCheck);
        if (formatCheck.status === 'failed') {
            score += 20;
            flags.push('FORMAT_INCONSISTENT');
        }

        // Check 5: Subject Validation
        const subjectCheck = this.checkSubjectInfo(credential);
        details.push(subjectCheck);
        if (subjectCheck.status === 'warning') {
            score += 10;
            flags.push('INCOMPLETE_SUBJECT');
        }

        // Determine recommendation
        let recommendation: 'accept' | 'review' | 'reject';
        if (score >= 50) {
            recommendation = 'reject';
        } else if (score >= 25) {
            recommendation = 'review';
        } else {
            recommendation = 'accept';
        }

        return {
            score: Math.min(100, score),
            flags,
            recommendation,
            details,
        };
    }

    /**
     * Check issuer for fraud indicators
     */
    private checkIssuer(credential: any): FraudDetail {
        const issuer = credential.issuer?.id || credential.issuer || credential.iss;

        if (!issuer) {
            return {
                check: 'Issuer Validation',
                status: 'warning',
                message: 'No issuer information found',
            };
        }

        const issuerStr = typeof issuer === 'string' ? issuer : JSON.stringify(issuer);

        if (this.knownFraudulentIssuers.has(issuerStr.toLowerCase())) {
            return {
                check: 'Issuer Validation',
                status: 'failed',
                message: 'Issuer is on fraudulent list',
            };
        }

        // Check for valid DID format
        if (typeof issuer === 'string' && issuer.startsWith('did:')) {
            return {
                check: 'Issuer Validation',
                status: 'passed',
                message: 'Valid DID issuer format',
            };
        }

        return {
            check: 'Issuer Validation',
            status: 'warning',
            message: 'Issuer format not standard DID',
        };
    }

    /**
     * Check for temporal anomalies
     */
    private checkTemporalAnomalies(credential: any): FraudDetail {
        const issuanceDate = credential.issuanceDate || credential.iat;
        const expirationDate = credential.expirationDate || credential.exp;

        if (!issuanceDate) {
            return {
                check: 'Temporal Analysis',
                status: 'warning',
                message: 'No issuance date found',
            };
        }

        const issued = typeof issuanceDate === 'number'
            ? new Date(issuanceDate * 1000)
            : new Date(issuanceDate);

        // Future issuance date is suspicious
        if (issued > new Date()) {
            return {
                check: 'Temporal Analysis',
                status: 'failed',
                message: 'Credential issuance date is in the future',
            };
        }

        // Very old credentials might need review
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 10);
        if (issued < oneYearAgo) {
            return {
                check: 'Temporal Analysis',
                status: 'warning',
                message: 'Credential is over 10 years old',
            };
        }

        return {
            check: 'Temporal Analysis',
            status: 'passed',
            message: 'Temporal data appears valid',
        };
    }

    /**
     * Check content for suspicious patterns
     */
    private checkContentPatterns(credential: any): FraudDetail {
        const content = JSON.stringify(credential);
        const suspiciousFound: string[] = [];

        for (const pattern of this.suspiciousPatterns) {
            if (pattern.test(content)) {
                suspiciousFound.push(pattern.source);
            }
        }

        if (suspiciousFound.length > 2) {
            return {
                check: 'Content Analysis',
                status: 'failed',
                message: `Multiple suspicious patterns found: ${suspiciousFound.join(', ')}`,
            };
        }

        if (suspiciousFound.length > 0) {
            return {
                check: 'Content Analysis',
                status: 'warning',
                message: `Potential test/demo content detected`,
            };
        }

        return {
            check: 'Content Analysis',
            status: 'passed',
            message: 'No suspicious content patterns detected',
        };
    }

    /**
     * Check format consistency
     */
    private checkFormatConsistency(credential: any): FraudDetail {
        // Check for W3C VC format compliance
        const hasContext = credential['@context'] || credential.context;
        const hasType = credential.type;
        const hasIssuer = credential.issuer || credential.iss;

        if (!hasContext && !hasType && !hasIssuer) {
            return {
                check: 'Format Validation',
                status: 'failed',
                message: 'Credential lacks standard VC structure',
            };
        }

        if (!hasContext || !hasType) {
            return {
                check: 'Format Validation',
                status: 'warning',
                message: 'Credential missing some standard fields',
            };
        }

        return {
            check: 'Format Validation',
            status: 'passed',
            message: 'Credential format is valid',
        };
    }

    /**
     * Check subject information
     */
    private checkSubjectInfo(credential: any): FraudDetail {
        const subject = credential.credentialSubject || credential.sub;

        if (!subject) {
            return {
                check: 'Subject Validation',
                status: 'warning',
                message: 'No credential subject found',
            };
        }

        const subjectObj = typeof subject === 'object' ? subject : {};
        const hasName = subjectObj.name || subjectObj.id;

        if (!hasName) {
            return {
                check: 'Subject Validation',
                status: 'warning',
                message: 'Subject lacks identifying information',
            };
        }

        return {
            check: 'Subject Validation',
            status: 'passed',
            message: 'Subject information present',
        };
    }
}

// Singleton export
export const fraudDetector = new FraudDetector();
