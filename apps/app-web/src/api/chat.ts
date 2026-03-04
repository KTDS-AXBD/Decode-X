import { buildHeaders } from './headers';

const API_BASE = (import.meta.env['VITE_API_BASE'] as string | undefined) ?? '/api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolsUsed?: string[] | undefined;
}

export interface ChatRequest {
  message: string;
  history: ChatMessage[];
  page: string;
  role?: string | undefined;
}

/**
 * POST /api/chat — streams AI assistant response via SSE.
 * Returns the raw Response for streaming consumption.
 */
export async function postChat(
  organizationId: string,
  req: ChatRequest,
): Promise<Response> {
  return fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: buildHeaders({ organizationId }),
    body: JSON.stringify(req),
  });
}
