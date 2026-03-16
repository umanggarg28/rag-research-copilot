// api.js — all HTTP calls to the FastAPI backend in one place.
// Centralising this means if the backend URL changes (e.g. for deployment),
// you change it in one place only.

const BASE = 'http://localhost:8000';

export async function listDocuments() {
  const res = await fetch(`${BASE}/ingest/list`);
  if (!res.ok) throw new Error('Failed to fetch documents');
  return res.json();
}

export async function uploadPDF(file, sourceName) {
  const form = new FormData();
  form.append('file', file);
  if (sourceName) form.append('source_name', sourceName);
  const res = await fetch(`${BASE}/ingest/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function deleteDocument(source) {
  const res = await fetch(`${BASE}/ingest/${encodeURIComponent(source)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

export async function queryRAG(question, topK = 5, sourceFilter = null) {
  const body = { question, top_k: topK };
  if (sourceFilter) body.source_filter = sourceFilter;
  const res = await fetch(`${BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Query failed');
  }
  return res.json();
}
