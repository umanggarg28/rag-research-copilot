import { useState, useRef } from 'react';
import { uploadPDF, deleteDocument } from '../api';

export default function Sidebar({ docs, onDocsChange, sourceFilter, onFilterChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();

  async function ingest(file) {
    if (!file || !file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      await uploadPDF(file);
      await onDocsChange();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function handleFileInput(e) { ingest(e.target.files[0]); }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    ingest(e.dataTransfer.files[0]);
  }

  async function handleDelete(source) {
    if (!confirm(`Remove "${source}" from the index?`)) return;
    try {
      await deleteDocument(source);
      if (sourceFilter === source) onFilterChange(null);
      await onDocsChange();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <aside style={s.sidebar}>
      {/* Brand */}
      <div style={s.brand}>
        <div style={s.brandLogo}>📚</div>
        <div>
          <div style={s.brandTitle}>Research Copilot</div>
          <div style={s.brandSub}>RAG · Grounded answers</div>
        </div>
      </div>

      {/* Upload zone */}
      <div style={s.uploadZone}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <button
          style={{ ...s.uploadBtn, ...(dragging ? s.uploadBtnDrag : {}) }}
          onClick={() => fileRef.current.click()}
          disabled={uploading}
        >
          {uploading ? (
            <span style={s.uploadingRow}>
              <span style={s.spinner} />
              Ingesting…
            </span>
          ) : dragging ? '📂 Drop PDF here' : '+ Upload PDF'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleFileInput} />
        {uploadError && <p style={s.error}>{uploadError}</p>}
        {!uploadError && <p style={s.uploadHint}>or drag & drop a PDF</p>}
      </div>

      {/* Documents section */}
      <div style={s.docsSection}>
        <div style={s.sectionHeader}>
          <span style={s.sectionLabel}>DOCUMENTS</span>
          <span style={s.sectionCount}>{docs.length}</span>
          {sourceFilter && (
            <span style={s.filterPill}>
              filtered
              <button style={s.filterClear} onClick={() => onFilterChange(null)}>✕</button>
            </span>
          )}
        </div>

        <div style={s.docList}>
          {docs.length === 0 ? (
            <div style={s.emptyDocs}>
              <div style={s.emptyDocsIcon}>📂</div>
              <div style={s.emptyDocsText}>No papers yet</div>
              <div style={s.emptyDocsSub}>Upload a PDF above to get started</div>
            </div>
          ) : (
            docs.map(doc => (
              <div
                key={doc.source}
                className="doc-item"
                style={{ ...s.docItem, ...(sourceFilter === doc.source ? s.docActive : {}) }}
                onClick={() => onFilterChange(sourceFilter === doc.source ? null : doc.source)}
                title={doc.source}
              >
                <span style={s.docIcon}>📄</span>
                <div style={s.docInfo}>
                  <span style={s.docName}>{doc.source}</span>
                  <span style={s.docMeta}>{doc.chunks} chunks</span>
                </div>
                {sourceFilter === doc.source && <span style={s.activeRing} />}
                <button
                  className="delete-btn"
                  style={s.deleteBtn}
                  onClick={e => { e.stopPropagation(); handleDelete(doc.source); }}
                  title="Remove from index"
                >×</button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={s.footer}>
        <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={s.footerLink}>
          API Docs ↗
        </a>
      </div>
    </aside>
  );
}

const s = {
  sidebar: {
    width: 264,
    minWidth: 264,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    boxShadow: '2px 0 20px rgba(0,0,0,0.35)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '18px 16px',
    background: 'linear-gradient(135deg, var(--bg-panel) 0%, #1a1f3a 100%)',
    borderBottom: '1px solid var(--border)',
  },
  brandLogo: { fontSize: 24, lineHeight: 1 },
  brandTitle: { fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' },
  brandSub: { fontSize: 11, color: 'var(--text-faint)', marginTop: 1, letterSpacing: '0.04em' },

  uploadZone: { padding: '14px 12px 8px' },
  uploadBtn: {
    width: '100%',
    padding: '10px 0',
    background: 'linear-gradient(135deg, var(--accent-dim) 0%, #5570d4 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 'var(--r-md)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(108,143,255,0.25)',
    transition: 'all 0.15s',
    letterSpacing: '0.02em',
  },
  uploadBtnDrag: {
    background: 'var(--accent-glow)',
    border: '2px dashed var(--accent)',
    boxShadow: '0 0 0 3px var(--accent-glow)',
  },
  uploadingRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  spinner: {
    display: 'inline-block',
    width: 12,
    height: 12,
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  uploadHint: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', marginTop: 6 },
  error: { color: 'var(--red)', fontSize: 12, marginTop: 6 },

  docsSection: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 0' },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
  },
  sectionLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.08em' },
  sectionCount: {
    fontSize: 11,
    background: 'var(--bg-input)',
    color: 'var(--text-dim)',
    borderRadius: 20,
    padding: '0 6px',
    fontWeight: 600,
  },
  filterPill: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 11,
    color: 'var(--accent)',
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-border)',
    borderRadius: 20,
    padding: '1px 8px',
  },
  filterClear: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
    lineHeight: 1,
  },

  docList: { flex: 1, overflowY: 'auto', padding: '0 8px' },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 'var(--r-md)',
    cursor: 'pointer',
    marginBottom: 3,
    transition: 'background 0.15s',
    border: '1px solid transparent',
    position: 'relative',
  },
  docActive: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--accent-border)',
  },
  docIcon: { fontSize: 15, flexShrink: 0 },
  docInfo: { flex: 1, overflow: 'hidden' },
  docName: {
    display: 'block',
    fontSize: 13,
    color: 'var(--text)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontWeight: 500,
  },
  docMeta: { fontSize: 11, color: 'var(--text-dim)' },
  activeRing: {
    display: 'inline-block',
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    fontSize: 18,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  emptyDocs: {
    textAlign: 'center',
    padding: '32px 16px',
  },
  emptyDocsIcon: { fontSize: 32, marginBottom: 8 },
  emptyDocsText: { fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 },
  emptyDocsSub: { fontSize: 12, color: 'var(--text-faint)', marginTop: 4 },

  footer: {
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
  },
  footerLink: { fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none' },
};
