import { useState, useEffect, type ChangeEvent, type KeyboardEvent } from "react";
import { AxisSelect } from "@/components/axis-ds";
import { AxisBadge } from "@/components/axis-ds";
import { AxisButton } from "@/components/axis-ds";
import { AxisInput } from "@/components/axis-ds";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { buildHeaders } from "@/api/headers";
import { useOrganization } from "@/contexts/OrganizationContext";

interface AuditEntry {
  id: string;
  user_id: string;
  organization_id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  role: string;
  details: string | null;
  created_at: string;
}

// Radix UI Select는 빈 문자열 value를 금지 — sentinel "all" 사용
const ALL_ROLES = "all";
const ROLE_OPTIONS = [
  { value: ALL_ROLES, label: "전체 역할" },
  { value: "analyst", label: "Analyst" },
  { value: "reviewer", label: "Reviewer" },
  { value: "developer", label: "Developer" },
  { value: "client", label: "Client" },
  { value: "executive", label: "Executive" },
  { value: "admin", label: "Admin" },
];

const ACTION_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  read: "outline",
  create: "secondary",
  update: "secondary",
  delete: "destructive",
  download: "default",
  upload: "default",
};

// 5-Role Permission Matrix
const ROLE_MATRIX = [
  { role: "Analyst", upload: true, read: true, create: false, review: false, download: false, admin: false },
  { role: "Reviewer", upload: false, read: true, create: false, review: true, download: false, admin: false },
  { role: "Developer", upload: false, read: true, create: true, review: false, download: true, admin: false },
  { role: "Client", upload: false, read: true, create: false, review: false, download: false, admin: false },
  { role: "Executive", upload: false, read: true, create: false, review: false, download: false, admin: false },
];

function MatrixCell({ allowed }: { allowed: boolean }) {
  return (
    <TableCell className="text-center">
      <span className={allowed ? "text-emerald-500" : "text-muted-foreground/40"}>
        {allowed ? "✓" : "—"}
      </span>
    </TableCell>
  );
}

export function AuditLog() {
  const { organizationId } = useOrganization();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState(ALL_ROLES);
  const [filterUser, setFilterUser] = useState("");
  const [activeView, setActiveView] = useState<"log" | "matrix">("log");

  const fetchLogs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterRole && filterRole !== ALL_ROLES) params.set("role", filterRole);
    if (filterUser) params.set("userId", filterUser);
    void fetch(`/api/admin/audit?${params.toString()}`, {
      headers: buildHeaders({ organizationId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setEntries(data as AuditEntry[]);
      })
      .catch(() => toast.error("감사 로그 로드 실패"))
      .finally(() => setLoading(false));
  };

  useEffect(fetchLogs, [organizationId]);

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex gap-2">
        <AxisButton
          variant={activeView === "log" ? "primary" : "outline"}
          onClick={() => setActiveView("log")}
        >
          감사 로그
        </AxisButton>
        <AxisButton
          variant={activeView === "matrix" ? "primary" : "outline"}
          onClick={() => setActiveView("matrix")}
        >
          역할 매트릭스
        </AxisButton>
      </div>

      {activeView === "matrix" ? (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>역할</TableHead>
                <TableHead className="text-center">업로드</TableHead>
                <TableHead className="text-center">읽기</TableHead>
                <TableHead className="text-center">생성</TableHead>
                <TableHead className="text-center">HITL 검토</TableHead>
                <TableHead className="text-center">다운로드</TableHead>
                <TableHead className="text-center">Admin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROLE_MATRIX.map((row) => (
                <TableRow key={row.role}>
                  <TableCell className="font-medium">{row.role}</TableCell>
                  <MatrixCell allowed={row.upload} />
                  <MatrixCell allowed={row.read} />
                  <MatrixCell allowed={row.create} />
                  <MatrixCell allowed={row.review} />
                  <MatrixCell allowed={row.download} />
                  <MatrixCell allowed={row.admin} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <AxisSelect
              className="w-36"
              options={ROLE_OPTIONS}
              value={filterRole}
              onValueChange={setFilterRole}
              placeholder="역할 필터"
            />
            <AxisInput
              className="w-48 h-8 text-xs"
              placeholder="User ID 검색..."
              value={filterUser}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setFilterUser(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") fetchLogs(); }}
            />
            <AxisButton variant="outline" onClick={fetchLogs}>검색</AxisButton>
          </div>

          <ScrollArea className="h-96 rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시각</TableHead>
                  <TableHead>사용자</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>액션</TableHead>
                  <TableHead>리소스</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      로딩 중...
                    </TableCell>
                  </TableRow>
                ) : entries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      감사 로그 없음
                    </TableCell>
                  </TableRow>
                ) : (
                  entries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-xs font-mono max-w-[120px] truncate">
                        {e.user_id}
                      </TableCell>
                      <TableCell>
                        <AxisBadge variant="outline">{e.role}</AxisBadge>
                      </TableCell>
                      <TableCell>
                        <AxisBadge variant={ACTION_COLORS[e.action] ?? "outline"}>
                          {e.action}
                        </AxisBadge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {e.resource}
                        {e.resource_id && (
                          <span className="font-mono text-muted-foreground"> /{e.resource_id}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
