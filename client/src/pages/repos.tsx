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
import { Plus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Repo } from "@shared/schema";

export default function Repos() {
  const [open, setOpen] = useState(false);
  const [formUrl, setFormUrl] = useState("");
  const [formBranch, setFormBranch] = useState("main");
  const [formPoll, setFormPoll] = useState("10");

  const { data, isLoading } = useQuery<{ repos: Repo[] }>({
    queryKey: ["/api/repos"],
  });

  const addRepo = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/repos", {
        url: formUrl,
        name: formUrl.split("/").pop() || "repo",
        branch: formBranch,
        pollIntervalMinutes: parseInt(formPoll, 10) || 10,
        status: "active",
        visibility: "private",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/repos"] });
      setOpen(false);
      setFormUrl("");
      setFormBranch("main");
      setFormPoll("10");
    },
  });

  const repos = data?.repos ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground font-mono tabular-nums" data-testid="text-repo-count">
          {repos.length} repositories
        </span>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5" data-testid="button-add-repo">
              <Plus className="h-3.5 w-3.5" />
              Add Repository
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-sm">Add Repository</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="repo-url" className="text-xs">
                  Repository URL
                </Label>
                <Input
                  id="repo-url"
                  value={formUrl}
                  onChange={(e) => setFormUrl(e.target.value)}
                  placeholder="https://github.com/org/repo"
                  className="text-sm"
                  data-testid="input-repo-url"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="repo-branch" className="text-xs">
                    Branch
                  </Label>
                  <Input
                    id="repo-branch"
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    placeholder="main"
                    className="text-sm"
                    data-testid="input-repo-branch"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="repo-poll" className="text-xs">
                    Poll interval (min)
                  </Label>
                  <Input
                    id="repo-poll"
                    type="number"
                    value={formPoll}
                    onChange={(e) => setFormPoll(e.target.value)}
                    placeholder="10"
                    className="text-sm"
                    data-testid="input-repo-poll"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                onClick={() => addRepo.mutate()}
                disabled={!formUrl.trim() || addRepo.isPending}
                data-testid="button-submit-repo"
              >
                {addRepo.isPending ? "Adding..." : "Add Repository"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : repos.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No repositories monitored yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {repos.map((repo) => (
            <Card key={repo.id} data-testid={`card-repo-${repo.id}`}>
              <CardContent className="pt-4 pb-4 px-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate" data-testid={`text-repo-name-${repo.id}`}>
                      {repo.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        {repo.branch}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          repo.visibility === "public"
                            ? "border-green-500/30 text-green-500"
                            : "border-muted-foreground/30 text-muted-foreground"
                        }`}
                      >
                        {repo.visibility}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        repo.status === "active"
                          ? "bg-green-500"
                          : repo.status === "paused"
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-xs text-muted-foreground capitalize">
                      {repo.status}
                    </span>
                  </div>
                </div>

                {/* Details */}
                <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      Checked{" "}
                      {repo.lastChecked
                        ? formatDistanceToNow(new Date(repo.lastChecked), {
                            addSuffix: true,
                          })
                        : "never"}
                    </span>
                    <span className="font-mono tabular-nums">
                      every {repo.pollIntervalMinutes}m
                    </span>
                  </div>
                  {repo.lastCommitSha && (
                    <code className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded" data-testid={`text-sha-${repo.id}`}>
                      {repo.lastCommitSha.slice(0, 7)}
                    </code>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
