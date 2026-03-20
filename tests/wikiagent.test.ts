import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocket } from "ws";

const testRoot = mkdtempSync(path.join(tmpdir(), "kijko-wikiagent-"));
process.env.DATABASE_PATH = path.join(testRoot, "test.db");

const { architectureDiagramSchema } = await import("../shared/schema.ts");
const { registerRoutes } = await import("../server/routes.ts");
const { storage } = await import("../server/storage.ts");
const {
  determineIntent,
  handleChatTurn,
  resetPendingConfirmationsForTests,
  verifyGithubSignature,
} = await import("../server/wikiagent.ts");

const app = express();
const server = createServer(app);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));
await registerRoutes(server, app);

server.listen(0, "127.0.0.1");
await once(server, "listening");

const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Test server did not expose a TCP port");
}
const baseUrl = `http://127.0.0.1:${address.port}`;
const wsUrl = `ws://127.0.0.1:${address.port}/api/ws/chat`;

test.after(() => {
  server.close();
  rmSync(testRoot, { recursive: true, force: true });
});

test("determineIntent classifies recovered commands", () => {
  assert.equal(determineIntent("create a page for Panopticon").type, "create_page");
  assert.equal(determineIntent("delete page Panopticon").type, "delete_page");
  assert.equal(determineIntent("show system status").type, "status");
});

test("handleChatTurn requires confirmation for destructive actions", () => {
  resetPendingConfirmationsForTests();

  storage.createPage({
    slug: "docs/delete-me",
    title: "Delete Me",
    audience: "internal",
    author: "test",
    wordCount: 2,
    content: "temporary page",
    metadata: "{}",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const initial = handleChatTurn({
    sessionId: "sess-confirm",
    content: 'delete page "docs/delete-me"',
    storage,
  });

  assert.equal(initial.action?.status, "pending_confirmation");
  assert.ok(initial.confirmation?.id);

  const confirmed = handleChatTurn({
    sessionId: "sess-confirm",
    content: "confirm delete",
    confirmationId: initial.confirmation?.id,
    storage,
  });

  assert.equal(confirmed.action?.type, "delete_page");
  assert.equal(confirmed.action?.status, "completed");
  assert.equal(storage.getPage("docs/delete-me"), undefined);
});

test("verifyGithubSignature accepts the expected sha256 signature", () => {
  const payload = Buffer.from(JSON.stringify({ action: "push" }));
  const secret = "top-secret";
  const signature = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

  assert.equal(verifyGithubSignature(payload, signature, secret), true);
  assert.equal(verifyGithubSignature(payload, "sha256=deadbeef", secret), false);
});

test("recovered HTTP endpoints expose status, pages, repos, and architecture", async () => {
  const statusResponse = await fetch(`${baseUrl}/api/status`);
  assert.equal(statusResponse.status, 200);
  const statusPayload = await statusResponse.json();
  assert.equal(statusPayload.status, "healthy");
  assert.ok(statusPayload.monitoredRepos >= 1);

  const pagesResponse = await fetch(`${baseUrl}/api/pages`);
  assert.equal(pagesResponse.status, 200);
  const pagesPayload = await pagesResponse.json();
  assert.ok(Array.isArray(pagesPayload.pages));
  assert.ok(pagesPayload.pages.length >= 1);

  const reposResponse = await fetch(`${baseUrl}/api/repos`);
  assert.equal(reposResponse.status, 200);
  const reposPayload = await reposResponse.json();
  assert.ok(Array.isArray(reposPayload.repos));
  assert.ok(reposPayload.repos.length >= 1);

  const diagramResponse = await fetch(`${baseUrl}/api/architecture/diagram`);
  assert.equal(diagramResponse.status, 200);
  const diagramPayload = await diagramResponse.json();
  const diagram = architectureDiagramSchema.parse(diagramPayload);
  assert.ok(diagram.nodes.length >= 3);
});

test("websocket chat streams tokens and returns a final message", async () => {
  const ws = new WebSocket(wsUrl);
  const received: any[] = [];

  const finalMessage = new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for final websocket message"));
    }, 5000);

    ws.on("message", (raw) => {
      const parsed = JSON.parse(raw.toString());
      received.push(parsed);
      if (parsed.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
      if (parsed.type === "final") {
        clearTimeout(timeout);
        resolve(parsed);
      }
    });

    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  await once(ws, "open");
  ws.send(
    JSON.stringify({
      type: "message",
      session_id: "sess-ws",
      content: "show system status",
    }),
  );

  const result = await finalMessage;
  ws.close();

  assert.ok(received.some((message) => message.type === "ready"));
  assert.ok(received.some((message) => message.type === "state" && message.state === "processing"));
  assert.ok(received.some((message) => message.type === "token"));
  assert.equal(result.type, "final");
  assert.match(result.content, /System status:/);
});
