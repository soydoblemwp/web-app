"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LifeBuoy, X, Send, RotateCcw, ThumbsUp, ThumbsDown, UserRound } from "lucide-react";
import { getWidgetBootstrapAction } from "@/server/actions/customer-support";
import { isPathAllowedForWidget } from "@/lib/customer-support/page-match";
import { isWebGPUSupported, generateLocalText } from "@/lib/ai/local/engine";
import { LocalAIError } from "@/lib/ai/local/types";

/**
 * The real, isolated Customer Support widget (Fase 40 spec section 5,
 * corrected in the Fase 40 follow-up to also serve truly public,
 * unauthenticated visitors) — wrapped in CustomerSupportWidgetErrorBoundary
 * and lazy-loaded (see widget-mount.tsx). Talks ONLY to the public
 * /api/customer-support/chat endpoint — it never imports a server-only
 * module directly, and never modifies the page's own HTML/DOM outside of
 * its own floating container.
 *
 * Two mount modes, ONE component (never a second widget):
 *   - Dashboard mode (`projectId` prop): mounted in ProjectLayout for an
 *     authenticated team member — fetches its own bootstrap via the
 *     project-scoped, VIEWER-gated server action, exactly as before.
 *   - Public mode (`publicBootstrap` prop): mounted in the public route
 *     group's layout for an anonymous visitor — the safe bootstrap is
 *     already resolved SERVER-SIDE (see (public)/layout.tsx), so this
 *     component never receives or requests a projectId at all. `null` means
 *     "no active agent applies to this page" and renders nothing.
 *
 * From this point on, both modes behave identically: every chat operation
 * (message/complete/feedback/handoff) only ever uses `bootstrap.publicId`.
 */

interface Bootstrap {
  publicId: string;
  agentName: string;
  welcomeMessage: string;
  buttonText: string;
  suggestedQuestions: string[];
  language: string;
  position: "LEFT" | "RIGHT";
  includedPaths: string[];
  excludedPaths: string[];
  offHoursMessage: string | null;
  humanHandoffEnabled: boolean;
  privacyText: string;
  appearanceTheme: string;
}

interface ChatMessage {
  id: string;
  role: "VISITOR" | "AGENT";
  content: string;
  responseType?: string;
  evidence?: string;
  needsHuman?: boolean;
  feedback?: "NONE" | "POSITIVE" | "NEGATIVE";
}

function sessionStorageKey(publicId: string) {
  return `cs-widget-session-${publicId}`;
}
function conversationStorageKey(publicId: string) {
  return `cs-widget-conversation-${publicId}`;
}

function getOrCreateSessionToken(publicId: string): string {
  const key = sessionStorageKey(publicId);
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const token = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(key, token);
    return token;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to an in-memory-only token for this page view.
    return crypto.randomUUID() + crypto.randomUUID();
  }
}

async function postChat(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/customer-support/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "No se pudo contactar al agente de soporte.");
  return data;
}

export interface CustomerSupportWidgetProps {
  /** Dashboard mode — the widget fetches its own bootstrap via a VIEWER-gated action. */
  projectId?: string;
  /** Public mode — a pre-resolved, already-safe bootstrap (or null = no active agent for this page), computed server-side. Never a projectId. */
  publicBootstrap?: Bootstrap | null;
}

export function CustomerSupportWidget({ projectId, publicBootstrap }: CustomerSupportWidgetProps) {
  const pathname = usePathname();
  const isPublicMode = publicBootstrap !== undefined;
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(isPublicMode ? publicBootstrap : null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [conversationPublicId, setConversationPublicId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sessionTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (isPublicMode || !projectId) return;
    void Promise.resolve().then(async () => {
      try {
        const result = await getWidgetBootstrapAction(projectId);
        setBootstrap(result.active ? result : null);
      } catch {
        setBootstrap(null);
      }
    });
  }, [isPublicMode, projectId]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])');
    focusable?.[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [open]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    setConversationPublicId(null);
    if (!bootstrap) return;
    try {
      localStorage.removeItem(conversationStorageKey(bootstrap.publicId));
    } catch {
      // best-effort only
    }
  }, [bootstrap]);

  async function sendMessage(text: string) {
    if (!bootstrap || busy || !text.trim()) return;
    if (!sessionTokenRef.current) sessionTokenRef.current = getOrCreateSessionToken(bootstrap.publicId);

    setBusy(true);
    setStatusText("Pensando...");
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: "VISITOR", content: text }]);
    setInput("");

    try {
      const result = await postChat({
        action: "message",
        publicId: bootstrap.publicId,
        visitorSessionToken: sessionTokenRef.current,
        conversationPublicId: conversationPublicId ?? undefined,
        message: text,
        page: pathname,
        language: bootstrap.language,
        supportsLocalAI: isWebGPUSupported(),
      });

      if (result.conversationPublicId && typeof result.conversationPublicId === "string") {
        setConversationPublicId(result.conversationPublicId);
        try {
          localStorage.setItem(conversationStorageKey(bootstrap.publicId), result.conversationPublicId);
        } catch {
          // best-effort
        }
      }

      if (result.needsGeneration) {
        setStatusText("Generando respuesta con IA local...");
        let generated: string;
        try {
          generated = await generateLocalText({ system: result.systemPrompt as string, prompt: result.userPrompt as string, maxTokens: 400 });
        } catch (err) {
          await postChat({
            action: "generation_failed",
            publicId: bootstrap.publicId,
            visitorSessionToken: sessionTokenRef.current,
            conversationPublicId: result.conversationPublicId,
            runId: result.runId,
            executionToken: result.executionToken,
            reason: err instanceof LocalAIError ? err.message : "generation_failed",
          }).then((fallback) => appendAgentMessage(fallback));
          setBusy(false);
          setStatusText(null);
          return;
        }

        const completed = await postChat({
          action: "complete",
          publicId: bootstrap.publicId,
          visitorSessionToken: sessionTokenRef.current,
          conversationPublicId: result.conversationPublicId,
          runId: result.runId,
          executionToken: result.executionToken,
          generatedText: generated,
        });
        appendAgentMessage(completed);
      } else {
        appendAgentMessage(result);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, role: "AGENT", content: err instanceof Error ? err.message : "No se pudo contactar al agente de soporte." }]);
    } finally {
      setBusy(false);
      setStatusText(null);
    }
  }

  function appendAgentMessage(result: Record<string, unknown>) {
    setMessages((prev) => [
      ...prev,
      {
        id: typeof result.messageId === "string" ? result.messageId : `agent-${Date.now()}`,
        role: "AGENT",
        content: typeof result.answer === "string" ? result.answer : "No se pudo generar una respuesta.",
        responseType: typeof result.responseType === "string" ? result.responseType : undefined,
        evidence: typeof result.evidence === "string" ? result.evidence : undefined,
        needsHuman: Boolean(result.needsHuman),
        feedback: "NONE",
      },
    ]);
  }

  async function sendFeedback(messageId: string, feedback: "POSITIVE" | "NEGATIVE") {
    if (!bootstrap || !conversationPublicId || !sessionTokenRef.current) return;
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)));
    try {
      await postChat({ action: "feedback", publicId: bootstrap.publicId, visitorSessionToken: sessionTokenRef.current, conversationPublicId, messageId, feedback });
    } catch {
      // Feedback is best-effort UX — a failure here must never disrupt the conversation.
    }
  }

  async function requestHuman() {
    if (!bootstrap || !conversationPublicId || !sessionTokenRef.current) return;
    const lastVisitorMessage = [...messages].reverse().find((m) => m.role === "VISITOR")?.content ?? "Solicito atencion humana.";
    setBusy(true);
    try {
      await postChat({
        action: "handoff",
        publicId: bootstrap.publicId,
        visitorSessionToken: sessionTokenRef.current,
        conversationPublicId,
        subject: lastVisitorMessage.slice(0, 200),
        message: lastVisitorMessage,
        page: pathname,
      });
      setMessages((prev) => [...prev, { id: `handoff-${Date.now()}`, role: "AGENT", content: "Se envio tu solicitud a un miembro del equipo. Te contactaran pronto." }]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: `handoff-err-${Date.now()}`, role: "AGENT", content: err instanceof Error ? err.message : "No se pudo enviar la solicitud." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!bootstrap) return null;
  // Never render on the Customer Support admin pages themselves — avoids a confusing recursive "help me use the help widget admin" surface. Only meaningful in dashboard mode (public pages never live under /dashboard).
  if (projectId && pathname.startsWith(`/dashboard/${projectId}/customer-support`)) return null;
  if (!isPathAllowedForWidget(pathname, bootstrap.includedPaths, bootstrap.excludedPaths)) return null;

  const side = bootstrap.position === "LEFT" ? "left-4" : "right-4";

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Cerrar ayuda" : bootstrap.buttonText}
        className={`pointer-events-auto fixed bottom-4 ${side} inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90 motion-reduce:transition-none`}
      >
        {open ? <X className="size-5" /> : <LifeBuoy className="size-5" />}
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={bootstrap.agentName}
          className={`pointer-events-auto fixed bottom-20 ${side} flex max-h-[70vh] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-xl`}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-sm font-semibold">{bootstrap.agentName}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="rounded p-1 hover:bg-accent">
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {messages.length === 0 ? (
              <div className="space-y-2">
                <p className="text-sm">{bootstrap.welcomeMessage}</p>
                {bootstrap.suggestedQuestions.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {bootstrap.suggestedQuestions.slice(0, 4).map((q) => (
                      <button key={q} type="button" onClick={() => sendMessage(q)} className="rounded-full border px-2 py-1 text-xs hover:bg-accent">
                        {q}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {messages.map((m) => (
              <div key={m.id} className={m.role === "VISITOR" ? "ml-6 rounded-lg bg-primary/10 px-3 py-2 text-sm" : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm"}>
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.role === "AGENT" && m.needsHuman && bootstrap.humanHandoffEnabled ? (
                  <button type="button" onClick={requestHuman} disabled={busy} className="mt-2 flex items-center gap-1 text-xs font-medium underline">
                    <UserRound className="size-3" /> Solicitar atencion humana
                  </button>
                ) : null}
                {m.role === "AGENT" ? (
                  <div className="mt-2 flex gap-2">
                    <button type="button" aria-label="Util" onClick={() => sendFeedback(m.id, "POSITIVE")} disabled={m.feedback !== "NONE"} className="rounded p-1 hover:bg-accent disabled:opacity-40">
                      <ThumbsUp className="size-3" />
                    </button>
                    <button type="button" aria-label="No util" onClick={() => sendFeedback(m.id, "NEGATIVE")} disabled={m.feedback !== "NONE"} className="rounded p-1 hover:bg-accent disabled:opacity-40">
                      <ThumbsDown className="size-3" />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
            {statusText ? (
              <p className="text-xs text-muted-foreground" role="status">
                {statusText}
              </p>
            ) : null}
          </div>

          <div className="border-t px-3 py-2 text-[10px] leading-tight text-muted-foreground">{bootstrap.privacyText} Este agente utiliza IA.</div>

          <form
            className="flex items-center gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <label htmlFor="cs-widget-input" className="sr-only">
              Escribe tu pregunta
            </label>
            <input
              id="cs-widget-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={busy}
              maxLength={2000}
              placeholder="Escribe tu pregunta..."
              className="min-h-11 flex-1 rounded-md border bg-background px-3 text-sm"
            />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Enviar" className="inline-flex size-11 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-50">
              <Send className="size-4" />
            </button>
            <button type="button" onClick={resetConversation} aria-label="Reiniciar conversacion" className="inline-flex size-11 items-center justify-center rounded-md border hover:bg-accent">
              <RotateCcw className="size-4" />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
