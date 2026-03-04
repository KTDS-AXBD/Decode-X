import { useState, useRef, useEffect } from 'react';
import { X, Send, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from './ChatMessage';
import type { ChatMessage as ChatMessageType } from '@/api/chat';

interface ChatPanelProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  error: string | null;
  onSend: (content: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const SUGGESTIONS = [
  '문서를 어떻게 업로드하나요?',
  '분석 상태는 어디서 확인하나요?',
  'Trust Score는 어떻게 해석하나요?',
  'Skill 패키지란 무엇인가요?',
];

export function ChatPanel({ messages, isStreaming, error, onSend, onClear, onClose }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!input.trim() || isStreaming) return;
    onSend(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed bottom-20 right-4 z-50 flex flex-col border rounded-xl shadow-2xl overflow-hidden"
      style={{
        width: '380px',
        height: '520px',
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
          >
            <span className="text-sm font-bold" style={{ color: '#3B82F6' }}>AI</span>
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              AI 가이드
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              무엇이든 물어보세요
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClear} title="대화 초기화">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} title="닫기">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-3 pt-4">
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              AI Foundry 사용에 대해 물어보세요
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => onSend(s)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatMessage key={i} role={msg.role} content={msg.content} />
        ))}

        {isStreaming && messages.length > 0 && (messages[messages.length - 1]?.role === 'user' || messages[messages.length - 1]?.content === '') && (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <Loader2 className="w-3 h-3 animate-spin" />
            응답 생성 중...
          </div>
        )}

        {error && (
          <div
            className="px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}
          >
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="border-t p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={isStreaming}
          />
          <Button
            size="sm"
            className="h-9 w-9 p-0 shrink-0"
            onClick={handleSubmit}
            disabled={!input.trim() || isStreaming}
            style={{ backgroundColor: '#3B82F6' }}
          >
            <Send className="w-4 h-4 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
