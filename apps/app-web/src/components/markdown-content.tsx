import { useMemo } from 'react';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

interface MarkdownLine {
  type: 'h1' | 'h2' | 'h3' | 'li' | 'p';
  text: string;
}

function parseLines(content: string): MarkdownLine[] {
  return content.split('\n').filter((l) => l.trim() !== '').map((line): MarkdownLine => {
    if (line.startsWith('### ')) return { type: 'h3', text: line.slice(4) };
    if (line.startsWith('## ')) return { type: 'h2', text: line.slice(3) };
    if (line.startsWith('# ')) return { type: 'h1', text: line.slice(2) };
    if (line.startsWith('- ')) return { type: 'li', text: line.slice(2) };
    return { type: 'p', text: line };
  });
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(
        <code key={key++} className="px-1.5 py-0.5 rounded text-xs" style={{ backgroundColor: 'var(--border)' }}>
          {match[3]}
        </code>
      );
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts.length > 0 ? parts : [text];
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const lines = useMemo(() => parseLines(content), [content]);

  return (
    <div className={className}>
      {lines.map((line, i) => {
        const inline = renderInline(line.text);
        switch (line.type) {
          case 'h1':
            return <h3 key={i} className="text-base font-bold mt-3 mb-1.5" style={{ color: 'var(--text-primary)' }}>{inline}</h3>;
          case 'h2':
            return <h4 key={i} className="text-sm font-semibold mt-2.5 mb-1" style={{ color: 'var(--primary)' }}>{inline}</h4>;
          case 'h3':
            return <h5 key={i} className="text-sm font-medium mt-2 mb-1" style={{ color: 'var(--text-secondary)' }}>{inline}</h5>;
          case 'li':
            return (
              <div key={i} className="flex items-start gap-2 ml-2 my-0.5">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--text-secondary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{inline}</span>
              </div>
            );
          default:
            return <p key={i} className="text-sm my-0.5 leading-relaxed" style={{ color: 'var(--text-primary)' }}>{inline}</p>;
        }
      })}
    </div>
  );
}
