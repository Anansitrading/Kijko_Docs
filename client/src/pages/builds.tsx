import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Play } from "lucide-react";
import { formatDistanceToNow, format, differenceInSeconds } from "date-fns";
import type { BuildEvent } from "@shared/schema";

const statusColor = (status: string) => {
  switch (status) {
    case "queued":
      return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    case "building":
      return "bg-blue-500/10 text-blue-500 border-blue-500/20";
    case "completed":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "failed":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "";
  }
};

const audienceColor = (audience: string) => {
  switch (audience) {
    case "internal":
      return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    case "external":
      return "bg-green-500/10 text-green-500 border-green-500/20";
    case "both":
      return "bg-primary/10 text-primary border-primary/20";
    default:
      return "";
  }
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const diff = differenceInSeconds(new Date(completedAt), new Date(startedAt));
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

export default function Builds() {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState("both");
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<{ builds: BuildEvent[] }>({
    queryKey: ["/api/builds"],
  });

  const triggerBuild = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/build", {
        audience,
        reason: reason || "Manual build",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/builds"] });
      setOpen(false);
      setAudience("both");
      setReason("");
    },
  });

  const builds = data?.builds ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground font-mono tabular-nums" data-testid="text-build-count">
          {builds.length} builds
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-trigger-build">
              <Play className="h-3.5 w-3.5" />
              Trigger Build
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm">Trigger Build</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="build-audience" className="text-xs">
                  Audience
                </Label>
                <Select value={audience} onValueChange={setAudience}>
                  <SelectTrigger id="build-audience" data-testid="select-build-audience">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="internal">Internal</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="build-reason" className="text-xs">
                  Reason
                </Label>
                <Input
                  id="build-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Manual rebuild"
                  className="text-sm"
                  data-testid="input-build-reason"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => triggerBuild.mutate()}
                disabled={triggerBuild.isPending}
                data-testid="button-submit-build"
              >
                {triggerBuild.isPending ? "Triggering..." : "Trigger Build"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : builds.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No builds yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Build ID</TableHead>
                  <TableHead className="text-xs">Audience</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs text-right">Started</TableHead>
                  <TableHead className="text-xs text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {builds.map((build) => (
                  <TableRow key={build.id} data-testid={`row-build-${build.id}`}>
                    <TableCell className="font-mono text-xs" data-testid={`text-build-id-${build.id}`}>
                      {build.buildId}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${audienceColor(build.audience)}`}
                      >
                        {build.audience}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${statusColor(build.status)}`}
                      >
                        {build.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {build.reason || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground text-right tabular-nums">
                      {build.startedAt
                        ? formatDistanceToNow(new Date(build.startedAt), {
                            addSuffix: true,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-right tabular-nums">
                      {formatDuration(build.startedAt, build.completedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
