import type { Express } from "express";
import type { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertWikiPageSchema, insertRepoSchema, insertBuildEventSchema, insertNotebookSourceSchema } from "@shared/schema";

export async function registerRoutes(server: Server, app: Express) {
  // ── System Status ──────────────────────────────────────────────────────
  app.get("/api/status", (_req, res) => {
    res.json(storage.getStatus());
  });

  // ── Wiki Pages ─────────────────────────────────────────────────────────
  app.get("/api/wiki/pages", (req, res) => {
    const { audience, search, limit, offset } = req.query;
    const result = storage.getPages(
      audience as string | undefined,
      search as string | undefined,
      limit ? Number(limit) : 50,
      offset ? Number(offset) : 0
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
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    try {
      const page = storage.createPage(parsed.data);
      res.status(201).json(page);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "Page with slug already exists" });
      throw e;
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

  // ── Monitored Repos ────────────────────────────────────────────────────
  app.get("/api/repos", (_req, res) => {
    const repoList = storage.getRepos();
    res.json({ repos: repoList });
  });

  app.post("/api/repos", (req, res) => {
    const parsed = insertRepoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error });
    try {
      const repo = storage.createRepo(parsed.data);
      res.status(201).json(repo);
    } catch (e: any) {
      if (e.message?.includes("UNIQUE")) return res.status(409).json({ error: "Repository already monitored" });
      throw e;
    }
  });

  app.delete("/api/repos/:id", (req, res) => {
    const deleted = storage.deleteRepo(Number(req.params.id));
    if (!deleted) return res.status(404).json({ error: "Repo not found" });
    res.status(204).send();
  });

  // ── Architecture Diagram ───────────────────────────────────────────────
  app.get("/api/architecture/diagram", (req, res) => {
    const format = (req.query.format as string) || "json";
    // Return Kijko ecosystem architecture as JSON graph data
    const repoList = storage.getRepos();
    const diagram = {
      id: "main-architecture",
      name: "Kijko Ecosystem Architecture",
      nodes: [
        { id: "app-kijko", label: "app.kijko.nl", type: "gateway", url: "/" },
        { id: "skills-2", label: "Skills 2.0", type: "service", url: "/wiki/skills-2" },
        { id: "memories", label: "Memories", type: "module", url: "/wiki/memories" },
        { id: "agents-md", label: "Agents.md", type: "module", url: "/wiki/agents-md" },
        { id: "hooks", label: "Hooks (trigger)", type: "module", url: "/wiki/hooks" },
        { id: "reflex", label: "Reflex (scripts)", type: "module", url: "/wiki/reflex" },
        { id: "integrations", label: "Integrations", type: "service", url: "/wiki/integrations" },
        { id: "plan-md", label: "Plan.md (PRD)", type: "module", url: "/wiki/plan-md" },
        { id: "projects", label: "Projects", type: "group", url: "/wiki/projects" },
        { id: "kijko-browser", label: "Kijko Browser", type: "repo", url: "/wiki/kijko-browser" },
        { id: "hypervisa", label: "HyperVisa", type: "repo", url: "/wiki/hypervisa" },
        { id: "sandra", label: "SANDRA", type: "infrastructure", url: "/wiki/sandra" },
        { id: "firecracker", label: "Firecracker VMs", type: "infrastructure", url: "/wiki/firecracker" },
        { id: "vscode-ide", label: "VSCode IDE", type: "tool", url: "/wiki/vscode-ide" },
        { id: "panopticon", label: "Panopticon", type: "repo", url: "/wiki/panopticon" },
        { id: "panopticon2", label: "Panopticon 2.0", type: "repo", url: "/wiki/panopticon2" },
        { id: "baton-exchange", label: "Baton Exchange", type: "repo", url: "/wiki/baton-exchange" },
        { id: "wikiagent", label: "WikiAgent", type: "service", url: "/wiki/wikiagent" },
        // Dynamic repos are only added if not already in the static list
        // to avoid duplicates
      ],
      edges: [
        { from: "app-kijko", to: "skills-2", label: "" },
        { from: "app-kijko", to: "projects", label: "" },
        { from: "skills-2", to: "memories", label: "" },
        { from: "skills-2", to: "agents-md", label: "" },
        { from: "skills-2", to: "hooks", label: "" },
        { from: "skills-2", to: "reflex", label: "" },
        { from: "skills-2", to: "integrations", label: "" },
        { from: "skills-2", to: "plan-md", label: "" },
        { from: "projects", to: "kijko-browser", label: "" },
        { from: "projects", to: "hypervisa", label: "" },
        { from: "projects", to: "sandra", label: "" },
        { from: "sandra", to: "firecracker", label: "" },
        { from: "sandra", to: "vscode-ide", label: "" },
        { from: "panopticon", to: "panopticon2", label: "v2 upgrade" },
        { from: "panopticon2", to: "baton-exchange", label: "context relay" },
        { from: "wikiagent", to: "app-kijko", label: "monitors" },
      ],
      lastGenerated: new Date().toISOString(),
      linkedRepos: repoList.map(r => r.name),
    };
    if (format === "json") return res.json(diagram);
    if (format === "svg") return res.type("image/svg+xml").send("<svg></svg>");
    if (format === "d2") return res.type("text/plain").send("# D2 source placeholder");
    res.json(diagram);
  });

  app.post("/api/architecture/refresh", (req, res) => {
    const buildId = `bld-${Date.now()}`;
    res.status(202).json({
      build_id: buildId,
      status: "queued",
      message: "Architecture refresh queued.",
    });
  });

  // ── Notebook Sources ───────────────────────────────────────────────────
  app.get("/api/notebook/sources", (req, res) => {
    const { type, search } = req.query;
    const sources = storage.getSources(type as string | undefined, search as string | undefined);
    res.json({ sources });
  });

  // ── Build ──────────────────────────────────────────────────────────────
  app.get("/api/builds", (_req, res) => {
    res.json({ builds: storage.getBuilds() });
  });

  app.post("/api/build", (req, res) => {
    const buildId = `bld-${Date.now()}`;
    const build = storage.createBuild({
      buildId,
      audience: req.body.audience || "both",
      status: "queued",
      reason: req.body.reason || "Manual rebuild",
      createdAt: new Date().toISOString(),
    });
    res.status(202).json(build);
  });

  // ── Chat Messages (REST fallback) ──────────────────────────────────────
  app.get("/api/chat/:sessionId", (req, res) => {
    const messages = storage.getMessages(req.params.sessionId);
    res.json({ messages });
  });

  app.post("/api/chat/:sessionId", (req, res) => {
    const msg = storage.createMessage({
      sessionId: req.params.sessionId,
      role: req.body.role || "user",
      content: req.body.content,
      action: req.body.action ? JSON.stringify(req.body.action) : null,
      timestamp: new Date().toISOString(),
    });
    res.status(201).json(msg);
  });

  // ── WebSocket Chat ─────────────────────────────────────────────────────
  const wss = new WebSocketServer({ server, path: "/api/ws/chat" });

  wss.on("connection", (ws: WebSocket) => {
    let sessionId = `session-${Date.now()}`;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.session_id) sessionId = msg.session_id;

        if (msg.type === "pong") return;

        // Store the user message
        storage.createMessage({
          sessionId,
          role: "user",
          content: msg.content || "",
          timestamp: new Date().toISOString(),
        });

        // Simulate agent response (in production, this calls the Mastra backend)
        const response = generateMockResponse(msg.content || "");
        
        storage.createMessage({
          sessionId,
          role: "assistant",
          content: response.content,
          action: response.action ? JSON.stringify(response.action) : null,
          timestamp: new Date().toISOString(),
        });

        ws.send(JSON.stringify({
          type: "response",
          content: response.content,
          action: response.action,
          session_id: sessionId,
          timestamp: new Date().toISOString(),
        }));
      } catch (e) {
        ws.send(JSON.stringify({ type: "error", code: "PARSE_ERROR", message: "Invalid message format" }));
      }
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    ws.on("close", () => clearInterval(heartbeat));

    // Welcome message
    ws.send(JSON.stringify({
      type: "response",
      content: "Connected to Kijko WikiAgent. I can help you manage wiki pages, generate architecture diagrams, monitor repos, and more. Try `/help` for available commands.",
      session_id: sessionId,
      timestamp: new Date().toISOString(),
    }));
  });

  // ── Seed demo data ─────────────────────────────────────────────────────
  seedDemoData();
}

function generateMockResponse(input: string): { content: string; action: any } {
  const lower = input.toLowerCase();
  
  if (lower.includes("help") || lower.includes("/help")) {
    return {
      content: "Available commands:\n- **Create page**: \"create a page for [component]\"\n- **Update diagram**: \"update the architecture diagram\"\n- **Show status**: \"show system status\"\n- **List repos**: \"list monitored repos\"\n- **Search**: \"search for [topic]\"\n- **Rebuild**: \"rebuild the wiki\"\n- **Rollback**: \"undo the last change\"",
      action: null,
    };
  }
  
  if (lower.includes("status")) {
    return {
      content: "System Status:\n- **API**: Running\n- **MkDocs Internal**: Built (42 pages)\n- **MkDocs External**: Built (15 pages)\n- **D2 Renderer**: Available\n- **GitHub Poller**: Active (8 repos)\n- **Last Build**: 2 minutes ago\n- **Next Poll**: in 8 minutes",
      action: { type: "status_check", status: "completed" },
    };
  }
  
  if (lower.includes("create") && lower.includes("page")) {
    return {
      content: "I'll create a new wiki page. Analyzing the component and fetching context from Open Notebook...\n\nPage created at `/docs/components/new-page.md` with 3 sections. Navigation updated. Rebuilding site...",
      action: { type: "page_create", target: "components/new-page", status: "completed" },
    };
  }
  
  if (lower.includes("rebuild")) {
    return {
      content: "Rebuild queued for both internal and external wikis. This typically takes 30-60 seconds.\n\nBuild ID: `bld-" + Date.now() + "`",
      action: { type: "build_trigger", target: "both", status: "queued" },
    };
  }

  return {
    content: "I understand. Let me process that request. As the WikiAgent, I can create pages, update diagrams, monitor repos, and manage both internal and external documentation. Could you be more specific about what you'd like me to do?",
    action: null,
  };
}

function seedDemoData() {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  
  // Seed repos
  const demoRepos = [
    { name: "panopticon", url: "https://github.com/Anansitrading/panopticon", branch: "main", status: "active", lastChecked: now, lastCommitSha: "a1b2c3d4", visibility: "private", pollIntervalMinutes: 10 },
    { name: "Panopticon2.0", url: "https://github.com/Anansitrading/Panopticon2.0", branch: "main", status: "active", lastChecked: now, lastCommitSha: "e5f6g7h8", visibility: "private", pollIntervalMinutes: 10 },
    { name: "HyperVisa3.0", url: "https://github.com/Anansitrading/HyperVisa3.0", branch: "main", status: "active", lastChecked: yesterday, lastCommitSha: "i9j0k1l2", visibility: "private", pollIntervalMinutes: 15 },
    { name: "kijko_frontend", url: "https://github.com/Anansitrading/kijko_frontend", branch: "main", status: "active", lastChecked: now, lastCommitSha: "m3n4o5p6", visibility: "public", pollIntervalMinutes: 10 },
    { name: "kijko-browser", url: "https://github.com/Anansitrading/kijko-browser", branch: "main", status: "active", lastChecked: yesterday, lastCommitSha: "q7r8s9t0", visibility: "private", pollIntervalMinutes: 30 },
    { name: "david-skills2.0", url: "https://github.com/Anansitrading/david-skills2.0", branch: "main", status: "active", lastChecked: now, lastCommitSha: "u1v2w3x4", visibility: "private", pollIntervalMinutes: 10 },
    { name: "baton-exchange", url: "https://github.com/Anansitrading/baton-exchange", branch: "main", status: "paused", lastChecked: yesterday, lastCommitSha: "y5z6a7b8", visibility: "public", pollIntervalMinutes: 60 },
    { name: "backup_kijko-frontend", url: "https://github.com/Anansitrading/backup_kijko-frontend", branch: "main", status: "active", lastChecked: now, lastCommitSha: "c9d0e1f2", visibility: "private", pollIntervalMinutes: 60 },
  ];

  for (const repo of demoRepos) {
    try { storage.createRepo(repo); } catch {}
  }

  // Seed wiki pages
  const demoPages = [
    { slug: "index", title: "Kijko Ecosystem Overview", audience: "both", author: "agent", wordCount: 850, content: "# Kijko Ecosystem\n\nMaster architecture overview...", metadata: JSON.stringify({ tags: ["overview", "architecture"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/panopticon", title: "Panopticon — MCP Agent Swarm", audience: "internal", author: "agent", wordCount: 1245, content: "# Panopticon\n\nOriginal MCP agent swarm system...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/panopticon", tags: ["mcp", "agent"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/panopticon2", title: "Panopticon 2.0 — Durable Agent Orchestration", audience: "internal", author: "agent", wordCount: 2100, content: "# Panopticon 2.0\n\nDurable agent orchestration upgrade...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/Panopticon2.0", tags: ["mcp", "agent", "durable"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/hypervisa", title: "HyperVisa 3.0 — Video-Mediated Context Engine", audience: "internal", author: "agent", wordCount: 1800, content: "# HyperVisa 3.0\n\nVideo-mediated context engine...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/HyperVisa3.0", tags: ["video", "context", "ai"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/kijko-frontend", title: "Kijko Frontend", audience: "both", author: "agent", wordCount: 620, content: "# Kijko Frontend\n\nMain web application...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/kijko_frontend", tags: ["frontend", "web"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/kijko-browser", title: "Kijko Browser", audience: "internal", author: "agent", wordCount: 940, content: "# Kijko Browser\n\nCustom browser environment...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/kijko-browser", tags: ["browser", "custom"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/david-skills", title: "Skills 2.0 — Agent Skill Framework", audience: "internal", author: "agent", wordCount: 1560, content: "# Skills 2.0\n\nModular agent skill framework...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/david-skills2.0", tags: ["skills", "agents", "framework"] }), createdAt: yesterday, updatedAt: now },
    { slug: "repos/baton-exchange", title: "Baton Exchange — Context Relay Protocol", audience: "both", author: "agent", wordCount: 780, content: "# Baton Exchange\n\nContext relay protocol for agent communication...", metadata: JSON.stringify({ repo_url: "https://github.com/Anansitrading/baton-exchange", tags: ["protocol", "context"] }), createdAt: yesterday, updatedAt: now },
    { slug: "infrastructure/sandra", title: "SANDRA — 8 CPU / 50 GB Compute Cluster", audience: "internal", author: "agent", wordCount: 1100, content: "# SANDRA\n\n8 CPU, 50 GB compute cluster with Firecracker VMs...", metadata: JSON.stringify({ tags: ["infrastructure", "vm", "firecracker"] }), createdAt: yesterday, updatedAt: now },
    { slug: "architecture/decisions", title: "Architecture Decision Records", audience: "internal", author: "agent", wordCount: 2400, content: "# Architecture Decision Records\n\nADR-001 through ADR-006...", metadata: JSON.stringify({ tags: ["adr", "architecture"] }), createdAt: yesterday, updatedAt: now },
    { slug: "getting-started", title: "Getting Started — External Contributors", audience: "external", author: "agent", wordCount: 500, content: "# Getting Started\n\nWelcome to the Kijko ecosystem...", metadata: JSON.stringify({ tags: ["onboarding", "external"] }), createdAt: yesterday, updatedAt: now },
    { slug: "api-reference", title: "API Reference", audience: "both", author: "agent", wordCount: 3200, content: "# API Reference\n\nWikiAgent API endpoints...", metadata: JSON.stringify({ tags: ["api", "reference"] }), createdAt: yesterday, updatedAt: now },
  ];

  for (const page of demoPages) {
    try { storage.createPage(page); } catch {}
  }

  // Seed notebook sources
  const demoSources = [
    { notebookId: "kijko-research", sourceId: "nb-101", title: "MCP Architecture Patterns", type: "pdf", summary: "Overview of Model Context Protocol patterns for multi-agent systems", lastSynced: now },
    { notebookId: "kijko-research", sourceId: "nb-102", title: "Firecracker VM Security Model", type: "pdf", summary: "Security analysis of Firecracker microVMs for isolated agent execution", lastSynced: now },
    { notebookId: "kijko-research", sourceId: "nb-103", title: "Video Compression for Context Transfer", type: "web", summary: "Research on HyperVisa video-mediated context compression techniques", lastSynced: yesterday },
    { notebookId: "kijko-design", sourceId: "nb-201", title: "Agent UX Patterns", type: "note", summary: "Design patterns for conversational agent interfaces", lastSynced: now },
    { notebookId: "kijko-design", sourceId: "nb-202", title: "Documentation Architecture", type: "audio", summary: "Audio notes on wiki structure and information architecture", lastSynced: yesterday },
  ];

  for (const source of demoSources) {
    try { storage.createSource(source); } catch {}
  }

  // Seed build events
  const demoBuilds = [
    { buildId: "bld-001", audience: "both", status: "completed", reason: "Initial build", startedAt: yesterday, completedAt: yesterday, createdAt: yesterday },
    { buildId: "bld-002", audience: "internal", status: "completed", reason: "Auto-update: Panopticon2.0 docs", startedAt: now, completedAt: now, createdAt: now },
    { buildId: "bld-003", audience: "both", status: "completed", reason: "Manual rebuild after page updates", startedAt: now, completedAt: now, createdAt: now },
  ];

  for (const build of demoBuilds) {
    try { storage.createBuild(build); } catch {}
  }
}
