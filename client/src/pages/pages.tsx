import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { WikiPage } from "@shared/schema";

function readSearchFromHash() {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash;
  const queryIndex = hash.indexOf("?");
  if (queryIndex === -1) return "";
  const params = new URLSearchParams(hash.slice(queryIndex + 1));
  return params.get("search") || "";
}

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

export default function Pages() {
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState(() => readSearchFromHash());
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ pages: WikiPage[]; total: number } | WikiPage[]>({
    queryKey: ["/api/wiki/pages"],
  });

  useEffect(() => {
    const syncSearch = () => {
      setSearch(readSearchFromHash());
    };
    window.addEventListener("hashchange", syncSearch);
    return () => window.removeEventListener("hashchange", syncSearch);
  }, []);

  const pages: WikiPage[] = Array.isArray(data) ? data : data?.pages ?? [];
  const totalCount = Array.isArray(data) ? data.length : data?.total ?? pages.length;

  const filtered = pages
    .filter((page) => {
      if (filter !== "all" && page.audience !== filter && page.audience !== "both") return false;
      if (search) {
        const query = search.toLowerCase();
        return (
          page.title.toLowerCase().includes(query) ||
          page.slug.toLowerCase().includes(query) ||
          page.author.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList data-testid="tabs-audience-filter">
            <TabsTrigger value="all" data-testid="tab-all">
              All
            </TabsTrigger>
            <TabsTrigger value="internal" data-testid="tab-internal">
              Internal
            </TabsTrigger>
            <TabsTrigger value="external" data-testid="tab-external">
              External
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono tabular-nums" data-testid="text-page-count">
            {filtered.length} of {totalCount} pages
          </span>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search pages..."
              className="pl-8 h-8 w-52 text-sm"
              data-testid="input-search-pages"
            />
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No pages match your filters.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Title</TableHead>
                  <TableHead className="text-xs">Slug</TableHead>
                  <TableHead className="text-xs">Audience</TableHead>
                  <TableHead className="text-xs">Author</TableHead>
                  <TableHead className="text-xs text-right">Words</TableHead>
                  <TableHead className="text-xs text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((page) => (
                  <>
                    <TableRow
                      key={page.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedSlug(expandedSlug === page.slug ? null : page.slug)}
                      data-testid={`row-page-${page.id}`}
                    >
                      <TableCell className="text-sm font-medium">{page.title}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{page.slug}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${audienceColor(page.audience)}`}>
                          {page.audience}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{page.author}</TableCell>
                      <TableCell className="text-xs font-mono text-right tabular-nums">
                        {page.wordCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-right tabular-nums">
                        {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                    {expandedSlug === page.slug && (
                      <TableRow key={`${page.id}-preview`}>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                            {page.content || "No content available."}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
