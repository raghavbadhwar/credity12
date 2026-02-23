import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";

function getSessionUserId() {
  const raw = localStorage.getItem("wallet_session");
  if (!raw) return "anonymous";
  try {
    return JSON.parse(raw)?.userId || "anonymous";
  } catch {
    return "anonymous";
  }
}

export default function WalletSetupPage() {
  const [, setLocation] = useLocation();
  const userId = getSessionUserId();

  const { data } = useQuery<any>({
    queryKey: ["identity-status", userId],
    queryFn: async () => {
      const res = await fetch(`/api/identity/status?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) throw new Error("Failed to fetch setup status");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const livenessDone = !!data?.liveness?.verified;
  const biometricsDone = !!data?.biometrics?.enrolled;
  const docsDone = !!data?.documents?.verified;
  const canComplete = livenessDone && biometricsDone && docsDone;

  const finish = () => {
    localStorage.setItem("wallet_setup_complete", "true");
    setLocation("/");
  };

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-3xl font-bold">Wallet Setup</h1>
        <p className="text-muted-foreground">
          Complete these steps once to activate your wallet.
        </p>

        <Card>
          <CardHeader><CardTitle>Required Steps</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>1) Liveness + Biometrics: <b>{livenessDone && biometricsDone ? "Done" : "Pending"}</b></div>
            <div>2) Government Document: <b>{docsDone ? "Done" : "Pending"}</b></div>

            <div className="flex gap-2 pt-2">
              <Link href="/verify"><Button variant="outline">Open Verification</Button></Link>
              <Link href="/connect"><Button variant="outline">Connect DigiLocker</Button></Link>
            </div>

            <Button className="mt-4" disabled={!canComplete} onClick={finish}>
              Complete Wallet Setup
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
