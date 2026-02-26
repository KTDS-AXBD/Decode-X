-- db-ingestion: document chunks from Stage 1 parsing
CREATE TABLE IF NOT EXISTS document_chunks (
  chunk_id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  element_type TEXT NOT NULL,
  masked_text TEXT NOT NULL,
  classification TEXT NOT NULL,
  word_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(document_id)
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_org ON document_chunks(organization_id);
