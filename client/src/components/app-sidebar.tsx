import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  MessageSquare,
  Network,
  FileText,
  GitBranch,
  BookOpen,
  Hammer,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Architecture", url: "/architecture", icon: Network },
  { title: "Wiki Pages", url: "/pages", icon: FileText },
  { title: "Repositories", url: "/repos", icon: GitBranch },
  { title: "Notebook", url: "/notebook", icon: BookOpen },
  { title: "Builds", url: "/builds", icon: Hammer },
];

function KijkoLogo({ className }: { className?: string }) {
  return (
    <img
      src="/kijko-logo.png"
      alt="Kijko Logo"
      width={28}
      height={28}
      className={`${className || ''} object-contain rounded-sm`}
    />
  );
}

export function AppSidebar() {
  const [location] = useLocation();

  const { data: status } = useQuery<{ status: string; version: string }>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const isHealthy = status?.status === "healthy";

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" data-testid="link-logo">
          <div className="flex items-center gap-2.5">
            <KijkoLogo className="h-7 w-7 shrink-0" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight">Kijko</span>
              <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
                WikiAgent
              </span>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = location === item.url || 
                  (item.url !== "/" && location.startsWith(item.url));
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, "-")}`}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2" data-testid="status-system">
            <div
              className={`h-2 w-2 rounded-full ${
                isHealthy ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {isHealthy ? "System healthy" : "Checking..."}
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-version">
            {status?.version || "v0.1.0"}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
