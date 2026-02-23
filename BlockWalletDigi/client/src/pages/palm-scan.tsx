/**
 * Palm Scan Enrollment Page
 * Guides the user through palm biometric capture for Human ID.
 *
 * Steps:
 *  1. Palm Position Guide  — overlay with hand-alignment
 *  2. Quality Analysis      — real-time frame quality scoring
 *  3. Capture & Enrollment — auto-captures 3+ frames, calls enrollPalm()
 *  4. Human ID Minting     — calls mintHumanId() on success
 *  5. Confirmation          — shows ZK commitment and status
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Camera,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Hand,
  Fingerprint,
  Shield,
  Zap,
  Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FrameCapture {
  data: string; // base64
  quality: number;
  width: number;
  height: number;
}

interface PalmAnalysis {
  qualityScore: number;
  palmDetected: boolean;
  handPosition: string;
  antiSpoofScore: number;
  suggestion: string;
}

interface EnrollResult {
  palmScanId: string;
  zkCommitment: string;
  sybilScore: number;
  uniquenessVerified: boolean;
}

interface MintResult {
  humanIdHash: string;
  vcJws: string;
  ipfsCid: string | null;
  expiresAt: string;
  status: string;
}

type Step = "guide" | "scanning" | "enrolling" | "minting" | "complete" | "error";

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function analyzeFrame(
  frameBase64: string,
  width: number,
  height: number,
): Promise<PalmAnalysis> {
  const res = await fetch("/api/identity/palm/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frameBase64, width, height }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Analyze failed");
  return json.data as PalmAnalysis;
}

async function enrollPalm(
  userId: string,
  frames: FrameCapture[],
): Promise<EnrollResult> {
  const res = await fetch("/api/identity/palm/enroll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, frames }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Enrollment failed");
  return json.data as EnrollResult;
}

async function mintHumanId(
  userId: string,
  subjectDID: string,
): Promise<MintResult> {
  const res = await fetch("/api/identity/human-id/mint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, subjectDID }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Mint failed");
  return json.data as MintResult;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PalmScanPage() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<Step>("guide");
  const [analysis, setAnalysis] = useState<PalmAnalysis | null>(null);
  const [capturedFrames, setCapturedFrames] = useState<FrameCapture[]>([]);
  const [enrollResult, setEnrollResult] = useState<EnrollResult | null>(null);
  const [mintResult, setMintResult] = useState<MintResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [capturing, setCapturing] = useState(false);

  // TODO: get from auth context
  const userId = "demo_user";
  const subjectDID = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnn3Zua2F72";

  // ------ Camera lifecycle ------

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Check permissions.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ------ Frame capture ------

  const captureFrame = useCallback((): FrameCapture | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0);

    const data = canvas.toDataURL("image/png").split(",")[1]!;
    return {
      data,
      quality: 0,
      width: canvas.width,
      height: canvas.height,
    };
  }, []);

  // ------ Scanning loop ------

  const scanLoop = useCallback(async () => {
    setCapturing(true);
    const frames: FrameCapture[] = [];
    let retries = 0;
    const MAX_RETRIES = 30;

    while (frames.length < 5 && retries < MAX_RETRIES) {
      retries++;
      const frame = captureFrame();
      if (!frame) {
        await new Promise((r) => setTimeout(r, 300));
        continue;
      }

      try {
        const result = await analyzeFrame(frame.data, frame.width, frame.height);
        setAnalysis(result);
        frame.quality = result.qualityScore;

        if (result.palmDetected && result.qualityScore >= 60 && result.antiSpoofScore > 0.3) {
          frames.push(frame);
          setCapturedFrames([...frames]);
        }
      } catch {
        // ignore transient failures
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    setCapturing(false);

    if (frames.length >= 3) {
      setCapturedFrames(frames);
      setStep("enrolling");
    } else {
      setErrorMessage("Could not capture enough quality frames. Try again in better lighting.");
      setStep("error");
    }
  }, [captureFrame]);

  // ------ Mutations ------

  const enrollMutation = useMutation({
    mutationFn: () => enrollPalm(userId, capturedFrames),
    onSuccess: (result) => {
      setEnrollResult(result);
      setStep("minting");
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
      setStep("error");
    },
  });

  const mintMutation = useMutation({
    mutationFn: () => mintHumanId(userId, subjectDID),
    onSuccess: (result) => {
      setMintResult(result);
      setStep("complete");
      stopCamera();
    },
    onError: (err: Error) => {
      setErrorMessage(err.message);
      setStep("error");
    },
  });

  // Auto-trigger enroll/mint on step change
  useEffect(() => {
    if (step === "enrolling" && !enrollMutation.isPending) {
      enrollMutation.mutate();
    }
  }, [step]);

  useEffect(() => {
    if (step === "minting" && !mintMutation.isPending) {
      mintMutation.mutate();
    }
  }, [step]);

  // ------ Step handlers ------

  const handleStartScan = async () => {
    setStep("scanning");
    setCapturedFrames([]);
    setAnalysis(null);
    await startCamera();
    // Wait for stream to initialise
    setTimeout(() => scanLoop(), 1000);
  };

  const handleRetry = () => {
    setStep("guide");
    setErrorMessage("");
    setCapturedFrames([]);
    setAnalysis(null);
    setEnrollResult(null);
    setMintResult(null);
    stopCamera();
  };

  // ------ Render ------

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Hand className="h-8 w-8 text-primary" />
              Palm Scan — Human ID
            </h1>
            <p className="text-muted-foreground mt-2">
              Scan your palm to create a Sybil-resistant Human ID backed by zero-knowledge proofs.
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            {/* GUIDE */}
            {step === "guide" && (
              <motion.div
                key="guide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="bg-card rounded-xl p-6 shadow border">
                  <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    How it works
                  </h2>
                  <ul className="space-y-3 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Eye className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      Your camera captures palm features — <strong>no image is stored</strong>.
                    </li>
                    <li className="flex items-start gap-2">
                      <Shield className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      A zero-knowledge commitment proves uniqueness without revealing your biometric.
                    </li>
                    <li className="flex items-start gap-2">
                      <Zap className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                      Your Human ID is anchored on-chain as a non-transferable credential.
                    </li>
                  </ul>
                </div>

                <Button className="w-full h-14 text-lg" size="lg" onClick={handleStartScan}>
                  <Camera className="mr-2 h-5 w-5" />
                  Start Palm Scan
                </Button>
              </motion.div>
            )}

            {/* SCANNING */}
            {step === "scanning" && (
              <motion.div
                key="scanning"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="relative bg-black rounded-xl overflow-hidden aspect-video">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />

                  {/* Guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-56 h-56 border-2 border-dashed border-primary/60 rounded-3xl flex items-center justify-center">
                      <Hand className="h-16 w-16 text-primary/50 animate-pulse" />
                    </div>
                  </div>
                </div>

                <canvas ref={canvasRef} className="hidden" />

                {/* Live analysis */}
                {analysis && (
                  <div className="bg-card rounded-xl p-4 border space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Quality</span>
                      <span className="font-mono">{analysis.qualityScore}%</span>
                    </div>
                    <Progress value={analysis.qualityScore} />
                    <p className="text-xs text-muted-foreground">{analysis.suggestion}</p>
                    <div className="flex gap-2">
                      <Badge variant={analysis.palmDetected ? "default" : "secondary"}>
                        {analysis.palmDetected ? "Palm detected" : "No palm"}
                      </Badge>
                      <Badge variant={analysis.antiSpoofScore > 0.5 ? "default" : "destructive"}>
                        Spoof: {(analysis.antiSpoofScore * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>
                )}

                <div className="text-center text-sm text-muted-foreground">
                  Captured {capturedFrames.length} / 5 frames
                  {capturing && <Loader2 className="inline ml-2 h-4 w-4 animate-spin" />}
                </div>
              </motion.div>
            )}

            {/* ENROLLING */}
            {step === "enrolling" && (
              <motion.div
                key="enrolling"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12 gap-4"
              >
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg font-medium">Enrolling palm biometric...</p>
                <p className="text-sm text-muted-foreground">
                  Computing ZK commitment and checking uniqueness.
                </p>
              </motion.div>
            )}

            {/* MINTING */}
            {step === "minting" && (
              <motion.div
                key="minting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12 gap-4"
              >
                <Fingerprint className="h-12 w-12 animate-pulse text-primary" />
                <p className="text-lg font-medium">Minting Human ID...</p>
                <p className="text-sm text-muted-foreground">
                  Issuing Verifiable Credential and anchoring on-chain.
                </p>
              </motion.div>
            )}

            {/* COMPLETE */}
            {step === "complete" && mintResult && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="bg-card rounded-xl p-6 border text-center space-y-4">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
                  <h2 className="text-2xl font-bold">Human ID Created!</h2>
                  <p className="text-muted-foreground">
                    Your Sybil-resistant identity is now active.
                  </p>
                </div>

                <div className="bg-card rounded-xl p-4 border space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ID Hash</span>
                    <span className="font-mono text-xs truncate max-w-[200px]">
                      {mintResult.humanIdHash}
                    </span>
                  </div>
                  {enrollResult && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ZK Commitment</span>
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {enrollResult.zkCommitment}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IPFS</span>
                    <span className="font-mono text-xs truncate max-w-[200px]">
                      {mintResult.ipfsCid || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge>{mintResult.status}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires</span>
                    <span>{new Date(mintResult.expiresAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ERROR */}
            {step === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12 gap-4"
              >
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-lg font-medium">Something went wrong</p>
                <p className="text-sm text-center text-muted-foreground max-w-md">
                  {errorMessage}
                </p>
                <Button onClick={handleRetry} variant="outline">
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Try Again
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
