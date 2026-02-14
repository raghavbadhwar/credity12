/**
 * Document Scanner Service
 * Implements PRD v3.1 Layer 1: Document Verification
 * 
 * Features:
 * - OCR text extraction from ID documents
 * - Document type detection (Aadhaar, PAN, Passport, DL)
 * - Field extraction (name, DOB, ID number, address)
 * - Authenticity checks (hologram detection, microprint)
 * - Face extraction for matching
 */

export interface DocumentScanRequest {
    userId: string;
    imageData: string;  // Base64 encoded image
    documentType?: 'aadhaar' | 'pan' | 'passport' | 'driving_license' | 'voter_id' | 'auto';
}

export interface ExtractedField {
    field: string;
    value: string;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface DocumentScanResult {
    success: boolean;
    documentId: string;
    documentType: string;
    extractedFields: ExtractedField[];
    extractedData: {
        fullName?: string;
        dateOfBirth?: string;
        documentNumber?: string;
        address?: string;
        gender?: string;
        issueDate?: string;
        expiryDate?: string;
        fatherName?: string;
        nationality?: string;
    };
    faceExtracted: boolean;
    faceImageData?: string;
    authenticityChecks: {
        checkName: string;
        passed: boolean;
        confidence: number;
    }[];
    overallScore: number;  // 0-100
    warnings: string[];
    processingTimeMs: number;
}

interface StoredDocument {
    id: string;
    userId: string;
    type: string;
    result: DocumentScanResult;
    scannedAt: Date;
    verified: boolean;
}

// Store scanned documents
const scannedDocuments = new Map<string, StoredDocument>();

/**
 * Scan and extract data from document image
 */
export async function scanDocument(request: DocumentScanRequest): Promise<DocumentScanResult> {
    const startTime = Date.now();
    const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Detect document type if auto
    const documentType = request.documentType === 'auto' || !request.documentType
        ? detectDocumentType(request.imageData)
        : request.documentType;

    // Extract fields based on document type
    const extractedFields = await extractFields(request.imageData, documentType);

    // Parse extracted data
    const extractedData = parseExtractedData(extractedFields, documentType);

    // Extract face from document
    const faceData = extractFaceFromDocument(request.imageData);

    // Run authenticity checks
    const authenticityChecks = runAuthenticityChecks(request.imageData, documentType);

    // Calculate overall score
    const overallScore = calculateDocumentScore(extractedFields, authenticityChecks);

    // Generate warnings
    const warnings = generateWarnings(extractedData, authenticityChecks);

    const result: DocumentScanResult = {
        success: overallScore >= 60,
        documentId,
        documentType,
        extractedFields,
        extractedData,
        faceExtracted: faceData.found,
        faceImageData: faceData.imageData,
        authenticityChecks,
        overallScore,
        warnings,
        processingTimeMs: Date.now() - startTime
    };

    // Store document
    scannedDocuments.set(documentId, {
        id: documentId,
        userId: request.userId,
        type: documentType,
        result,
        scannedAt: new Date(),
        verified: overallScore >= 80
    });

    return result;
}

/**
 * Detect document type from image
 */
function detectDocumentType(imageData: string): string {
    // In production, this would use ML model to detect document type
    // Based on layout, colors, patterns, etc.

    // For demo, return based on image characteristics
    // This would analyze:
    // - Document shape/size ratio
    // - Color patterns (Aadhaar = blue/orange, PAN = specific layout)
    // - Text patterns (INCOME TAX DEPT, UIDAI, etc.)

    const types = ['aadhaar', 'pan', 'passport', 'driving_license'];
    return types[Math.floor(Math.random() * types.length)];
}

/**
 * Extract fields using OCR
 */
async function extractFields(imageData: string, documentType: string): Promise<ExtractedField[]> {
    // In production, this would:
    // 1. Call OCR API (Google Vision, AWS Textract, or custom model)
    // 2. Apply document-specific field extraction rules
    // 3. Return structured fields with confidence scores

    // Demo extraction based on document type
    const fields: ExtractedField[] = [];

    switch (documentType) {
        case 'aadhaar':
            fields.push(
                { field: 'name', value: 'Rahul Sharma', confidence: 0.95 },
                { field: 'dob', value: '15/08/1995', confidence: 0.92 },
                { field: 'gender', value: 'Male', confidence: 0.98 },
                { field: 'aadhaar_number', value: 'XXXX XXXX 4532', confidence: 0.88 },
                { field: 'address', value: 'House 123, Sector 15, Gurgaon, Haryana 122001', confidence: 0.85 }
            );
            break;

        case 'pan':
            fields.push(
                { field: 'name', value: 'RAHUL SHARMA', confidence: 0.96 },
                { field: 'father_name', value: 'SURESH SHARMA', confidence: 0.94 },
                { field: 'dob', value: '15/08/1995', confidence: 0.93 },
                { field: 'pan_number', value: 'ABCDE1234F', confidence: 0.97 }
            );
            break;

        case 'passport':
            fields.push(
                { field: 'name', value: 'RAHUL SHARMA', confidence: 0.97 },
                { field: 'nationality', value: 'INDIAN', confidence: 0.99 },
                { field: 'dob', value: '15 AUG 1995', confidence: 0.95 },
                { field: 'passport_number', value: 'J1234567', confidence: 0.94 },
                { field: 'issue_date', value: '20 MAR 2020', confidence: 0.92 },
                { field: 'expiry_date', value: '19 MAR 2030', confidence: 0.93 }
            );
            break;

        case 'driving_license':
            fields.push(
                { field: 'name', value: 'RAHUL SHARMA', confidence: 0.94 },
                { field: 'dob', value: '15-08-1995', confidence: 0.91 },
                { field: 'dl_number', value: 'HR-0619850012345', confidence: 0.89 },
                { field: 'address', value: 'Sector 15, Gurgaon', confidence: 0.82 },
                { field: 'validity', value: '2025-08-14', confidence: 0.88 }
            );
            break;
    }

    return fields;
}

/**
 * Parse extracted fields into structured data
 */
function parseExtractedData(fields: ExtractedField[], documentType: string): DocumentScanResult['extractedData'] {
    const data: DocumentScanResult['extractedData'] = {};

    for (const field of fields) {
        switch (field.field) {
            case 'name':
                data.fullName = field.value;
                break;
            case 'dob':
                data.dateOfBirth = normalizeDateFormat(field.value);
                break;
            case 'aadhaar_number':
            case 'pan_number':
            case 'passport_number':
            case 'dl_number':
                data.documentNumber = field.value;
                break;
            case 'address':
                data.address = field.value;
                break;
            case 'gender':
                data.gender = field.value;
                break;
            case 'father_name':
                data.fatherName = field.value;
                break;
            case 'nationality':
                data.nationality = field.value;
                break;
            case 'issue_date':
                data.issueDate = field.value;
                break;
            case 'expiry_date':
            case 'validity':
                data.expiryDate = field.value;
                break;
        }
    }

    return data;
}

/**
 * Normalize date formats
 */
function normalizeDateFormat(dateStr: string): string {
    // Convert various formats to YYYY-MM-DD
    const formats = [
        /(\d{2})\/(\d{2})\/(\d{4})/,  // DD/MM/YYYY
        /(\d{2})-(\d{2})-(\d{4})/,    // DD-MM-YYYY
        /(\d{2})\s+(\w+)\s+(\d{4})/,  // DD MMM YYYY
    ];

    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            // Simplified - just return as-is for demo
            return dateStr;
        }
    }

    return dateStr;
}

/**
 * Extract face from document photo
 */
function extractFaceFromDocument(imageData: string): { found: boolean; imageData?: string } {
    // In production, this would:
    // 1. Detect face region in document
    // 2. Extract and crop face
    // 3. Return face image for matching

    // Demo: assume face found
    return {
        found: true,
        imageData: 'base64_extracted_face_data'
    };
}

/**
 * Run authenticity checks on document
 */
function runAuthenticityChecks(imageData: string, documentType: string): DocumentScanResult['authenticityChecks'] {
    // In production, these would be actual CV/ML checks:
    // - Hologram detection
    // - Microprint verification
    // - Font consistency
    // - Color pattern matching
    // - Photo tampering detection
    // - Edge/corner analysis

    const checks = [
        { checkName: 'Document format valid', passed: true, confidence: 0.95 },
        { checkName: 'Image quality sufficient', passed: true, confidence: 0.88 },
        { checkName: 'No visible tampering', passed: true, confidence: 0.92 },
        { checkName: 'Photo integrity check', passed: true, confidence: 0.90 },
        { checkName: 'Text consistency', passed: true, confidence: 0.87 },
    ];

    // Add document-specific checks
    if (documentType === 'aadhaar') {
        checks.push({ checkName: 'QR code readable', passed: true, confidence: 0.94 });
    }

    if (documentType === 'passport') {
        checks.push({ checkName: 'MRZ zone valid', passed: true, confidence: 0.96 });
    }

    return checks;
}

/**
 * Calculate overall document score
 */
function calculateDocumentScore(fields: ExtractedField[], checks: DocumentScanResult['authenticityChecks']): number {
    // Average field confidence
    const avgFieldConfidence = fields.reduce((sum, f) => sum + f.confidence, 0) / fields.length;

    // Average check confidence (only passed checks)
    const passedChecks = checks.filter(c => c.passed);
    const avgCheckConfidence = passedChecks.reduce((sum, c) => sum + c.confidence, 0) / checks.length;

    // Pass rate
    const passRate = passedChecks.length / checks.length;

    // Weighted score
    const score = (avgFieldConfidence * 40) + (avgCheckConfidence * 30) + (passRate * 30);

    return Math.round(score);
}

/**
 * Generate warnings based on analysis
 */
function generateWarnings(data: DocumentScanResult['extractedData'], checks: DocumentScanResult['authenticityChecks']): string[] {
    const warnings: string[] = [];

    // Check for missing required fields
    if (!data.fullName) warnings.push('Name could not be extracted');
    if (!data.documentNumber) warnings.push('Document number unclear');

    // Check for failed authenticity checks
    for (const check of checks) {
        if (!check.passed) {
            warnings.push(`Failed check: ${check.checkName}`);
        }
    }

    // Check for expiry
    if (data.expiryDate) {
        const expiry = new Date(data.expiryDate);
        if (expiry < new Date()) {
            warnings.push('Document may be expired');
        }
    }

    return warnings;
}

/**
 * Get scanned document by ID
 */
export function getScannedDocument(documentId: string): StoredDocument | null {
    return scannedDocuments.get(documentId) || null;
}

/**
 * Get all documents for user
 */
export function getUserDocuments(userId: string): StoredDocument[] {
    const docs: StoredDocument[] = [];
    for (const doc of scannedDocuments.values()) {
        if (doc.userId === userId) {
            docs.push(doc);
        }
    }
    return docs;
}

/**
 * Get document verification status for trust score
 */
export function getDocumentVerificationStatus(userId: string): {
    verified: boolean;
    documentCount: number;
    types: string[];
} {
    const docs = getUserDocuments(userId);
    const verifiedDocs = docs.filter(d => d.verified);

    return {
        verified: verifiedDocs.length > 0,
        documentCount: verifiedDocs.length,
        types: verifiedDocs.map(d => d.type)
    };
}
