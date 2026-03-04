import { useState, useCallback, useRef } from 'react';
import { postChat, type ChatMessage, type ChatRequest } from '@/api/chat';

interface UseChatStreamOptions {
  organizationId: string;
  page: string;
  role?: string | undefined;
}

interface UseChatStreamReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

/**
 * Parse a single complete SSE data line to extract text content.
 */
function parseSSEDataLine(dataStr: string): string {
  if (dataStr === '[DONE]') return '';
  try {
    const data = JSON.parse(dataStr) as Record<string, unknown>;
    if (data['type'] === 'content_block_delta') {
      const delta = data['delta'] as Record<string, unknown> | undefined;
      if (delta && typeof delta['text'] === 'string') {
        return delta['text'];
      }
    }
    // Also handle non-streaming JSON response (fallback from non-Anthropic providers)
    if (data['success'] === true) {
      const d = data['data'] as Record<string, unknown> | undefined;
      if (d && typeof d['content'] === 'string') {
        return d['content'];
      }
    }
  } catch {
    // skip malformed JSON
  }
  return '';
}

/**
 * SSE line buffer — accumulates raw text across ReadableStream chunks,
 * splits on newlines, and only emits complete lines.
 * Keeps an incomplete trailing fragment for the next chunk.
 */
function createSSEParser() {
  let buffer = '';

  return {
    /** Feed a decoded text chunk; returns extracted text from all complete SSE data lines. */
    push(chunk: string): string {
      buffer += chunk;
      let text = '';
      // Process all complete lines (terminated by \n)
      let nlIdx: number;
      while ((nlIdx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nlIdx).trim();
        buffer = buffer.slice(nlIdx + 1);

        if (line.startsWith('data: ')) {
          text += parseSSEDataLine(line.slice(6));
        }
      }
      return text;
    },
    /** Flush any remaining buffer (call when stream ends). */
    flush(): string {
      const remaining = buffer.trim();
      buffer = '';
      if (remaining.startsWith('data: ')) {
        return parseSSEDataLine(remaining.slice(6));
      }
      return '';
    },
  };
}

export function useChatStream(opts: UseChatStreamOptions): UseChatStreamReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback((content: string) => {
    if (isStreaming || !content.trim()) return;

    const userMsg: ChatMessage = { role: 'user', content: content.trim() };

    setMessages(prev => {
      const updated = [...prev, userMsg];

      // Start streaming
      setIsStreaming(true);
      setError(null);

      const history = updated.filter(m => m.role === 'user' || m.role === 'assistant');
      const req: ChatRequest = {
        message: content.trim(),
        history: history.slice(0, -1), // exclude current message (it's in `message`)
        page: opts.page,
        role: opts.role,
      };

      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const response = await postChat(opts.organizationId, req);

          if (!response.ok) {
            const errBody = await response.text();
            setError(`AI 응답 오류 (${String(response.status)})`);
            setIsStreaming(false);
            console.error('Chat API error:', errBody);
            return;
          }

          const contentType = response.headers.get('Content-Type') ?? '';

          // Handle non-streaming JSON response (primary path — Agent with Tool Use)
          if (contentType.includes('application/json')) {
            const json = await response.json() as Record<string, unknown>;
            const data = json['data'] as Record<string, unknown> | undefined;
            const text = typeof data?.['content'] === 'string' ? data['content'] : '응답을 처리할 수 없습니다.';
            const toolsUsed = Array.isArray(data?.['toolsUsed']) ? data['toolsUsed'] as string[] : undefined;
            setMessages(p => [...p, { role: 'assistant', content: text, toolsUsed }]);
            setIsStreaming(false);
            return;
          }

          // Handle SSE stream
          if (!response.body) {
            setError('스트림 응답을 받을 수 없습니다.');
            setIsStreaming(false);
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const sseParser = createSSEParser();
          let assistantText = '';

          // Add placeholder assistant message
          setMessages(p => [...p, { role: 'assistant', content: '' }]);

          while (true) {
            const { done, value } = await reader.read();
            if (done || controller.signal.aborted) break;

            const chunk = decoder.decode(value, { stream: true });
            const newText = sseParser.push(chunk);
            if (newText) {
              assistantText += newText;
              setMessages(p => {
                const copy = [...p];
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  copy[copy.length - 1] = { role: 'assistant', content: assistantText };
                }
                return copy;
              });
            }
          }

          // Flush any remaining buffered data
          const remaining = sseParser.flush();
          if (remaining) {
            assistantText += remaining;
            setMessages(p => {
              const copy = [...p];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant') {
                copy[copy.length - 1] = { role: 'assistant', content: assistantText };
              }
              return copy;
            });
          }

          // If no text was received (e.g., stream ended immediately)
          if (!assistantText) {
            setMessages(p => {
              const copy = [...p];
              const last = copy[copy.length - 1];
              if (last && last.role === 'assistant' && last.content === '') {
                copy[copy.length - 1] = { role: 'assistant', content: '응답을 생성하지 못했습니다. 다시 시도해주세요.' };
              }
              return copy;
            });
          }
        } catch (e) {
          if (!(e instanceof DOMException && e.name === 'AbortError')) {
            setError('네트워크 오류가 발생했습니다.');
            console.error('Chat stream error:', e);
          }
        } finally {
          setIsStreaming(false);
          abortRef.current = null;
        }
      })();

      return updated;
    });
  }, [isStreaming, opts.organizationId, opts.page, opts.role]);

  const clearMessages = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  return { messages, isStreaming, error, sendMessage, clearMessages };
}
