import type { ApiResponse } from "@ai-foundry/types";
import { buildHeaders } from "./headers";

const API_BASE =
  (import.meta.env["VITE_API_BASE"] as string | undefined) ?? "/api";

function headers(organizationId: string): Record<string, string> {
  return buildHeaders({ organizationId });
}

export interface DocumentRow {
  document_id: string;
  organization_id: string;
  uploaded_by: string;
  r2_key: string;
  file_type: string;
  file_size_byte: number;
  original_name: string;
  status: "pending" | "processing" | "parsed" | "completed" | "failed" | "encrypted";
  uploaded_at: string;
  error_message: string | null;
  error_type: string | null;
}

export interface DocumentChunk {
  chunk_id: string;
  chunk_index: number;
  element_type: string;
  masked_text: string;
  classification: string;
  word_count: number;
}

export interface UploadResult {
  documentId: string;
  r2Key: string;
  status: string;
  uploadedAt: string;
}

export async function fetchDocuments(
  organizationId: string,
  limit = 2000,
): Promise<ApiResponse<{ documents: DocumentRow[]; total: number }>> {
  const res = await fetch(`${API_BASE}/documents?limit=${limit}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ documents: DocumentRow[]; total: number }>>;
}

export async function fetchDocument(
  organizationId: string,
  id: string,
): Promise<ApiResponse<DocumentRow>> {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<DocumentRow>>;
}

export async function fetchDocumentChunks(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/chunks`, {
    headers: headers(organizationId),
  });
  return res.json() as Promise<
    ApiResponse<{ documentId: string; chunks: DocumentChunk[] }>
  >;
}

export async function downloadDocument(
  organizationId: string,
  documentId: string,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/download`, {
    headers: headers(organizationId),
  });
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const filenameMatch = disposition.match(/filename\*=UTF-8''(.+)/);
  const rawName = filenameMatch?.[1];
  const filename = rawName ? decodeURIComponent(rawName) : `document-${documentId}`;
  const blob = await res.blob();
  return { blob, filename };
}

export async function uploadDocument(
  organizationId: string,
  file: File,
): Promise<ApiResponse<UploadResult>> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/documents`, {
    method: "POST",
    headers: headers(organizationId),
    body: formData,
  });
  return res.json() as Promise<ApiResponse<UploadResult>>;
}

export async function deleteDocument(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<{ documentId: string; deleted: boolean }>> {
  const res = await fetch(`${API_BASE}/documents/${documentId}`, {
    method: "DELETE",
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ documentId: string; deleted: boolean }>>;
}

export async function reprocessDocument(
  organizationId: string,
  documentId: string,
): Promise<ApiResponse<{ documentId: string; status: string; reprocessing: boolean }>> {
  const res = await fetch(`${API_BASE}/documents/${documentId}/reprocess`, {
    method: "POST",
    headers: headers(organizationId),
  });
  return res.json() as Promise<ApiResponse<{ documentId: string; status: string; reprocessing: boolean }>>;
}
