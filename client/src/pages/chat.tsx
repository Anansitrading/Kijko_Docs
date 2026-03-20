import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Send, Check, X } from "lucide-react";

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  action?: { type: string; target?: string; status?: string } | null;
  timestamp: string;
}

type AgentState = "idle" | "processing" | "building";
type WsStatus = "connected" | "disconnected" | "connecting";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("idle");
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
          if (data.type === "response" || data.type === "error") {
            setAgentState("idle");
            const newMsg: ChatMsg = {
              id: `msg-${Date.now()}-${Math.random()}`,
              role: "assistant",
              content: data.content || data.message || "",
              action: data.action || null,
              timestamp: data.timestamp || new Date().toISOString(),
            };
            setMessages((prev) => [...prev, newMsg]);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setWsStatus("disconnected");
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        setWsStatus("disconnected");
      };
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [sessionId]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || wsStatus !== "connected") return;

    const userMsg: ChatMsg = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAgentState("processing");

    wsRef.current?.send(
      JSON.stringify({
        type: "message",
        content: trimmed,
        session_id: sessionId,
      })
    );

    // Refocus textarea
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
      {/* Status bar */}
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
            className="text-[10px]"
            data-testid="status-agent-state"
          >
            {agentState}
          </Badge>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-auto p-4 space-y-4" data-testid="chat-messages-area">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Send a message to start a conversation.
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
              {msg.action && (
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
              )}
              <p className="text-[10px] text-muted-foreground mt-1.5 opacity-60">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
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
      </div>
    </div>
  );
}
