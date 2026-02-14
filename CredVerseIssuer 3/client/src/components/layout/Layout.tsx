import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <Sidebar />
      <Header />
      <main className="pl-64 pt-16 min-h-screen">
        <div className="container max-w-7xl mx-auto p-6 md:p-8 lg:p-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
    </div>
  );
}
