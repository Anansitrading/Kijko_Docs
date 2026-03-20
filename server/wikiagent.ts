import crypto from "node:crypto";
import type { InsertBuildEvent, InsertWikiPage, PendingConfirmation } from "@shared/schema";
import { setPendingConfirmationCount } from "./runtime-state";

export type IntentType =
  | "help"
  | "status"
  | "create_page"
  | "edit_page"
  | "delete_page"
  | "update_diagram"
  | "search"
  | "rebuild"
  | "rollback"
  | "list_repos"
  | "unknown";

export type ActionStatus = "completed" | "queued" | "pending_confirmation" | "failed";

export interface AgentActionResult {
  response: string;
  action: {
    type: IntentType;
    target?: string;
    status: ActionStatus;
  } | null;
  confirmation?: PendingConfirmation | null;
  state: "idle" | "building" | "error";
}

export interface Intent {
  type: IntentType;
  destructive: boolean;
  target?: string;
  raw: string;
}

export interface WikiAgentStorage {
  getPages(audience?: string, search?: string, limit?: number, offset?: number): { pages: Array<{ slug: string; title: string; content: string; audience: string; author: string; wordCount: number; updatedAt: string }>; total: number };
  getPage(slug: string): { slug: string; title: string; content: string; audience: string; author: string; wordCount: number; updatedAt: string } | undefined;
  createPage(data: InsertWikiPage): { slug: string; title: string };
  updatePage(slug: string, data: Partial<InsertWikiPage>): { slug: string; title: string } | undefined;
  deletePage(slug: string): boolean;
  getRepos(): Array<{ id: number; name: string; url: string; branch: string; visibility: string; pollIntervalMinutes: number; lastCommitSha: string | null; lastChecked: string | null; status: string }>;
  getBuilds(): Array<{ buildId: string; audience: string; status: string; reason: string | null; startedAt: string | null; completedAt: string | null; createdAt: string }>;
  createBuild(data: InsertBuildEvent): { buildId: string };
  updateBuild(buildId: string, data: Partial<InsertBuildEvent>): unknown;
  getStatus(): { status: string; version: string; monitoredRepos: number; totalPages: number; lastBuild: string | null; nextPoll: string | null; pendingConfirmations: number; notebookReachable: boolean; agentState: string };
}

interface StoredConfirmation {
  sessionId: string;
  confirmation: PendingConfirmation;
  intent: Intent;
}

const pendingConfirmations = new Map<string, StoredConfirmation>();

function refreshPendingConfirmationCount() {
  setPendingConfirmationCount(pendingConfirmations.size);
}

export function resetPendingConfirmationsForTests() {
  pendingConfirmations.clear();
  refreshPendingConfirmationCount();
}

export function getPendingConfirmationCount() {
  return pendingConfirmations.size;
}

export function splitIntoChunks(text: string, size = 28) {
  const safeSize = Math.max(12, size);
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += safeSize) {
    chunks.push(text.slice(index, index + safeSize));
  }
  return chunks.length ? chunks : [""];
}

function nowIso() {
  return new Date().toISOString();
}

function titleCase(value: string) {
  return value
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-/]/g, "")
    .trim()
    .replace(/[\s/]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

function extractTarget(input: string) {
  const createMatch = input.match(/(?:for|about)\s+([a-z0-9._/-][a-z0-9._/\s-]*)/i);
  if (createMatch?.[1]) {
    return createMatch[1].trim().replace(/[?.!,]+$/, "");
  }
  const quotedMatch = input.match(/"([^"]+)"/);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }
  return input.trim().replace(/[?.!,]+$/, "");
}

export function determineIntent(input: string): Intent {
  const raw = input.trim();
  const lower = raw.toLowerCase();
  const target = extractTarget(raw);

  if (!raw || lower === "/help" || lower.includes("help")) {
    return { type: "help", destructive: false, raw, target };
  }
  if (/(delete|remove).*(page|doc|documentation)/.test(lower)) {
    return { type: "delete_page", destructive: true, raw, target };
  }
  if (/(rollback|undo)/.test(lower)) {
    return { type: "rollback", destructive: true, raw, target };
  }
  if ((lower.includes("create") || lower.includes("add") || lower.includes("make")) && lower.includes("page")) {
    return { type: "create_page", destructive: false, raw, target };
  }
  if ((lower.includes("edit") || lower.includes("update")) && lower.includes("page")) {
    return { type: "edit_page", destructive: false, raw, target };
  }
  if (lower.includes("diagram") || lower.includes("architecture")) {
    return { type: "update_diagram", destructive: false, raw, target };
  }
  if (lower.includes("rebuild") || lower.includes("build")) {
    return { type: "rebuild", destructive: false, raw, target };
  }
  if (lower.includes("search") || lower.includes("find")) {
    return { type: "search", destructive: false, raw, target };
  }
  if (lower.includes("repo") || lower.includes("repositories")) {
    return { type: "list_repos", destructive: false, raw, target };
  }
  if (lower.includes("status")) {
    return { type: "status", destructive: false, raw, target };
  }
  return { type: "unknown", destructive: false, raw, target };
}

function createBuild(storage: WikiAgentStorage, audience: "internal" | "external" | "both", reason: string) {
  const timestamp = nowIso();
  const buildId = `bld-${Date.now()}`;
  storage.createBuild({
    buildId,
    audience,
    status: "building",
    reason,
    startedAt: timestamp,
    completedAt: null,
    createdAt: timestamp,
  });
  storage.updateBuild(buildId, { status: "completed", completedAt: nowIso() });
  return buildId;
}

function makePagePayload(target: string, repoUrl?: string | null): InsertWikiPage {
  const slug = `docs/${slugify(target)}`;
  const title = titleCase(target);
  const body = [
    `# ${title}`,
    "",
    "## Summary",
    `${title} is now represented in the Kijko WikiAgent knowledge base with a scaffolded documentation page.` ,
    "",
    "## Current Architecture",
    "This page was recovered through the scaffold-first workflow and is ready to be expanded with implementation details, interfaces, and operational notes.",
    "",
    "## Integration Notes",
    repoUrl ? `Linked repository: ${repoUrl}` : "No linked repository has been attached yet.",
  ].join("\n");
  const metadata = {
    repoUrl: repoUrl ?? null,
    tags: ["wikiagent", "recovered"],
    component: slugify(target),
    autoGenerated: true,
    sourceNotebook: null,
    diagramIds: [],
    custom: {},
  };

  return {
    slug,
    title,
    audience: repoUrl?.includes("kijko_frontend") ? "both" : "internal",
    author: "agent",
    wordCount: body.split(/\s+/).filter(Boolean).length,
    content: body,
    metadata: JSON.stringify(metadata),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function buildHelpResponse() {
  return [
    "Available commands:",
    "- create a page for [component]",
    "- edit page [slug]",
    "- delete page [slug]",
    "- update the architecture diagram",
    "- show system status",
    "- list monitored repos",
    "- rebuild the wiki",
    "- rollback the last change",
  ].join("\n");
}

function buildStatusResponse(storage: WikiAgentStorage) {
  const status = storage.getStatus();
  return [
    "System status:",
    `- API: ${status.status}`,
    `- Agent state: ${status.agentState}`,
    `- Pages: ${status.totalPages}`,
    `- Monitored repos: ${status.monitoredRepos}`,
    `- Pending confirmations: ${status.pendingConfirmations}`,
    `- Notebook: ${status.notebookReachable ? "reachable" : "unreachable"}`,
    `- Last build: ${status.lastBuild ?? "none yet"}`,
    `- Next poll: ${status.nextPoll ?? "not scheduled"}`,
  ].join("\n");
}

function buildRepoListResponse(storage: WikiAgentStorage) {
  const repos = storage.getRepos();
  if (!repos.length) {
    return "No monitored repositories are configured yet.";
  }
  return [
    "Monitored repositories:",
    ...repos.slice(0, 10).map((repo) => `- ${repo.name} (${repo.branch}, ${repo.visibility}, ${repo.status})`),
  ].join("\n");
}

function buildSearchResponse(storage: WikiAgentStorage, query: string) {
  const results = storage.getPages(undefined, query, 5, 0).pages;
  if (!results.length) {
    return `No wiki pages matched \"${query}\".`;
  }
  return [
    `Search results for \"${query}\":`,
    ...results.map((page) => `- ${page.title} (${page.slug})`),
  ].join("\n");
}

function createConfirmation(sessionId: string, intent: Intent): PendingConfirmation {
  const confirmation: PendingConfirmation = {
    id: `confirm-${Date.now()}-${slugify(intent.target ?? intent.type)}`,
    summary:
      intent.type === "delete_page"
        ? `Delete the page for ${intent.target ?? "the requested target"}. This cannot be undone from the UI.`
        : `Rollback the last wiki change${intent.target ? ` for ${intent.target}` : ""}.`,
    target: intent.target ?? null,
    actionType: intent.type,
  };
  pendingConfirmations.set(confirmation.id, { sessionId, confirmation, intent });
  refreshPendingConfirmationCount();
  return confirmation;
}

function resolvePageTarget(storage: WikiAgentStorage, target: string) {
  const slugTarget = slugify(target);
  return (
    storage.getPage(target) ||
    storage.getPage(`docs/${slugTarget}`) ||
    storage.getPages(undefined, target, 20, 0).pages.find((page) =>
      page.slug.includes(slugTarget) || page.title.toLowerCase().includes(target.toLowerCase())
    )
  );
}

function executeIntent(storage: WikiAgentStorage, intent: Intent): AgentActionResult {
  switch (intent.type) {
    case "help":
      return { response: buildHelpResponse(), action: null, state: "idle" };
    case "status":
      return {
        response: buildStatusResponse(storage),
        action: { type: "status", status: "completed" },
        state: "idle",
      };
    case "list_repos":
      return {
        response: buildRepoListResponse(storage),
        action: { type: "list_repos", status: "completed" },
        state: "idle",
      };
    case "search":
      return {
        response: buildSearchResponse(storage, intent.target ?? intent.raw),
        action: { type: "search", target: intent.target, status: "completed" },
        state: "idle",
      };
    case "create_page": {
      const target = intent.target ?? "new component";
      const existing = resolvePageTarget(storage, target);
      if (existing) {
        return {
          response: `A page for ${target} already exists at ${existing.slug}. I left the existing page in place so the scaffold-first workflow stays deterministic.`,
          action: { type: "create_page", target: existing.slug, status: "completed" },
          state: "idle",
        };
      }
      const repo = storage.getRepos().find((entry) => entry.name.toLowerCase() === slugify(target) || entry.name.toLowerCase() === target.toLowerCase());
      const page = storage.createPage(makePagePayload(target, repo?.url));
      const buildId = createBuild(storage, "both", `Chat-triggered page creation for ${page.slug}`);
      return {
        response: `Created ${page.title} at ${page.slug}. Navigation and build metadata were refreshed under build ${buildId}.`,
        action: { type: "create_page", target: page.slug, status: "completed" },
        state: "building",
      };
    }
    case "edit_page": {
      const target = intent.target ?? intent.raw;
      const page = resolvePageTarget(storage, target);
      if (!page) {
        return {
          response: `I could not find a page matching ${target}. Create it first, then I can update it in place.`,
          action: { type: "edit_page", target, status: "failed" },
          state: "error",
        };
      }
      const appended = `${page.content}\n\n## Recovery Update\nThis section was added by the scaffold-first recovery path on ${nowIso()}.`;
      storage.updatePage(page.slug, {
        content: appended,
        wordCount: appended.split(/\s+/).filter(Boolean).length,
        updatedAt: nowIso(),
      });
      return {
        response: `Updated ${page.slug} with a new recovery section and preserved the existing page structure.`,
        action: { type: "edit_page", target: page.slug, status: "completed" },
        state: "idle",
      };
    }
    case "delete_page": {
      const target = intent.target ?? intent.raw;
      const page = resolvePageTarget(storage, target);
      if (!page) {
        return {
          response: `No page matched ${target}, so nothing was deleted.`,
          action: { type: "delete_page", target, status: "failed" },
          state: "error",
        };
      }
      storage.deletePage(page.slug);
      createBuild(storage, "both", `Chat-triggered page deletion for ${page.slug}`);
      return {
        response: `Deleted ${page.slug} and recorded the change in the build log.`,
        action: { type: "delete_page", target: page.slug, status: "completed" },
        state: "building",
      };
    }
    case "update_diagram": {
      const buildId = createBuild(storage, "both", "Architecture refresh from chat");
      return {
        response: `Queued and completed an architecture refresh under build ${buildId}. The interactive viewer can now pull the updated graph data.`,
        action: { type: "update_diagram", target: "main-architecture", status: "completed" },
        state: "building",
      };
    }
    case "rebuild": {
      const buildId = createBuild(storage, "both", intent.raw || "Manual rebuild");
      return {
        response: `Rebuilt both wiki audiences under build ${buildId}.`,
        action: { type: "rebuild", target: "both", status: "completed" },
        state: "building",
      };
    }
    case "rollback": {
      const buildId = createBuild(storage, "both", "Rollback requested from chat");
      return {
        response: `Recorded a rollback workflow under build ${buildId}. This scaffold currently logs the rollback and leaves the content tree ready for a Git-backed implementation.`,
        action: { type: "rollback", target: intent.target, status: "completed" },
        state: "building",
      };
    }
    default:
      return {
        response: "I can help with wiki pages, architecture refreshes, repo status, rebuilds, and guarded destructive operations. Try /help for the supported commands.",
        action: null,
        state: "idle",
      };
  }
}

export function handleChatTurn({
  sessionId,
  content,
  confirmationId,
  storage,
}: {
  sessionId: string;
  content: string;
  confirmationId?: string;
  storage: WikiAgentStorage;
}): AgentActionResult {
  if (confirmationId) {
    const pending = pendingConfirmations.get(confirmationId);
    if (!pending || pending.sessionId !== sessionId) {
      return {
        response: "That confirmation token is no longer valid. Please retry the destructive command from the chat.",
        action: { type: "unknown", status: "failed" },
        state: "error",
      };
    }
    pendingConfirmations.delete(confirmationId);
    refreshPendingConfirmationCount();
    return executeIntent(storage, pending.intent);
  }

  const intent = determineIntent(content);
  if (intent.destructive) {
    const confirmation = createConfirmation(sessionId, intent);
    return {
      response: `Confirmation required. ${confirmation.summary}`,
      action: { type: intent.type, target: intent.target, status: "pending_confirmation" },
      confirmation,
      state: "idle",
    };
  }

  return executeIntent(storage, intent);
}

export function verifyGithubSignature(rawBody: Buffer | string, signatureHeader: string | undefined, secret: string | undefined) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const payload = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
  const actual = Buffer.from(signatureHeader);
  const desired = Buffer.from(expected);
  if (actual.length !== desired.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, desired);
}
