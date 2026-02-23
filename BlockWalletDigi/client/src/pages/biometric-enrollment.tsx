/**
 * Biometric Enrollment Page (Agent 3)
 * Multi-step WebAuthn enrollment for Fingerprint / Face ID / Passkey
 *
 * Flow:
 *   1. Device capability detection (does this browser + device support WebAuthn?)
 *   2. Method selection (fingerprint / Face ID / generic passkey)
 *   3. WebAuthn registration ceremony
 *   4. Success + ZK commitment display
 *   5. Enrollment management (list / delete)
 */

import { useState, useEffect, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Fingerprint,
  ScanFace,
  KeyRound,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  RefreshCw,
} from "lucide-react";
import { startRegistration } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ── Types ──────────────────────────────────────────────────────────────

type BiometricMethod = "fingerprint" | "face_id" | "passkey_platform";
type EnrollmentStep = "detect" | "select" | "enrolling" | "success" | "manage";

interface EnrollmentRecord {
  id: string;
  credentialId: string;
  biometricMethod: BiometricMethod;
  enrolledAt: string;
  lastUsedAt: string | null;
  backedUp: boolean;
  deviceType: string;
}

interface DeviceCapabilities {
  webauthnSupported: boolean;
  platformAuthenticator: boolean;
  userAgent: string;
  platform: string;
}

// ── API Helpers ────────────────────────────────────────────────────────

async function apiPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-contract-version": "2" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "x-contract-version": "2" },
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}

async function apiDelete<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", "x-contract-version": "2" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) {
    throw new Error(json.error?.message || "Request failed");
  }
  return json.data as T;
}

// ── Device Detection ───────────────────────────────────────────────────

async function detectCapabilities(): Promise<DeviceCapabilities> {
  const ua = navigator.userAgent;
  const platform = navigator.platform || "unknown";
  
  // Check basic WebAuthn support
  const webauthnSupported =
    typeof window !== "undefined" &&
    !!window.PublicKeyCredential;

  let platformAuthenticator = false;
  if (webauthnSupported) {
    try {
      platformAuthenticator =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      platformAuthenticator = false;
    }
  }

  return { webauthnSupported, platformAuthenticator, userAgent: ua, platform };
}

function inferAvailableMethods(caps: DeviceCapabilities): BiometricMethod[] {
  if (!caps.platformAuthenticator) return [];
  const ua = caps.userAgent.toLowerCase();

  const methods: BiometricMethod[] = [];

  // iOS / macOS with Touch ID → fingerprint
  if (ua.includes("mac") || ua.includes("iphone") || ua.includes("ipad")) {
    methods.push("fingerprint");
  }
  // iOS with Face ID (iPhoneX+) → face_id
  if (ua.includes("iphone")) {
    methods.push("face_id");
  }
  // Android → both fingerprint and face
  if (ua.includes("android")) {
    methods.push("fingerprint");
    methods.push("face_id");
  }
  // Windows Hello → fingerprint + face
  if (ua.includes("windows")) {
    methods.push("fingerprint");
    methods.push("face_id");
  }

  // Always offer generic passkey as fallback
  methods.push("passkey_platform");

  // Deduplicate
  return [...new Set(methods)];
}

// ── Method Metadata ────────────────────────────────────────────────────

const METHOD_META: Record<
  BiometricMethod,
  { icon: typeof Fingerprint; label: string; description: string; color: string }
> = {
  fingerprint: {
    icon: Fingerprint,
    label: "Fingerprint",
    description: "Use your device's fingerprint sensor (Touch ID, Windows Hello, Android)",
    color: "text-blue-400",
  },
  face_id: {
    icon: ScanFace,
    label: "Face ID",
    description: "Use facial recognition (Face ID, Windows Hello, Android face unlock)",
    color: "text-purple-400",
  },
  passkey_platform: {
    icon: KeyRound,
    label: "Device Passkey",
    description: "Use your device's built-in passkey (locks to this device only)",
    color: "text-amber-400",
  },
};

// ── Component ──────────────────────────────────────────────────────────

interface BiometricEnrollmentProps {
  userId: string;
  onComplete?: (zkCommitment: string) => void;
  onBack?: () => void;
}

export default function BiometricEnrollment({
  userId,
  onComplete,
  onBack,
}: BiometricEnrollmentProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<EnrollmentStep>("detect");
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null);
  const [availableMethods, setAvailableMethods] = useState<BiometricMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<BiometricMethod | null>(null);
  const [enrollResult, setEnrollResult] = useState<{
    enrollmentId: string;
    zkCommitment: string;
    biometricMethod: BiometricMethod;
    backedUp: boolean;
  } | null>(null);

  // ── Device detection ─────────────────────────────────────────────

  useEffect(() => {
    detectCapabilities().then((caps) => {
      setCapabilities(caps);
      const methods = inferAvailableMethods(caps);
      setAvailableMethods(methods);

      if (!caps.webauthnSupported || !caps.platformAuthenticator) {
        // Stay on detect screen to show error
      } else if (methods.length === 1) {
        // Auto-select if only one method
        setSelectedMethod(methods[0]);
        setStep("select");
      } else {
        setStep("select");
      }
    });
  }, []);

  // ── Existing enrollments query ───────────────────────────────────

  const { data: enrollments, isLoading: loadingEnrollments } = useQuery<{
    enrollments: EnrollmentRecord[];
  }>({
    queryKey: ["webauthn-enrollments", userId],
    queryFn: () =>
      apiGet(`/api/identity/webauthn/enrollments?userId=${encodeURIComponent(userId)}`),
    enabled: !!userId,
  });

  // ── Enrollment mutation ──────────────────────────────────────────

  const enrollMutation = useMutation({
    mutationFn: async (method: BiometricMethod) => {
      // Step 1: Start enrollment (server-side)
      const startResult = await apiPost<{
        challengeId: string;
        options: any;
      }>("/api/identity/webauthn/enroll/start", {
        userId,
        biometricMethod: method,
      });

      // Step 2: WebAuthn ceremony (browser-side)
      const registrationResponse = await startRegistration(startResult.options);

      // Step 3: Complete enrollment (server-side)
      const completeResult = await apiPost<{
        enrollmentId: string;
        zkCommitment: string;
        biometricMethod: BiometricMethod;
        backedUp: boolean;
      }>("/api/identity/webauthn/enroll/complete", {
        challengeId: startResult.challengeId,
        registrationResponse,
        biometricMethod: method,
      });

      return completeResult;
    },
    onSuccess: (result) => {
      setEnrollResult(result);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["webauthn-enrollments", userId] });
      toast({
        title: "Biometric enrolled",
        description: `Your ${METHOD_META[result.biometricMethod].label} has been securely linked.`,
      });
    },
    onError: (error: Error) => {
      setStep("select");
      toast({
        title: "Enrollment failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ── Delete mutation ──────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      return apiDelete(`/api/identity/webauthn/enrollments/${enrollmentId}`, {
        userId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webauthn-enrollments", userId] });
      toast({ title: "Enrollment removed" });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ── Handlers ─────────────────────────────────────────────────────

  const handleStartEnrollment = useCallback(() => {
    if (!selectedMethod) return;
    setStep("enrolling");
    enrollMutation.mutate(selectedMethod);
  }, [selectedMethod, enrollMutation]);

  const handleComplete = useCallback(() => {
    if (enrollResult && onComplete) {
      onComplete(enrollResult.zkCommitment);
    }
  }, [enrollResult, onComplete]);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {/* ── Step: Detect ─────────────────────────────────── */}
          {step === "detect" && capabilities && (
            <motion.div
              key="detect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 text-center"
            >
              {!capabilities.webauthnSupported ? (
                <>
                  <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto" />
                  <h2 className="text-xl font-semibold text-white">
                    WebAuthn Not Supported
                  </h2>
                  <p className="text-slate-400">
                    Your browser does not support WebAuthn. Please use Safari, Chrome, or Edge
                    on a device with biometric hardware.
                  </p>
                </>
              ) : !capabilities.platformAuthenticator ? (
                <>
                  <Smartphone className="w-16 h-16 text-amber-400 mx-auto" />
                  <h2 className="text-xl font-semibold text-white">
                    No Biometric Sensor Detected
                  </h2>
                  <p className="text-slate-400">
                    This device does not have a compatible fingerprint sensor or Face ID camera.
                    Try on a phone or laptop with biometric hardware.
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="w-12 h-12 text-blue-400 mx-auto animate-spin" />
                  <p className="text-slate-400">Detecting biometric capabilities…</p>
                </>
              )}
              {onBack && (
                <Button variant="ghost" onClick={onBack} className="text-slate-400">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back
                </Button>
              )}
            </motion.div>
          )}

          {/* ── Step: Select Method ──────────────────────────── */}
          {step === "select" && (
            <motion.div
              key="select"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-8">
                <Shield className="w-12 h-12 text-blue-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-white">
                  Secure Your Identity
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                  Register a biometric to create your on-chain Human ID.
                  Your biometric never leaves this device.
                </p>
              </div>

              <div className="space-y-3">
                {availableMethods.map((method) => {
                  const meta = METHOD_META[method];
                  const Icon = meta.icon;
                  const isSelected = selectedMethod === method;
                  const alreadyEnrolled = enrollments?.enrollments?.some(
                    (e) => e.biometricMethod === method,
                  );

                  return (
                    <button
                      key={method}
                      disabled={!!alreadyEnrolled}
                      onClick={() => setSelectedMethod(method)}
                      className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all ${
                        alreadyEnrolled
                          ? "border-slate-700 bg-slate-800/40 opacity-50 cursor-not-allowed"
                          : isSelected
                            ? "border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30"
                            : "border-slate-700 bg-slate-800/60 hover:border-slate-500"
                      }`}
                    >
                      <Icon className={`w-8 h-8 ${meta.color}`} />
                      <div className="text-left flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{meta.label}</span>
                          {alreadyEnrolled && (
                            <Badge variant="secondary" className="text-xs">
                              Enrolled
                            </Badge>
                          )}
                        </div>
                        <p className="text-slate-400 text-xs mt-1">{meta.description}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-blue-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-4">
                {onBack && (
                  <Button variant="ghost" onClick={onBack} className="flex-1 text-slate-400">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                )}
                <Button
                  onClick={handleStartEnrollment}
                  disabled={!selectedMethod}
                  className="flex-1 bg-blue-600 hover:bg-blue-500"
                >
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>

              {/* Existing enrollments link */}
              {enrollments?.enrollments && enrollments.enrollments.length > 0 && (
                <button
                  onClick={() => setStep("manage")}
                  className="w-full text-center text-sm text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Manage {enrollments.enrollments.length} existing enrollment
                  {enrollments.enrollments.length > 1 ? "s" : ""}
                </button>
              )}
            </motion.div>
          )}

          {/* ── Step: Enrolling (WebAuthn ceremony in progress) ─ */}
          {step === "enrolling" && (
            <motion.div
              key="enrolling"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6 text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {selectedMethod && (
                  <div className={METHOD_META[selectedMethod].color}>
                    {(() => {
                      const Icon = METHOD_META[selectedMethod].icon;
                      return <Icon className="w-20 h-20 mx-auto" />;
                    })()}
                  </div>
                )}
              </motion.div>
              <h2 className="text-xl font-semibold text-white">
                Waiting for Biometric…
              </h2>
              <p className="text-slate-400 text-sm">
                Follow your device's prompt to scan your{" "}
                {selectedMethod === "fingerprint"
                  ? "fingerprint"
                  : selectedMethod === "face_id"
                    ? "face"
                    : "biometric"}
                . This never leaves your device.
              </p>
              <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
            </motion.div>
          )}

          {/* ── Step: Success ────────────────────────────────── */}
          {step === "success" && enrollResult && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <CheckCircle2 className="w-20 h-20 text-green-400 mx-auto" />
              </motion.div>
              <h2 className="text-xl font-semibold text-white">
                Biometric Registered!
              </h2>
              <p className="text-slate-400 text-sm">
                Your {METHOD_META[enrollResult.biometricMethod].label} has been securely
                linked to your identity.
              </p>

              <div className="bg-slate-800/60 rounded-xl p-4 space-y-3 text-left text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Method</span>
                  <span className="text-white">
                    {METHOD_META[enrollResult.biometricMethod].label}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Backed Up</span>
                  <Badge variant={enrollResult.backedUp ? "default" : "secondary"}>
                    {enrollResult.backedUp ? "Yes (synced)" : "This device only"}
                  </Badge>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">ZK Commitment</span>
                  <code className="text-xs text-blue-300 break-all block bg-slate-900 rounded p-2">
                    {enrollResult.zkCommitment}
                  </code>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("select");
                    setSelectedMethod(null);
                    setEnrollResult(null);
                  }}
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" /> Add Another
                </Button>
                <Button
                  onClick={handleComplete}
                  className="flex-1 bg-green-600 hover:bg-green-500"
                >
                  Continue <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── Step: Manage Enrollments ─────────────────────── */}
          {step === "manage" && (
            <motion.div
              key="manage"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white">
                  Your Biometric Enrollments
                </h2>
                <p className="text-slate-400 text-sm mt-2">
                  Manage your registered biometric credentials
                </p>
              </div>

              {loadingEnrollments ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 text-blue-400 mx-auto animate-spin" />
                </div>
              ) : enrollments?.enrollments?.length === 0 ? (
                <p className="text-center text-slate-400 py-8">
                  No enrollments yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {enrollments?.enrollments?.map((enrollment) => {
                    const meta = METHOD_META[enrollment.biometricMethod];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={enrollment.id}
                        className="flex items-center gap-4 p-4 rounded-xl border border-slate-700 bg-slate-800/60"
                      >
                        <Icon className={`w-8 h-8 ${meta.color}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium">{meta.label}</p>
                          <p className="text-xs text-slate-400 truncate">
                            Enrolled {new Date(enrollment.enrolledAt).toLocaleDateString()}
                            {enrollment.lastUsedAt &&
                              ` · Last used ${new Date(enrollment.lastUsedAt).toLocaleDateString()}`}
                          </p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs">
                              {enrollment.deviceType}
                            </Badge>
                            {enrollment.backedUp && (
                              <Badge className="text-xs bg-green-600/20 text-green-400">
                                Synced
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(enrollment.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                variant="ghost"
                onClick={() => setStep("select")}
                className="w-full text-slate-400"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to enrollment
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
