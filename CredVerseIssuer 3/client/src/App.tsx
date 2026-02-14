import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Web3Provider } from "@/lib/web3";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Issuance from "@/pages/Issuance";
import Templates from "@/pages/Templates";
import TemplateBuilder from "@/pages/template-builder";
import Settings from "@/pages/Settings";
import Records from "@/pages/Records";
import UniPassport from "@/pages/UniPassport";
import BulkIssuance from "@/pages/bulk-issuance";
import Team from "@/pages/team";
import VerificationLogs from "@/pages/verification-logs";
import Students from "@/pages/students";
import Profile from "@/pages/profile";
import Billing from "@/pages/billing";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/issuance" component={Issuance} />
      <Route path="/templates" component={Templates} />
      <Route path="/template-builder" component={TemplateBuilder} />
      <Route path="/records" component={Records} />
      <Route path="/settings" component={Settings} />
      <Route path="/bulk-issuance" component={BulkIssuance} />
      <Route path="/team" component={Team} />
      <Route path="/verification-logs" component={VerificationLogs} />
      <Route path="/students" component={Students} />
      <Route path="/profile" component={Profile} />
      <Route path="/billing" component={Billing} />

      {/* Student Facing View */}
      <Route path="/passport" component={UniPassport} />

      {/* Fallback for other routes */}
      <Route path="/analytics" component={Dashboard} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="credverse-theme">
      <Web3Provider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </Web3Provider>
    </ThemeProvider>
  );
}

export default App;
