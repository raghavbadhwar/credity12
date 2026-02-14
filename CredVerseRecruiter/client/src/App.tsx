import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import InstantVerify from "@/pages/InstantVerify";
import BulkVerify from "@/pages/BulkVerify";
import Directory from "@/pages/Directory";
import AdminConsole from "@/pages/AdminConsole";
import ClaimsDashboard from "@/pages/ClaimsDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/verify" component={InstantVerify} />
      <Route path="/bulk" component={BulkVerify} />
      <Route path="/directory" component={Directory} />
      <Route path="/admin" component={AdminConsole} />
      <Route path="/claims" component={ClaimsDashboard} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
