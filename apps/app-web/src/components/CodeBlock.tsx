import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Download, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  showActions?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'json',
  title,
  showActions = true,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('클립보드에 복사되었습니다');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-definition.${language}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('파일이 다운로드되었습니다');
  };

  // Simple JSON syntax highlighting
  const highlightJson = (json: string) => {
    return json
      .replace(/"([^"]+)":/g, '<span style="color: #9333EA">"$1"</span>:')
      .replace(/: "([^"]+)"/g, ': <span style="color: var(--success)">"$1"</span>')
      .replace(/: (\d+)/g, ': <span style="color: #3B82F6">$1</span>')
      .replace(/: (true|false|null)/g, ': <span style="color: #F59E0B">$1</span>')
      .replace(/\[/g, '<span style="color: var(--text-secondary)">[</span>')
      .replace(/\]/g, '<span style="color: var(--text-secondary)">]</span>')
      .replace(/{/g, '<span style="color: var(--text-secondary)">{</span>')
      .replace(/}/g, '<span style="color: var(--text-secondary)">}</span>');
  };

  return (
    <Card style={{ borderRadius: 'var(--radius-lg)' }}>
      {(title || showActions) && (
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          {title && (
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {title}
            </h3>
          )}
          {showActions && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check className="w-4 h-4 mr-1" /> : <Copy className="w-4 h-4 mr-1" />}
                {copied ? '복사됨' : '복사'}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-1" />
                다운로드
              </Button>
            </div>
          )}
        </div>
      )}
      <div
        className="p-4 overflow-auto"
        style={{
          backgroundColor: '#1e293b',
          maxHeight: '500px',
        }}
      >
        <pre className="font-mono text-sm m-0">
          <code
            dangerouslySetInnerHTML={{
              __html: language === 'json' ? highlightJson(code) : code,
            }}
            style={{ color: '#e2e8f0' }}
          />
        </pre>
      </div>
    </Card>
  );
};
