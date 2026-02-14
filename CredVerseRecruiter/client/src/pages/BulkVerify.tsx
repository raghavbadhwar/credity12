import { useState, useRef } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Filter, Download, CheckCircle2, XCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";
import { useMutation } from "@tanstack/react-query";

interface VerificationResult {
  id: string;
  name: string;
  issuer: string;
  degree: string;
  date: string;
  status: 'verified' | 'failed' | 'suspicious' | 'pending';
  details?: any;
}

export default function BulkVerify() {
  const [results, setResults] = useState<VerificationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const verifyMutation = useMutation({
    mutationFn: async (credentials: any[]) => {
      const res = await fetch("/api/verify/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials }),
      });
      if (!res.ok) throw new Error("Bulk verification failed");
      return res.json();
    },
    onSuccess: (data) => {
      // Map API results to UI format
      const mappedResults = data.result.results.map((r: any, index: number) => ({
        id: r.verificationId || `BULK-${index}`,
        name: r.checks.find((c: any) => c.name === 'Credential Format')?.details?.name || "Unknown Candidate",
        issuer: r.checks.find((c: any) => c.name === 'Issuer Verification')?.details?.issuerName || "Unknown Issuer",
        degree: "Credential",
        date: new Date(r.timestamp).toLocaleDateString(),
        status: r.status,
        details: r
      }));
      setResults(mappedResults);
      setIsProcessing(false);
      toast({
        title: "Verification Complete",
        description: `Processed ${data.result.total} credentials.`,
      });
    },
    onError: () => {
      setIsProcessing(false);
      toast({
        title: "Error",
        description: "Failed to process bulk verification.",
        variant: "destructive",
      });
    }
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const rows = results.data as any[];
        // Transform CSV rows into Credential Objects
        const credentials = rows.map((row, index) => {
          // Check if row has a specific JWT column
          if (row.jwt) return { jwt: row.jwt };

          // Otherwise construct a raw credential from columns
          return {
            raw: {
              type: ['VerifiableCredential'],
              issuer: row.Issuer || row.issuer || "Unknown",
              credentialSubject: {
                name: row.Name || row.name || "Candidate",
                degree: row.Degree || row.degree || "Qualification",
                id: `did:key:bulk${index}`
              },
              // Add existing proof/signature if present in CSV
              proof: row.proof ? JSON.parse(row.proof) : undefined
            }
          };
        }).filter(c => c.jwt || (c.raw && c.raw.issuer)); // Filter empty rows

        if (credentials.length === 0) {
          setIsProcessing(false);
          toast({ title: "Empty or Invalid CSV", variant: "destructive" });
          return;
        }

        verifyMutation.mutate(credentials);
      },
      error: (error) => {
        setIsProcessing(false);
        toast({ title: "CSV Parsing Error", description: error.message, variant: "destructive" });
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,Issuer,Degree,Date\nJohn Doe,Demo University,B.S. Computer Science,2024-01-01";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "verification_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <DashboardLayout title="Bulk Verification">
      <div className="space-y-6">

        <Card className="border-2 border-dashed border-muted-foreground/20 bg-muted/5">
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Upload Candidate CSV</h3>
            <p className="text-sm text-muted-foreground max-w-md mt-2 mb-6">
              Upload a CSV file with columns: Name, Issuer, Degree. We will verify them against the registry.
            </p>
            <div className="flex gap-4">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".csv"
                onChange={handleFileUpload}
              />
              <Button onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                {isProcessing ? "Processing..." : "Select CSV File"}
              </Button>
              <Button variant="outline" onClick={downloadTemplate}>
                Download Template
              </Button>
            </div>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Verification Results</CardTitle>
                <CardDescription>Processed {results.length} credentials</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" /> Export Report
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Issuer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Risk Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.id}</TableCell>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell>{row.issuer}</TableCell>
                      <TableCell>
                        {row.status === 'verified' && (
                          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                          </Badge>
                        )}
                        {row.status === 'failed' && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                            <XCircle className="w-3 h-3 mr-1" /> Failed
                          </Badge>
                        )}
                        {row.status === 'suspicious' && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                            <AlertCircle className="w-3 h-3 mr-1" /> Suspicious
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.details.riskScore}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
