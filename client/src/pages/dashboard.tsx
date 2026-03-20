import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { FileText, GitBranch, Hammer, Activity, RefreshCw, LayoutDashboard } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WikiPage, Repo, BuildEvent } from "@shared/schema";

export default function Dashboard() {
  const { data: pagesData, isLoading: pagesLoading } = useQuery<{ pages: WikiPage[]; total: number }>({
    queryKey: ["/api/wiki/pages"],
  });

  const { data: reposData, isLoading: reposLoading } = useQuery<{ repos: Repo[] }>({
    queryKey: ["/api/repos"],
  });

  const { data: buildsData, isLoading: buildsLoading } = useQuery<{ builds: BuildEvent[] }>({
    queryKey: ["/api/builds"],
  });

  const { data: statusData, isLoading: statusLoading } = useQuery<{ status: string; version: string }>({
    queryKey: ["/api/status"],
  });

  const totalPages = pagesData?.total ?? pagesData?.pages?.length ?? 0;
  const totalRepos = reposData?.repos?.length ?? 0;
  const lastBuild = buildsData?.builds?.[buildsData.builds.length - 1];
  const recentBuilds = buildsData?.builds?.slice(-5).reverse() ?? [];

  const handleRebuild = async () => {
    await apiRequest("POST", "/api/build", { audience: "both", reason: "Manual rebuild from dashboard" });
  };

  const handleRefreshDiagrams = async () => {
    await apiRequest("POST", "/api/architecture/refresh");
  };

  return (
    <div className="p-6 space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Pages"
          value={totalPages}
          icon={FileText}
          loading={pagesLoading}
          testId="kpi-total-pages"
        />
        <KpiCard
          title="Monitored Repos"
          value={totalRepos}
          icon={GitBranch}
          loading={reposLoading}
          testId="kpi-monitored-repos"
        />
        <KpiCard
          title="Last Build"
          value={
            lastBuild?.completedAt
              ? formatDistanceToNow(new Date(lastBuild.completedAt), { addSuffix: true })
              : "—"
          }
          icon={Hammer}
          loading={buildsLoading}
          testId="kpi-last-build"
          mono
        />
        <KpiCard
          title="System Status"
          value={statusData?.status === "healthy" ? "Healthy" : "Checking..."}
          icon={Activity}
          loading={statusLoading}
          testId="kpi-system-status"
          statusDot={statusData?.status === "healthy" ? "green" : "yellow"}
        />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent Activity */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            <Badge variant="secondary" className="text-[10px] font-mono">
              {recentBuilds.length} builds
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {buildsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))
            ) : recentBuilds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No builds yet.</p>
            ) : (
              recentBuilds.map((build) => (
                <div
                  key={build.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-border p-3"
                  data-testid={`build-activity-${build.buildId}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`h-2 w-2 rounded-full shrink-0 ${
                        build.status === "completed"
                          ? "bg-green-500"
                          : build.status === "failed"
                          ? "bg-red-500"
                          : build.status === "building"
                          ? "bg-blue-500"
                          : "bg-yellow-500"
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {build.reason || "Build"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {build.buildId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge
                      variant={build.status === "completed" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {build.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {build.createdAt
                        ? formatDistanceToNow(new Date(build.createdAt), { addSuffix: true })
                        : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleRebuild}
              data-testid="button-rebuild-wiki"
            >
              <Hammer className="h-4 w-4" />
              Rebuild Wiki
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={handleRefreshDiagrams}
              data-testid="button-refresh-diagrams"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh Diagrams
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => window.location.hash = "#/architecture"}
              data-testid="button-view-architecture"
            >
              <LayoutDashboard className="h-4 w-4" />
              View Architecture
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  icon: Icon,
  loading,
  testId,
  mono,
  statusDot,
}: {
  title: string;
  value: string | number;
  icon: typeof FileText;
  loading: boolean;
  testId: string;
  mono?: boolean;
  statusDot?: "green" | "yellow" | "red";
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {title}
          </span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="flex items-center gap-2">
            {statusDot && (
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  statusDot === "green"
                    ? "bg-green-500"
                    : statusDot === "yellow"
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
              />
            )}
            <span
              className={`text-xl font-semibold tabular-nums ${
                mono ? "font-mono text-base" : ""
              }`}
            >
              {value}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
