import { 
  wikiPages, repos, chatMessages, buildEvents, notebookSources,
  type WikiPage, type InsertWikiPage,
  type Repo, type InsertRepo,
  type ChatMessage, type InsertChatMessage,
  type BuildEvent, type InsertBuildEvent,
  type NotebookSource, type InsertNotebookSource,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, like, or, sql } from "drizzle-orm";

export interface IStorage {
  // Wiki Pages
  getPages(audience?: string, search?: string, limit?: number, offset?: number): { pages: WikiPage[]; total: number };
  getPage(slug: string): WikiPage | undefined;
  createPage(data: InsertWikiPage): WikiPage;
  updatePage(slug: string, data: Partial<InsertWikiPage>): WikiPage | undefined;
  deletePage(slug: string): boolean;

  // Repos
  getRepos(): Repo[];
  getRepo(id: number): Repo | undefined;
  createRepo(data: InsertRepo): Repo;
  deleteRepo(id: number): boolean;

  // Chat Messages
  getMessages(sessionId: string): ChatMessage[];
  createMessage(data: InsertChatMessage): ChatMessage;

  // Build Events
  getBuilds(): BuildEvent[];
  createBuild(data: InsertBuildEvent): BuildEvent;
  updateBuild(buildId: string, data: Partial<InsertBuildEvent>): BuildEvent | undefined;

  // Notebook Sources
  getSources(type?: string, search?: string): NotebookSource[];
  createSource(data: InsertNotebookSource): NotebookSource;

  // System Status
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
}

const startTime = Date.now();

export class DatabaseStorage implements IStorage {
  getPages(audience?: string, search?: string, limit = 50, offset = 0) {
    let allPages = db.select().from(wikiPages).all();
    if (audience) {
      allPages = allPages.filter(p => p.audience === audience || p.audience === "both");
    }
    if (search) {
      const q = search.toLowerCase();
      allPages = allPages.filter(p => 
        p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
      );
    }
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
    return db.update(wikiPages)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(wikiPages.slug, slug))
      .returning().get();
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
    return db.select().from(chatMessages).where(eq(chatMessages.sessionId, sessionId)).all();
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
    return db.update(buildEvents)
      .set(data)
      .where(eq(buildEvents.buildId, buildId))
      .returning().get();
  }

  getSources(type?: string, search?: string) {
    let all = db.select().from(notebookSources).all();
    if (type) all = all.filter(s => s.type === type);
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(s => s.title.toLowerCase().includes(q) || (s.summary?.toLowerCase().includes(q)));
    }
    return all;
  }

  createSource(data: InsertNotebookSource) {
    return db.insert(notebookSources).values(data).returning().get();
  }

  getStatus(): SystemStatus {
    const repoCount = db.select({ count: sql<number>`count(*)` }).from(repos).get();
    const pageCount = db.select({ count: sql<number>`count(*)` }).from(wikiPages).get();
    const lastBuild = db.select().from(buildEvents).orderBy(desc(buildEvents.createdAt)).get();

    return {
      status: "healthy",
      version: "0.1.0",
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
      components: {
        fastapi: "running",
        mkdocs_internal: "built",
        mkdocs_external: "built",
        d2_renderer: "available",
        github_poller: "active",
        scheduler: "running",
        database: "connected",
        llm: "connected",
      },
      monitoredRepos: repoCount?.count ?? 0,
      totalPages: pageCount?.count ?? 0,
      lastBuild: lastBuild?.createdAt ?? null,
      nextPoll: new Date(Date.now() + 600000).toISOString(),
    };
  }
}

export const storage = new DatabaseStorage();
