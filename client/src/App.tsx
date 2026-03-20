import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

import Dashboard from "@/pages/dashboard";
import Chat from "@/pages/chat";
import Architecture from "@/pages/architecture";
import Pages from "@/pages/pages";
import Repos from "@/pages/repos";
import Notebook from "@/pages/notebook";
import Builds from "@/pages/builds";
import NotFound from "@/pages/not-found";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/chat": "Chat",
  "/architecture": "Architecture",
  "/pages": "Wiki Pages",
  "/repos": "Repositories",
  "/notebook": "Notebook",
  "/builds": "Builds",
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      data-testid="button-theme-toggle"
      className="h-8 w-8"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}

function PageTitle() {
  const [location] = useLocation();
  const title = pageTitles[location] || "Kijko WikiAgent";
  return (
    <h1 className="text-sm font-semibold" data-testid="text-page-title">
      {title}
    </h1>
  );
}

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/chat" component={Chat} />
      <Route path="/architecture" component={Architecture} />
      <Route path="/pages" component={Pages} />
      <Route path="/repos" component={Repos} />
      <Route path="/notebook" component={Notebook} />
      <Route path="/builds" component={Builds} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppLayout() {
  return (
    <div className="flex h-screen w-full">
      <AppSidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between gap-2 h-12 px-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <PageTitle />
          </div>
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto">
          <AppRouter />
        </main>
        <PerplexityAttribution />
      </div>
    </div>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <Router hook={useHashLocation}>
            <SidebarProvider style={style as React.CSSProperties}>
              <AppLayout />
            </SidebarProvider>
          </Router>
        </ThemeProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
