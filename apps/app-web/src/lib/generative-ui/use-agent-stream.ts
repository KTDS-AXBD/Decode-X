/**
 * useAgentStream — AG-UI SSE 이벤트 소비 React Hook.
 * Design Doc: AIF-DSGN-024 §4 AG-UI Protocol
 * Ported from app-mockup for app-web integration (Phase 4).
 *
 * POST 기반 SSE이므로 fetch + ReadableStream reader를 사용한다.
 * (EventSource는 GET만 지원)
 *
 * app-web 적응: buildHeaders()를 사용하여 X-Internal-Secret, org/user 헤더를 자동 주입.
 */

import { useCallback, useRef, useState } from "react";
import type { AgUiEvent } from "@ai-foundry/types";
import { buildHeaders } from "@/api/headers";

export type AgentStreamStatus = "idle" | "running" | "completed" | "error";

interface AgentStreamState {
  events: AgUiEvent[];
  status: AgentStreamStatus;
  widgetHtml: string | null;
  error: string | null;
}

/** Agent endpoint — configurable via env var, defaults to MCP server path */
const AGENT_ENDPOINT =
  (import.meta.env["VITE_AGENT_ENDPOINT"] as string | undefined) ?? "/agent/run";
const AGENT_RESUME_ENDPOINT =
  (import.meta.env["VITE_AGENT_RESUME_ENDPOINT"] as string | undefined) ?? "/agent/resume";

export function useAgentStream(organizationId: string) {
  const [state, setState] = useState<AgentStreamState>({
    events: [],
    status: "idle",
    widgetHtml: null,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const startRun = useCallback(async (task: string) => {
    // Cancel any existing run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      events: [],
      status: "running",
      widgetHtml: null,
      error: null,
    });

    try {
      const res = await fetch(AGENT_ENDPOINT, {
        method: "POST",
        headers: buildHeaders({ organizationId, contentType: "application/json" }),
        body: JSON.stringify({ task, organizationId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.text();
        setState((prev) => ({
          ...prev,
          status: "error",
          error: `HTTP ${String(res.status)}: ${errBody}`,
        }));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "No response body",
        }));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE: split by double newline
        const parts = buffer.split("\n\n");
        // Keep last incomplete part in buffer
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          // Extract data from SSE lines
          const dataLine = trimmed
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) continue;

          const jsonStr = dataLine.slice(6); // Remove "data: " prefix
          try {
            const event = JSON.parse(jsonStr) as AgUiEvent;

            setState((prev) => {
              const newEvents = [...prev.events, event];
              const updates: Partial<AgentStreamState> = { events: newEvents };

              if (event.type === "STATE_SYNC") {
                updates.widgetHtml = event.widgetHtml;
              }
              if (event.type === "RUN_FINISHED") {
                updates.status = "completed";
              }
              if (event.type === "RUN_ERROR") {
                updates.status = "error";
                updates.error = event.error;
              }

              return { ...prev, ...updates };
            });
          } catch {
            // Skip malformed SSE data
          }
        }
      }

      // If stream ended without RUN_FINISHED, mark as completed
      setState((prev) => {
        if (prev.status === "running") {
          return { ...prev, status: "completed" };
        }
        return prev;
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // User cancelled — leave as idle
        setState((prev) => ({ ...prev, status: "idle" }));
        return;
      }
      setState((prev) => ({
        ...prev,
        status: "error",
        error: e instanceof Error ? e.message : "Unknown error",
      }));
    }
  }, [organizationId]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState((prev) => ({
      ...prev,
      status: "idle",
    }));
  }, []);

  const resumeHitl = useCallback(async (
    resumeToken: string,
    decision: string,
    data?: Record<string, unknown>,
  ) => {
    try {
      await fetch(AGENT_RESUME_ENDPOINT, {
        method: "POST",
        headers: buildHeaders({ organizationId, contentType: "application/json" }),
        body: JSON.stringify({ resumeToken, decision, data }),
      });
    } catch {
      // Resume call may fail in demo mode — continue gracefully
    }
  }, [organizationId]);

  return {
    events: state.events,
    status: state.status,
    widgetHtml: state.widgetHtml,
    error: state.error,
    startRun,
    cancelRun,
    resumeHitl,
  };
}
