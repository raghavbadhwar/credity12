import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, ExternalLink, ShieldCheck } from "lucide-react";

const issuers = [
  { name: "Massachusetts Institute of Technology", location: "Cambridge, MA", type: "University", verified: true },
  { name: "Stanford University", location: "Stanford, CA", type: "University", verified: true },
  { name: "Google Career Certificates", location: "Global", type: "Professional", verified: true },
  { name: "University of Oxford", location: "Oxford, UK", type: "University", verified: true },
  { name: "Microsoft Learn", location: "Global", type: "Professional", verified: true },
  { name: "National University of Singapore", location: "Singapore", type: "University", verified: true },
  { name: "Indian Institute of Technology Bombay", location: "Mumbai, IN", type: "University", verified: true },
  { name: "Ethereum Foundation", location: "Decentralized", type: "Web3", verified: true },
];

export default function Directory() {
  return (
    <DashboardLayout title="Issuer Directory">
      <div className="space-y-6">
        <div className="flex items-center gap-4 bg-card p-4 rounded-lg border shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search universities, organizations, or smart contracts..." className="pl-10" />
          </div>
          <Button>Search Directory</Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {issuers.map((issuer, index) => (
            <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                    {issuer.name[0]}
                  </div>
                  {issuer.verified && (
                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100">
                      <ShieldCheck className="w-3 h-3 mr-1" /> Trusted
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <h3 className="font-semibold text-lg leading-tight mb-2 group-hover:text-primary transition-colors">{issuer.name}</h3>
                <div className="flex items-center text-sm text-muted-foreground mb-1">
                  <MapPin className="w-3.5 h-3.5 mr-1" /> {issuer.location}
                </div>
                <div className="text-xs font-medium bg-muted inline-block px-2 py-1 rounded mt-2">
                  {issuer.type}
                </div>
              </CardContent>
              <CardFooter className="pt-3 border-t text-xs text-muted-foreground flex justify-between items-center">
                <span>ID: {Math.random().toString(36).substr(2, 8).toUpperCase()}</span>
                <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
