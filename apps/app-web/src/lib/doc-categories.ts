import type { DocumentRow } from '@/api/ingestion';

/* ─── Document type classification by filename pattern ─── */

const DOC_TYPE_PATTERNS: Array<{ label: string; test: (n: string) => boolean }> = [
  { label: '화면설계서', test: (n) => n.includes('화면설계서') },
  { label: '단위기능확인', test: (n) => n.includes('단위기능확인') },
  { label: '배치Job목록', test: (n) => n.includes('배치Job') },
  { label: 'Gap분석서', test: (n) => n.includes('Gap분석') },
  { label: '요구사항정의서', test: (n) => n.includes('요구사항') },
  { label: '인터페이스목록', test: (n) => n.includes('인터페이스') },
  { label: 'ERD/스키마', test: (n) => /ERD|Schema|스키마/.test(n) },
];

export function getDocType(name: string): string {
  for (const p of DOC_TYPE_PATTERNS) {
    if (p.test(name)) return p.label;
  }
  return '기타';
}

export interface DocGroup {
  label: string;
  docs: DocumentRow[];
}

export function groupDocuments(docs: DocumentRow[]): DocGroup[] {
  const map = new Map<string, DocumentRow[]>();
  for (const doc of docs) {
    const type = getDocType(doc.original_name);
    const list = map.get(type);
    if (list) {
      list.push(doc);
    } else {
      map.set(type, [doc]);
    }
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([label, groupDocs]) => ({ label, docs: groupDocs }));
}

/* ─── Status helpers ─── */

export const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  parsed: { label: '파싱 완료', color: 'var(--success)' },
  completed: { label: '완료', color: 'var(--success)' },
  processing: { label: '처리 중', color: 'var(--accent)' },
  pending: { label: '대기', color: '#6B7280' },
  failed: { label: '실패', color: '#EF4444' },
  encrypted: { label: '암호화', color: '#F59E0B' },
};

export function getStatusInfo(status: string) {
  return STATUS_CONFIG[status] ?? { label: status, color: '#6B7280' };
}
