import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ShieldAlert, Send, Check, X } from "lucide-react";
import type { PendingConfirmation } from "@shared/schema";

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  action?: { type: string; target?: string; status?: string } | null;
  timestamp: string;
}

type AgentState = "idle" | "processing" | "building" | "deploying" | "error";
type WsStatus = "connected" | "disconnected" | "connecting";

const CHAT_STORAGE_KEY = "kijko-wikiagent-chat-history";
const SESSION_STORAGE_KEY = "kijko-wikiagent-session-id";

function generateSessionId() {
  return `session-${Date.now()}`;
}

function parseStoredMessages(value: string | null): ChatMsg[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseAction(value: unknown): ChatMsg["action"] {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as ChatMsg["action"];
  }
  return null;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>(() =>
    typeof window === "undefined"
      ? []
      : parseStoredMessages(window.localStorage.getItem(CHAT_STORAGE_KEY)),
  );
  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [sessionId, setSessionId] = useState(() => {
    if (typeof window === "undefined") return generateSessionId();
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || generateSessionId();
  });
  const [streaming, setStreaming] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, pendingConfirmation, scrollToBottom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }, [messages, sessionId]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/chat/${sessionId}`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || messages.length > 0 || !Array.isArray(data?.messages)) return;
        setMessages(
          data.messages.map((message: any) => ({
            id: `persisted-${message.id}`,
            role: message.role === "assistant" || message.role === "agent" ? "assistant" : message.role,
            content: message.content,
            action: parseAction(message.action),
            timestamp: message.timestamp,
          })),
        );
      })
      .catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [messages.length, sessionId]);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws/chat`;

    function connect() {
      setWsStatus("connecting");
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("connected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
            return;
          }
          if (data.type === "ready" && data.session_id && !window.localStorage.getItem(SESSION_STORAGE_KEY)) {
            setSessionId(data.session_id);
          }
          if (data.type === "state" && data.state) {
            setAgentState(data.state);
            return;
          }
          if (data.type === "token") {
            setStreaming((prev) => prev + (data.chunk || ""));
            return;
          }
          if (data.type === "confirmation_required") {
            setPendingConfirmation(data.confirmation || null);
            return;
          }

          if (data.type === "final" || data.type === "response" || data.type === "error") {
            setStreaming("");
            if (data.confirmation) {
              setPendingConfirmation(data.confirmation);
            } else if (data.type === "final") {
              setPendingConfirmation(null);
            }
            const assistantContent = data.content || data.message || "";
            if (assistantContent) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `msg-${Date.now()}-${Math.random()}`,
                  role: "assistant",
                  content: assistantContent,
                  action: parseAction(data.action),
                  timestamp: data.timestamp || new Date().toISOString(),
                },
              ]);
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsStatus("disconnected");
      };
    }

    connect();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const send = (content: string, confirmationId?: string) => {
    const trimmed = content.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}-${Math.random()}`,
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      },
    ]);
    setStreaming("");
    setAgentState("processing");
    if (confirmationId) {
      setPendingConfirmation(null);
    }

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        content: trimmed,
        session_id: sessionId,
        confirmation_id: confirmationId,
      }),
    );
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || wsStatus !== "connected") return;
    send(trimmed);
    setInput("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              wsStatus === "connected"
                ? "bg-green-500"
                : wsStatus === "connecting"
                ? "bg-yellow-500"
                : "bg-red-500"
            }`}
            data-testid="status-ws-connection"
          />
          <span className="text-xs text-muted-foreground">
            {wsStatus === "connected"
              ? "Connected"
              : wsStatus === "connecting"
              ? "Connecting..."
              : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-muted-foreground" data-testid="text-session-id">
            {sessionId}
          </span>
          <Badge
            variant={agentState === "idle" ? "secondary" : "default"}
            className="text-[10px] capitalize"
            data-testid="status-agent-state"
          >
            {agentState}
          </Badge>
        </div>
      </div>

      {pendingConfirmation ? (
        <div className="mx-4 mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4" data-testid="chat-confirmation-box">
          <div className="flex items-start gap-3">
            <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Confirmation required</p>
              <p className="text-xs text-muted-foreground mt-1">{pendingConfirmation.summary}</p>
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={() => send(`Confirm ${pendingConfirmation.target || pendingConfirmation.actionType}`, pendingConfirmation.id)}
                  data-testid="button-confirm-action"
                >
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingConfirmation(null)}
                  data-testid="button-dismiss-confirmation"
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="chat-messages-area">
        {messages.length === 0 && !streaming && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm text-center px-8">
            Message the WikiAgent to create pages, refresh architecture, inspect repo status, or rebuild the docs.
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            data-testid={`chat-message-${msg.role}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border"
              }`}
            >
              <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
              {msg.action ? (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono gap-1"
                    data-testid={`action-badge-${msg.action.type}`}
                  >
                    {msg.action.status === "completed" ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    {msg.action.type} {msg.action.status}
                  </Badge>
                </div>
              ) : null}
              <p className="text-[10px] text-muted-foreground mt-1.5 opacity-60">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        {streaming ? (
          <div className="flex justify-start" data-testid="chat-message-streaming">
            <div className="max-w-[70%] rounded-lg px-3.5 py-2.5 bg-card border border-border">
              <div className="text-sm whitespace-pre-wrap break-words">{streaming}</div>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border p-4 shrink-0">
        <div className="flex items-end gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              wsStatus === "connected"
                ? "Message WikiAgent... (Enter to send, Shift+Enter for new line)"
                : "Connecting..."
            }
            disabled={wsStatus !== "connected"}
            className="min-h-[44px] max-h-32 resize-none text-sm"
            rows={1}
            data-testid="input-chat-message"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || wsStatus !== "connected"}
            data-testid="button-send-message"
            className="shrink-0 h-[44px] w-[44px]"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          History is persisted in this browser. Destructive actions require confirmation.
        </div>
      </div>
    </div>
  );
}
