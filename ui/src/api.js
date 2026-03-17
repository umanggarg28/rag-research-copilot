// api.js — all HTTP calls to the FastAPI backend in one place.

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

/**
 * Streaming RAG query via Server-Sent Events.
 * Calls onToken for each streamed text token, onDone with final metadata.
 */
export async function queryRAGStream(question, topK = 5, sourceFilter = null, mode = 'hybrid', onToken, onDone) {
  const body = { question, top_k: topK, mode };
  if (sourceFilter) body.source_filter = sourceFilter;

  const res = await fetch(`${BASE}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Query failed');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      let data;
      try { data = JSON.parse(line.slice(6)); } catch { continue; }

      if (data.type === 'text') onToken(data.content);
      else if (data.type === 'done') onDone(data);
      else if (data.type === 'error') throw new Error(data.content);
    }
  }
}
