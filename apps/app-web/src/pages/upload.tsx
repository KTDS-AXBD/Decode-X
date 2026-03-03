import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Upload,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  FileSearch,
  Zap,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Trash2,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import { uploadDocument, fetchDocuments, deleteDocument, reprocessDocument } from '@/api/ingestion';
import type { DocumentRow } from '@/api/ingestion';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getDocType, groupDocuments, getStatusInfo } from '@/lib/doc-categories';

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
];

export default function DocumentUploadPage() {
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDocType, setFilterDocType] = useState<string>('all');
  const [filterFileType, setFilterFileType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Group collapse state
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    void fetchDocuments(organizationId).then((res) => {
      if (res.success) setDocuments(res.data.documents);
    });
  }, [organizationId]);

  const handleFileUpload = async (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(`지원하지 않는 파일 형식: ${file.name}`);
      return;
    }
    setUploading(true);
    try {
      const res = await uploadDocument(organizationId, file);
      if (res.success) {
        toast.success(`업로드 완료: ${file.name}`);
        const refreshed = await fetchDocuments(organizationId);
        if (refreshed.success) setDocuments(refreshed.data.documents);
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('업로드 중 오류가 발생했습니다');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFileUpload(file);
  };

  const handleFileSelect = () => fileInputRef.current?.click();

  const refreshDocuments = async () => {
    const res = await fetchDocuments(organizationId);
    if (res.success) setDocuments(res.data.documents);
  };

  const handleReprocess = async (doc: DocumentRow) => {
    try {
      const res = await reprocessDocument(organizationId, doc.document_id);
      if (res.success) {
        toast.success(`재처리 시작: ${doc.original_name}`);
        await refreshDocuments();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('재처리 요청 중 오류가 발생했습니다');
    }
  };

  const handleDelete = async (doc: DocumentRow) => {
    if (!confirm(`정말 삭제하시겠습니까?\n${doc.original_name}`)) return;
    try {
      const res = await deleteDocument(organizationId, doc.document_id);
      if (res.success) {
        toast.success(`삭제 완료: ${doc.original_name}`);
        await refreshDocuments();
      } else {
        toast.error(res.error.message);
      }
    } catch {
      toast.error('삭제 중 오류가 발생했습니다');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'parsed': return <CheckCircle className="w-5 h-5" style={{ color: '#3B82F6' }} />;
      case 'completed': return <CheckCircle className="w-5 h-5" style={{ color: 'var(--success)' }} />;
      case 'processing': return <Clock className="w-5 h-5" style={{ color: 'var(--accent)' }} />;
      case 'failed': return <AlertCircle className="w-5 h-5" style={{ color: 'var(--danger)' }} />;
      case 'encrypted': return <Lock className="w-5 h-5" style={{ color: '#F59E0B' }} />;
      default: return <Clock className="w-5 h-5" style={{ color: '#6B7280' }} />;
    }
  };

  // Derive filter options from data
  const docTypes = useMemo(() => {
    const set = new Set(documents.map((d) => getDocType(d.original_name)));
    return Array.from(set).sort();
  }, [documents]);

  const fileTypes = useMemo(() => {
    const set = new Set(documents.map((d) => d.file_type));
    return Array.from(set).sort();
  }, [documents]);

  // Apply filters
  const filteredDocs = useMemo(() => {
    return documents.filter((d) => {
      if (searchQuery && !d.original_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterDocType !== 'all' && getDocType(d.original_name) !== filterDocType) return false;
      if (filterFileType !== 'all' && d.file_type !== filterFileType) return false;
      if (filterStatus !== 'all' && d.status !== filterStatus) return false;
      return true;
    });
  }, [documents, searchQuery, filterDocType, filterFileType, filterStatus]);

  const groups = useMemo(() => groupDocuments(filteredDocs), [filteredDocs]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const activeFilterCount = [filterDocType, filterFileType, filterStatus].filter((f) => f !== 'all').length;

  const completedCount = documents.filter((d) => d.status === 'completed' || d.status === 'parsed').length;
  const processingCount = documents.filter((d) => d.status === 'processing').length;
  const failedCount = documents.filter((d) => d.status === 'failed' || d.status === 'encrypted').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          문서 업로드 및 파싱 Document Upload & Parsing
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          정책 문서, 약관, 가이드 업로드 및 자동 파싱
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>총 문서</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--text-primary)' }}>{documents.length}</div>
            </div>
            <FileText className="w-10 h-10" style={{ color: '#3B82F6', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>완료</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--success)' }}>{completedCount}</div>
            </div>
            <CheckCircle className="w-10 h-10" style={{ color: 'var(--success)', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>처리 중</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--accent)' }}>{processingCount}</div>
            </div>
            <Zap className="w-10 h-10" style={{ color: 'var(--accent)', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
        <Card className="shadow-sm"><CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>오류</div>
              <div className="text-3xl font-bold mt-2" style={{ color: 'var(--danger)' }}>{failedCount}</div>
            </div>
            <FileSearch className="w-10 h-10" style={{ color: '#9333EA', opacity: 0.2 }} />
          </div>
        </CardContent></Card>
      </div>

      {/* Upload Area */}
      <Card className="shadow-sm">
        <CardContent className="p-8">
          <div
            className="border-2 border-dashed rounded-xl p-12 text-center transition-all"
            style={{
              borderColor: isDragging ? 'var(--primary)' : 'var(--border)',
              backgroundColor: isDragging ? 'rgba(26, 54, 93, 0.05)' : 'transparent',
            }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
              <Upload className="w-8 h-8" style={{ color: '#3B82F6' }} />
            </div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
              파일을 드래그하여 업로드
            </h3>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              또는 클릭하여 파일 선택 (PDF, DOCX, PPTX, XLSX, 이미지 지원)
            </p>
            <Button onClick={handleFileSelect} disabled={uploading}>
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? '업로드 중...' : '파일 선택'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(',')}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileUpload(file);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              업로드된 문서 목록
              <Badge variant="outline" className="ml-2 text-xs">{filteredDocs.length} / {documents.length}</Badge>
            </CardTitle>
          </div>

          {/* Search + Filters */}
          <div className="space-y-3 mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <Input placeholder="문서 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                <Filter className="w-3.5 h-3.5" />
                {activeFilterCount > 0 && (
                  <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: 'var(--primary)', color: '#fff' }}>{activeFilterCount}</Badge>
                )}
              </div>
              <select
                className="text-xs border rounded px-2 py-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                value={filterDocType}
                onChange={(e) => setFilterDocType(e.target.value)}
              >
                <option value="all">문서 유형</option>
                {docTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                className="text-xs border rounded px-2 py-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                value={filterFileType}
                onChange={(e) => setFilterFileType(e.target.value)}
              >
                <option value="all">파일 타입</option>
                {fileTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select
                className="text-xs border rounded px-2 py-1"
                style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text-primary)' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">상태</option>
                <option value="parsed">파싱 완료</option>
                <option value="completed">완료</option>
                <option value="processing">처리 중</option>
                <option value="failed">오류</option>
                <option value="encrypted">암호화</option>
              </select>
              {activeFilterCount > 0 && (
                <button
                  className="text-xs underline"
                  style={{ color: 'var(--text-secondary)' }}
                  onClick={() => { setFilterDocType('all'); setFilterFileType('all'); setFilterStatus('all'); }}
                >
                  초기화
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              업로드된 문서가 없습니다.
            </p>
          ) : filteredDocs.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: 'var(--text-secondary)' }}>
              필터 조건에 맞는 문서가 없습니다.
            </p>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.label);
                return (
                  <div key={group.label}>
                    {/* Group header */}
                    <button
                      className="flex items-center gap-2 w-full py-2 px-3 rounded-lg text-left transition-colors hover:opacity-80"
                      style={{ backgroundColor: 'rgba(59, 130, 246, 0.06)' }}
                      onClick={() => toggleGroup(group.label)}
                    >
                      {isCollapsed
                        ? <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                        : <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-secondary)' }} />
                      }
                      <span className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
                      <Badge variant="outline" className="text-xs">{group.docs.length}건</Badge>
                    </button>

                    {/* Group items */}
                    {!isCollapsed && (
                      <div className="space-y-2 mt-2 ml-2">
                        {group.docs.map((doc) => (
                          <div key={doc.document_id} className="border rounded-lg p-4 transition-shadow hover:shadow-md" style={{ borderColor: 'var(--border)' }}>
                            <div className="flex items-start gap-4">
                              <div className="mt-1">{getStatusIcon(doc.status)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{doc.original_name}</h4>
                                  <Badge
                                    className="text-[10px] px-1.5 py-0 shrink-0"
                                    style={{ backgroundColor: getStatusInfo(doc.status).color, color: '#fff', border: 'none' }}
                                  >
                                    {getStatusInfo(doc.status).label}
                                  </Badge>
                                  <Badge variant="outline" className="text-[10px] shrink-0" style={{ color: 'var(--text-secondary)' }}>{doc.file_type}</Badge>
                                </div>
                                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
                                  <span>{(doc.file_size_byte / 1024 / 1024).toFixed(2)} MB</span>
                                  <span>|</span>
                                  <span>{new Date(doc.uploaded_at).toLocaleString('ko-KR')}</span>
                                </div>
                                {doc.status === 'processing' && <Progress value={50} className="h-2 mt-2" />}
                                {(doc.status === 'failed' || doc.status === 'encrypted') && doc.error_message && (
                                  <div className="mt-2 text-xs px-2 py-1.5 rounded" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#DC2626' }}>
                                    {doc.error_type && <span className="font-semibold mr-1">[{doc.error_type}]</span>}
                                    {doc.error_message}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {(doc.status === 'failed' || doc.status === 'encrypted') && (
                                  <>
                                    <Button variant="ghost" size="icon" title="재처리" onClick={() => void handleReprocess(doc)}>
                                      <RotateCcw className="w-4 h-4" style={{ color: '#3B82F6' }} />
                                    </Button>
                                    <Button variant="ghost" size="icon" title="삭제" onClick={() => void handleDelete(doc)}>
                                      <Trash2 className="w-4 h-4" style={{ color: '#EF4444' }} />
                                    </Button>
                                  </>
                                )}
                                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate(`/analysis?doc=${doc.document_id}`)}>
                                  <FileSearch className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
