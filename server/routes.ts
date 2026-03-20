import crypto from "node:crypto";
import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import {
  insertWikiPageSchema,
  insertRepoSchema,
  chatTurnRequestSchema,
  type PendingConfirmation,
} from "@shared/schema";
import { getPendingConfirmationCount, handleChatTurn, splitIntoChunks, verifyGithubSignature } from "./wikiagent";
import { setAgentState, setNotebookReachable, setPendingConfirmationCount } from "./runtime-state";

function nowIso() {
  return new Date().toISOString();
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createArchitectureGraph() {
  const repoList = storage.getRepos();
  const diagram = {
    id: "main-architecture",
    name: "Kijko Ecosystem Architecture",
    format: "json",
    nodes: [
      { id: "app-kijko", label: "app.kijko.nl", type: "gateway", url: "/" },
      { id: "wikiagent", label: "WikiAgent", type: "service", url: "/chat" },
      { id: "architecture", label: "Architecture", type: "module", url: "/architecture" },
      { id: "notebook", label: "Open Notebook", type: "service", url: "/notebook" },
      ...repoList.map((repo) => ({
        id: `repo-${repo.id}`,
        label: repo.name,
        type: "repo" as const,
        url: `/wiki/${repo.name}`,
      })),
    ],
    edges: [
      { from: "app-kijko", to: "wikiagent", label: "chat" },
      { from: "wikiagent", to: "architecture", label: "diagram refresh" },
      { from: "wikiagent", to: "notebook", label: "research" },
      ...repoList.map((repo) => ({ from: "wikiagent", to: `repo-${repo.id}`, label: "monitors" })),
    ],
    lastGenerated: nowIso(),
    linkedRepos: repoList.map((repo) => repo.name),
  };
  return diagram;
}

async function streamAgentReply(ws: WebSocket, sessionId: string, result: ReturnType<typeof handleChatTurn>) {
  const timestamp = nowIso();

  for (const chunk of splitIntoChunks(result.response)) {
    ws.send(JSON.stringify({ type: "token", chunk, session_id: sessionId }));
    await wait(12);
  }

  ws.send(
    JSON.stringify({
      type: "final",
      content: result.response,
      action: result.action,
      confirmation: result.confirmation ?? null,
      session_id: sessionId,
      timestamp,
    }),
  );

  if (result.confirmation) {
    ws.send(
      JSON.stringify({
        type: "confirmation_required",
        confirmation: result.confirmation,
        session_id: sessionId,
        timestamp,
      }),
    );
  }

  if (result.state === "building") {
    setAgentState("building");
    ws.send(JSON.stringify({ type: "state", state: "building", session_id: sessionId, timestamp }));
    await wait(120);
  }

  setAgentState("idle");
  ws.send(JSON.stringify({ type: "state", state: "idle", session_id: sessionId, timestamp: nowIso() }));
}

export async function registerRoutes(server: Server, app: Express) {
  app.get("/health", (_req, res) => {
    res.json({ ok: true, status: storage.getStatus() });
  });

  app.get("/api/status", (_req, res) => {
    setPendingConfirmationCount(getPendingConfirmationCount());
    setNotebookReachable(storage.getSources().length > 0);
    res.json(storage.getStatus());
  });

  app.get("/api/wiki/pages", (req, res) => {
    const { audience, search, limit, offset } = req.query;
    const result = storage.getPages(
      audience as string | undefined,
      search as string | undefined,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
    res.json(result);
  });

  app.get("/api/pages", (req, res) => {
    const { audience, search, limit, offset } = req.query;
    const result = storage.getPages(
      audience as string | undefined,
      search as string | undefined,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0,
    );
    res.json(result);
  });

  app.get("/api/wiki/pages/:slug", (req, res) => {
    const slug = decodeURIComponent(req.params.slug);
    const page = storage.getPage(slug);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json(page);
  });

  app.post("/api/wiki/pages", (req, res) => {
    const parsed = insertWikiPageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const page = storage.createPage(parsed.data);
      res.status(201).json(page);
    } catch (error: any) {
      if (error.message?.includes("UNIQUE")) return res.status(409).json({ error: "Page with slug already exists" });
      throw error;
    }
  });

  app.put("/api/wiki/pages/:slug", (req, res) => {
    const slug = decodeURIComponent(req.params.slug);
    const page = storage.updatePage(slug, req.body);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json(page);
  });

  app.delete("/api/wiki/pages/:slug", (req, res) => {
    const slug = decodeURIComponent(req.params.slug);
    const deleted = storage.deletePage(slug);
    if (!deleted) return res.status(404).json({ error: "Page not found" });
    res.status(204).send();
  });

  app.get("/api/repos", (_req, res) => {
    res.json({ repos: storage.getRepos() });
  });

  app.post("/api/repos", (req, res) => {
    const parsed = insertRepoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const repo = storage.createRepo(parsed.data);
      res.status(201).json(repo);
    } catch (error: any) {
      if (error.message?.includes("UNIQUE")) return res.status(409).json({ error: "Repository already monitored" });
      throw error;
    }
  });

  app.delete("/api/repos/:id", (req, res) => {
    const deleted = storage.deleteRepo(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Repo not found" });
    res.status(204).send();
  });

  app.get("/api/architecture/diagram", (_req, res) => {
    res.json(createArchitectureGraph());
  });

  app.post("/api/architecture/refresh", (_req, res) => {
    const buildId = `bld-${Date.now()}`;
    storage.createBuild({
      buildId,
      audience: "both",
      status: "completed",
      reason: "Architecture refresh",
      startedAt: nowIso(),
      completedAt: nowIso(),
      createdAt: nowIso(),
    });
    res.status(202).json({ buildId, status: "queued", message: "Architecture refresh queued." });
  });

  app.get("/api/notebook/sources", (req, res) => {
    const { type, search } = req.query;
    const sources = storage.getSources(type as string | undefined, search as string | undefined);
    res.json({ sources });
  });

  app.get("/api/builds", (_req, res) => {
    res.json({ builds: storage.getBuilds() });
  });

  app.post("/api/build", (req, res) => {
    const buildId = `bld-${Date.now()}`;
    const startedAt = nowIso();
    const build = storage.createBuild({
      buildId,
      audience: req.body.audience || "both",
      status: "completed",
      reason: req.body.reason || "Manual rebuild",
      startedAt,
      completedAt: nowIso(),
      createdAt: startedAt,
    });
    res.status(202).json(build);
  });

  app.get("/api/chat/:sessionId", (req, res) => {
    const messages = storage.getMessages(req.params.sessionId);
    res.json({ messages });
  });

  app.post("/api/chat/:sessionId", (req, res) => {
    const parsed = chatTurnRequestSchema.safeParse({ ...req.body, sessionId: req.params.sessionId });
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    storage.createMessage({
      sessionId: parsed.data.sessionId || req.params.sessionId,
      role: "user",
      content: parsed.data.content,
      action: null,
      timestamp: nowIso(),
    });

    const result = handleChatTurn({
      sessionId: parsed.data.sessionId || req.params.sessionId,
      content: parsed.data.content,
      confirmationId: parsed.data.confirmationId,
      storage,
    });

    storage.createMessage({
      sessionId: parsed.data.sessionId || req.params.sessionId,
      role: "assistant",
      content: result.response,
      action: result.action ? JSON.stringify(result.action) : null,
      timestamp: nowIso(),
    });

    res.status(201).json(result);
  });

  const webhookHandler = (req: any, res: any) => {
    const rawBody = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(typeof req.rawBody === "string" ? req.rawBody : JSON.stringify(req.body ?? {}));
    const signature = req.get("x-hub-signature-256");
    const secret = process.env.GITHUB_WEBHOOK_SECRET;

    if (!verifyGithubSignature(rawBody, signature, secret)) {
      return res.status(403).json({ error: "Invalid webhook signature" });
    }

    const buildId = `bld-${Date.now()}`;
    storage.createBuild({
      buildId,
      audience: "both",
      status: "completed",
      reason: `GitHub webhook: ${req.body?.repository?.full_name || "unknown repo"}`,
      startedAt: nowIso(),
      completedAt: nowIso(),
      createdAt: nowIso(),
    });

    return res.status(202).json({ accepted: true, buildId });
  };

  app.post("/api/webhook/github", webhookHandler);
  app.post("/webhook/github", webhookHandler);

  const wss = new WebSocketServer({ server, path: "/api/ws/chat" });

  wss.on("connection", (ws: WebSocket) => {
    let sessionId = `session-${Date.now()}`;
    setAgentState("idle");
    ws.send(JSON.stringify({ type: "ready", session_id: sessionId, timestamp: nowIso() }));
    ws.send(JSON.stringify({ type: "state", state: "idle", session_id: sessionId, timestamp: nowIso() }));

    ws.on("message", async (data) => {
      try {
        const raw = JSON.parse(data.toString());
        if (raw.type === "pong") return;

        const parsed = chatTurnRequestSchema.safeParse(raw);
        if (!parsed.success) {
          ws.send(JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "Invalid message format" }));
          return;
        }

        if (parsed.data.sessionId) {
          sessionId = parsed.data.sessionId;
        }

        storage.createMessage({
          sessionId,
          role: "user",
          content: parsed.data.content,
          action: null,
          timestamp: nowIso(),
        });

        setAgentState("processing");
        ws.send(JSON.stringify({ type: "state", state: "processing", session_id: sessionId, timestamp: nowIso() }));

        const result = handleChatTurn({
          sessionId,
          content: parsed.data.content,
          confirmationId: parsed.data.confirmationId,
          storage,
        });

        storage.createMessage({
          sessionId,
          role: "assistant",
          content: result.response,
          action: result.action ? JSON.stringify(result.action) : null,
          timestamp: nowIso(),
        });

        await streamAgentReply(ws, sessionId, result);
      } catch (error) {
        setAgentState("error");
        ws.send(JSON.stringify({ type: "error", code: "SERVER_ERROR", message: error instanceof Error ? error.message : "Unknown websocket error" }));
        ws.send(JSON.stringify({ type: "state", state: "error", session_id: sessionId, timestamp: nowIso() }));
      }
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    ws.on("close", () => clearInterval(heartbeat));
  });

  seedDemoData();
}

function seedDemoData() {
  const now = nowIso();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const demoRepos = [
    { name: "panopticon", url: "https://github.com/Anansitrading/panopticon", branch: "main", status: "active", lastChecked: now, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "private", pollIntervalMinutes: 10 },
    { name: "Panopticon2.0", url: "https://github.com/Anansitrading/Panopticon2.0", branch: "main", status: "active", lastChecked: now, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "private", pollIntervalMinutes: 10 },
    { name: "HyperVisa3.0", url: "https://github.com/Anansitrading/HyperVisa3.0", branch: "main", status: "active", lastChecked: yesterday, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "private", pollIntervalMinutes: 15 },
    { name: "kijko_frontend", url: "https://github.com/Anansitrading/kijko_frontend", branch: "main", status: "active", lastChecked: now, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "public", pollIntervalMinutes: 10 },
    { name: "kijko-browser", url: "https://github.com/Anansitrading/kijko-browser", branch: "main", status: "active", lastChecked: yesterday, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "private", pollIntervalMinutes: 30 },
    { name: "baton-exchange", url: "https://github.com/Anansitrading/baton-exchange", branch: "main", status: "paused", lastChecked: yesterday, lastCommitSha: crypto.randomBytes(4).toString("hex"), visibility: "public", pollIntervalMinutes: 60 },
  ];

  for (const repo of demoRepos) {
    try {
      storage.createRepo(repo);
    } catch {
      // deterministic seed
    }
  }

  const demoPages = [
    { slug: "index", title: "Kijko Ecosystem Overview", audience: "both", author: "agent", wordCount: 850, content: "# Kijko Ecosystem\n\nMaster architecture overview.", metadata: JSON.stringify({ tags: ["overview", "architecture"] }), createdAt: yesterday, updatedAt: now },
    { slug: "docs/panopticon", title: "Panopticon", audience: "internal", author: "agent", wordCount: 1245, content: "# Panopticon\n\nOriginal MCP agent swarm system.", metadata: JSON.stringify({ repoUrl: "https://github.com/Anansitrading/panopticon", tags: ["mcp", "agent"] }), createdAt: yesterday, updatedAt: now },
    { slug: "docs/panopticon2-0", title: "Panopticon 2.0", audience: "internal", author: "agent", wordCount: 2100, content: "# Panopticon 2.0\n\nDurable agent orchestration upgrade.", metadata: JSON.stringify({ repoUrl: "https://github.com/Anansitrading/Panopticon2.0", tags: ["mcp", "agent", "durable"] }), createdAt: yesterday, updatedAt: now },
    { slug: "docs/hypervisa3-0", title: "HyperVisa 3.0", audience: "internal", author: "agent", wordCount: 1800, content: "# HyperVisa 3.0\n\nVideo-mediated context engine.", metadata: JSON.stringify({ repoUrl: "https://github.com/Anansitrading/HyperVisa3.0", tags: ["video", "context", "ai"] }), createdAt: yesterday, updatedAt: now },
    { slug: "docs/kijko-frontend", title: "Kijko Frontend", audience: "both", author: "agent", wordCount: 620, content: "# Kijko Frontend\n\nMain web application.", metadata: JSON.stringify({ repoUrl: "https://github.com/Anansitrading/kijko_frontend", tags: ["frontend", "web"] }), createdAt: yesterday, updatedAt: now },
    { slug: "docs/baton-exchange", title: "Baton Exchange", audience: "both", author: "agent", wordCount: 780, content: "# Baton Exchange\n\nContext relay protocol for agent communication.", metadata: JSON.stringify({ repoUrl: "https://github.com/Anansitrading/baton-exchange", tags: ["protocol", "context"] }), createdAt: yesterday, updatedAt: now },
  ];

  for (const page of demoPages) {
    try {
      storage.createPage(page);
    } catch {
      // deterministic seed
    }
  }

  const demoSources = [
    { notebookId: "kijko-research", sourceId: "nb-101", title: "MCP Architecture Patterns", type: "pdf", summary: "Overview of Model Context Protocol patterns for multi-agent systems", lastSynced: now },
    { notebookId: "kijko-design", sourceId: "nb-201", title: "Agent UX Patterns", type: "note", summary: "Design patterns for conversational agent interfaces", lastSynced: now },
    { notebookId: "kijko-design", sourceId: "nb-202", title: "Documentation Architecture", type: "audio", summary: "Audio notes on wiki structure and information architecture", lastSynced: yesterday },
  ];

  for (const source of demoSources) {
    try {
      storage.createSource(source);
    } catch {
      // deterministic seed
    }
  }

  const demoBuilds = [
    { buildId: "bld-001", audience: "both", status: "completed", reason: "Initial build", startedAt: yesterday, completedAt: yesterday, createdAt: yesterday },
    { buildId: "bld-002", audience: "internal", status: "completed", reason: "Recovered scaffold rebuild", startedAt: now, completedAt: now, createdAt: now },
  ];

  for (const build of demoBuilds) {
    try {
      storage.createBuild(build);
    } catch {
      // deterministic seed
    }
  }
}
