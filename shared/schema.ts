import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── Wiki Pages ──────────────────────────────────────────────────────────────
export const wikiPages = sqliteTable("wiki_pages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  audience: text("audience").notNull().default("internal"), // internal | external | both
  author: text("author").notNull().default("agent"),
  wordCount: integer("word_count").notNull().default(0),
  content: text("content").notNull().default(""),
  metadata: text("metadata").notNull().default("{}"), // JSON: tags, repo_url, etc.
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertWikiPageSchema = createInsertSchema(wikiPages).omit({ id: true });
export type InsertWikiPage = z.infer<typeof insertWikiPageSchema>;
export type WikiPage = typeof wikiPages.$inferSelect;

// ── Monitored Repos ─────────────────────────────────────────────────────────
export const repos = sqliteTable("repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  name: text("name").notNull(),
  branch: text("branch").notNull().default("main"),
  lastChecked: text("last_checked"),
  lastCommitSha: text("last_commit_sha"),
  status: text("status").notNull().default("active"), // active | paused | error
  pollIntervalMinutes: integer("poll_interval_minutes").notNull().default(10),
  visibility: text("visibility").notNull().default("private"), // public | private
});

export const insertRepoSchema = createInsertSchema(repos).omit({ id: true });
export type InsertRepo = z.infer<typeof insertRepoSchema>;
export type Repo = typeof repos.$inferSelect;

// ── Chat Messages ───────────────────────────────────────────────────────────
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  role: text("role").notNull(), // user | assistant | system
  content: text("content").notNull(),
  action: text("action"), // JSON: {type, target, status} or null
  timestamp: text("timestamp").notNull(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// ── Build Events ────────────────────────────────────────────────────────────
export const buildEvents = sqliteTable("build_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  buildId: text("build_id").notNull().unique(),
  audience: text("audience").notNull(), // internal | external | both
  status: text("status").notNull().default("queued"), // queued | building | completed | failed
  reason: text("reason"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
});

export const insertBuildEventSchema = createInsertSchema(buildEvents).omit({ id: true });
export type InsertBuildEvent = z.infer<typeof insertBuildEventSchema>;
export type BuildEvent = typeof buildEvents.$inferSelect;

// ── Notebook Sources ────────────────────────────────────────────────────────
export const notebookSources = sqliteTable("notebook_sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  notebookId: text("notebook_id").notNull(),
  sourceId: text("source_id").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").notNull(), // pdf | audio | web | note
  summary: text("summary"),
  lastSynced: text("last_synced"),
});

export const insertNotebookSourceSchema = createInsertSchema(notebookSources).omit({ id: true });
export type InsertNotebookSource = z.infer<typeof insertNotebookSourceSchema>;
export type NotebookSource = typeof notebookSources.$inferSelect;
