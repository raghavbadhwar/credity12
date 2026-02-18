import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import ConnectDigiLocker from "@/pages/connect-digilocker";
import ReceiveCredential from "@/pages/receive";
import LoginPage from "@/pages/login";
import ProfilePage from "@/pages/profile";
import SettingsPage from "@/pages/settings";
import DigitalID from "@/pages/digital-id";
import CredentialDetail from "@/pages/credential-detail";
import ConnectionsPage from "@/pages/connections";
import BusinessDashboard from "@/pages/business-dashboard";
import IdentityVerification from "@/pages/identity-verification";
import ReputationContractPreview from "@/pages/reputation-contract-preview";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/" component={Dashboard} />
      <Route path="/connect" component={ConnectDigiLocker} />
      <Route path="/receive" component={ReceiveCredential} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/id" component={DigitalID} />
      <Route path="/credential/:id" component={CredentialDetail} />
      <Route path="/connections" component={ConnectionsPage} />
      <Route path="/business" component={BusinessDashboard} />
      <Route path="/verify" component={IdentityVerification} />
      <Route path="/reputation-preview" component={ReputationContractPreview} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
