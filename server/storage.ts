import {
  wikiPages,
  repos,
  chatMessages,
  buildEvents,
  notebookSources,
  type WikiPage,
  type InsertWikiPage,
  type Repo,
  type InsertRepo,
  type ChatMessage,
  type InsertChatMessage,
  type BuildEvent,
  type InsertBuildEvent,
  type NotebookSource,
  type InsertNotebookSource,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, sql } from "drizzle-orm";
import { getRuntimeState } from "./runtime-state";

export interface IStorage {
  getPages(audience?: string, search?: string, limit?: number, offset?: number): { pages: WikiPage[]; total: number };
  getPage(slug: string): WikiPage | undefined;
  createPage(data: InsertWikiPage): WikiPage;
  updatePage(slug: string, data: Partial<InsertWikiPage>): WikiPage | undefined;
  deletePage(slug: string): boolean;
  getRepos(): Repo[];
  getRepo(id: number): Repo | undefined;
  createRepo(data: InsertRepo): Repo;
  deleteRepo(id: number): boolean;
  getMessages(sessionId: string): ChatMessage[];
  createMessage(data: InsertChatMessage): ChatMessage;
  getBuilds(): BuildEvent[];
  createBuild(data: InsertBuildEvent): BuildEvent;
  updateBuild(buildId: string, data: Partial<InsertBuildEvent>): BuildEvent | undefined;
  getSources(type?: string, search?: string): NotebookSource[];
  createSource(data: InsertNotebookSource): NotebookSource;
  getStatus(): SystemStatus;
}

export interface SystemStatus {
  status: string;
  version: string;
  uptimeSeconds: number;
  components: Record<string, string>;
  monitoredRepos: number;
  totalPages: number;
  lastBuild: string | null;
  nextPoll: string | null;
  agentState: "idle" | "processing" | "building" | "deploying" | "error";
  pendingConfirmations: number;
  notebookReachable: boolean;
}

const startTime = Date.now();

export class DatabaseStorage implements IStorage {
  getPages(audience?: string, search?: string, limit = 50, offset = 0) {
    let allPages = db.select().from(wikiPages).all();
    if (audience) {
      allPages = allPages.filter((page) => page.audience === audience || page.audience === "both");
    }
    if (search) {
      const query = search.toLowerCase();
      allPages = allPages.filter(
        (page) => page.title.toLowerCase().includes(query) || page.content.toLowerCase().includes(query) || page.slug.toLowerCase().includes(query),
      );
    }
    allPages = allPages.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
    const total = allPages.length;
    const pages = allPages.slice(offset, offset + limit);
    return { pages, total };
  }

  getPage(slug: string) {
    return db.select().from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  }

  createPage(data: InsertWikiPage) {
    return db.insert(wikiPages).values(data).returning().get();
  }

  updatePage(slug: string, data: Partial<InsertWikiPage>) {
    const existing = this.getPage(slug);
    if (!existing) return undefined;
    return db
      .update(wikiPages)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(wikiPages.slug, slug))
      .returning()
      .get();
  }

  deletePage(slug: string) {
    const result = db.delete(wikiPages).where(eq(wikiPages.slug, slug)).run();
    return result.changes > 0;
  }

  getRepos() {
    return db.select().from(repos).all();
  }

  getRepo(id: number) {
    return db.select().from(repos).where(eq(repos.id, id)).get();
  }

  createRepo(data: InsertRepo) {
    return db.insert(repos).values(data).returning().get();
  }

  deleteRepo(id: number) {
    const result = db.delete(repos).where(eq(repos.id, id)).run();
    return result.changes > 0;
  }

  getMessages(sessionId: string) {
    return db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .all()
      .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());
  }

  createMessage(data: InsertChatMessage) {
    return db.insert(chatMessages).values(data).returning().get();
  }

  getBuilds() {
    return db.select().from(buildEvents).orderBy(desc(buildEvents.createdAt)).all();
  }

  createBuild(data: InsertBuildEvent) {
    return db.insert(buildEvents).values(data).returning().get();
  }

  updateBuild(buildId: string, data: Partial<InsertBuildEvent>) {
    return db.update(buildEvents).set(data).where(eq(buildEvents.buildId, buildId)).returning().get();
  }

  getSources(type?: string, search?: string) {
    let allSources = db.select().from(notebookSources).all();
    if (type) {
      allSources = allSources.filter((source) => source.type === type);
    }
    if (search) {
      const query = search.toLowerCase();
      allSources = allSources.filter(
        (source) => source.title.toLowerCase().includes(query) || (source.summary ?? "").toLowerCase().includes(query),
      );
    }
    return allSources;
  }

  createSource(data: InsertNotebookSource) {
    return db.insert(notebookSources).values(data).returning().get();
  }

  getStatus(): SystemStatus {
    const runtime = getRuntimeState();
    const repoCount = db.select({ count: sql<number>`count(*)` }).from(repos).get();
    const pageCount = db.select({ count: sql<number>`count(*)` }).from(wikiPages).get();
    const sourceCount = db.select({ count: sql<number>`count(*)` }).from(notebookSources).get();
    const lastBuild = db.select().from(buildEvents).orderBy(desc(buildEvents.createdAt)).get();

    return {
      status: "healthy",
      version: "1.0.0-recovered",
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      components: {
        api: "running",
        websocket: "running",
        architecture_viewer: "running",
        notebook: sourceCount?.count ? "connected" : "seeded",
        scheduler: "planned",
        webhook: process.env.GITHUB_WEBHOOK_SECRET ? "armed" : "disabled",
      },
      monitoredRepos: repoCount?.count ?? 0,
      totalPages: pageCount?.count ?? 0,
      lastBuild: lastBuild?.createdAt ?? null,
      nextPoll: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      agentState: runtime.agentState,
      pendingConfirmations: runtime.pendingConfirmations,
      notebookReachable: runtime.notebookReachable,
    };
  }
}

export const storage = new DatabaseStorage();
