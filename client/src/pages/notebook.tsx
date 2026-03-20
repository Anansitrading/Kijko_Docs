import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Headphones, Globe, StickyNote, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { NotebookSource } from "@shared/schema";

const typeIcons: Record<string, typeof FileText> = {
  pdf: FileText,
  audio: Headphones,
  web: Globe,
  note: StickyNote,
};

const typeColors: Record<string, string> = {
  pdf: "text-red-400",
  audio: "text-purple-400",
  web: "text-blue-400",
  note: "text-yellow-400",
};

export default function Notebook() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<{ sources: NotebookSource[] }>({
    queryKey: ["/api/notebook/sources"],
  });

  const sources = data?.sources ?? [];

  const filtered = sources.filter((s) => {
    if (typeFilter !== "all" && s.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.summary || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={typeFilter} onValueChange={setTypeFilter}>
          <TabsList data-testid="tabs-notebook-type-filter">
            <TabsTrigger value="all" data-testid="tab-notebook-all">
              All
            </TabsTrigger>
            <TabsTrigger value="pdf" data-testid="tab-notebook-pdf">
              PDF
            </TabsTrigger>
            <TabsTrigger value="audio" data-testid="tab-notebook-audio">
              Audio
            </TabsTrigger>
            <TabsTrigger value="web" data-testid="tab-notebook-web">
              Web
            </TabsTrigger>
            <TabsTrigger value="note" data-testid="tab-notebook-note">
              Note
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sources..."
            className="pl-8 h-8 w-52 text-sm"
            data-testid="input-search-notebook"
          />
        </div>
      </div>

      {/* Source cards */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No sources match your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((source) => {
            const Icon = typeIcons[source.type] || FileText;
            const color = typeColors[source.type] || "text-muted-foreground";

            return (
              <Card key={source.id} data-testid={`card-source-${source.id}`}>
                <CardContent className="flex items-start gap-3.5 py-3.5 px-4">
                  <div className={`mt-0.5 ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium truncate" data-testid={`text-source-title-${source.id}`}>
                      {source.title}
                    </h3>
                    {source.summary && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {source.summary}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1.5 font-mono">
                      {source.type.toUpperCase()} · Synced{" "}
                      {source.lastSynced
                        ? formatDistanceToNow(new Date(source.lastSynced), {
                            addSuffix: true,
                          })
                        : "never"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
