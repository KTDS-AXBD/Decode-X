import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useChatStream } from '@/hooks/use-chat-stream';
import { ChatToggleButton } from './ChatToggleButton';
import { ChatPanel } from './ChatPanel';

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const { organizationId } = useOrganization();

  const { messages, isStreaming, error, sendMessage, clearMessages } = useChatStream({
    organizationId,
    page: location.pathname,
    role: user?.role,
  });

  return (
    <>
      {isOpen && (
        <ChatPanel
          messages={messages}
          isStreaming={isStreaming}
          error={error}
          onSend={sendMessage}
          onClear={clearMessages}
          onClose={() => setIsOpen(false)}
        />
      )}
      <ChatToggleButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />
    </>
  );
}
