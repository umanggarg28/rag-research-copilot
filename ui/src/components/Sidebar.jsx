import { useState, useRef } from 'react';
import { uploadPDF, deleteDocument } from '../api';

export default function Sidebar({ docs, onDocsChange, sourceFilter, onFilterChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef();

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      await uploadPDF(file);
      await onDocsChange();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
      fileRef.current.value = '';
    }
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
    <aside style={styles.sidebar}>
      <div style={styles.brand}>
        <span style={styles.brandIcon}>📚</span>
        <span style={styles.brandText}>Research Copilot</span>
      </div>

      {/* Upload */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>KNOWLEDGE BASE</p>
        <button style={styles.uploadBtn} onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? '⏳ Ingesting…' : '+ Upload PDF'}
        </button>
        <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }} onChange={handleUpload} />
        {uploadError && <p style={styles.error}>{uploadError}</p>}
      </div>

      {/* Document list */}
      <div style={{ ...styles.section, flex: 1, overflowY: 'auto' }}>
        {docs.length === 0 ? (
          <p style={styles.empty}>No papers yet.<br />Upload a PDF to get started.</p>
        ) : (
          docs.map(doc => (
            <div
              key={doc.source}
              style={{ ...styles.docItem, ...(sourceFilter === doc.source ? styles.docActive : {}) }}
              onClick={() => onFilterChange(sourceFilter === doc.source ? null : doc.source)}
            >
              <div style={styles.docInfo}>
                <span style={styles.docName}>{doc.source}</span>
                <span style={styles.docMeta}>{doc.chunks} chunks</span>
              </div>
              <button
                style={styles.deleteBtn}
                onClick={e => { e.stopPropagation(); handleDelete(doc.source); }}
                title="Remove"
              >×</button>
            </div>
          ))
        )}
      </div>

      {sourceFilter && (
        <div style={styles.filterBadge}>
          Searching in: <strong>{sourceFilter}</strong>
          <button style={styles.clearFilter} onClick={() => onFilterChange(null)}>✕ clear</button>
        </div>
      )}

      <div style={styles.footer}>
        <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={styles.footerLink}>
          API Docs ↗
        </a>
      </div>
    </aside>
  );
}

const styles = {
  sidebar: {
    width: 260,
    minWidth: 260,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    padding: '0 0 12px 0',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 16px 16px',
    borderBottom: '1px solid var(--border)',
  },
  brandIcon: { fontSize: 20 },
  brandText: { fontWeight: 700, fontSize: 15, color: 'var(--text)' },
  section: { padding: '16px 12px 8px' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-dim)',
    letterSpacing: '0.08em',
    marginBottom: 8,
  },
  uploadBtn: {
    width: '100%',
    padding: '9px 0',
    background: 'var(--accent-dim)',
    color: 'var(--text)',
    border: 'none',
    borderRadius: 'var(--radius)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s',
  },
  error: { color: 'var(--red)', fontSize: 12, marginTop: 6 },
  empty: { color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.6 },
  docItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    marginBottom: 4,
    border: '1px solid transparent',
    transition: 'background 0.1s',
  },
  docActive: {
    background: 'var(--bg-input)',
    border: '1px solid var(--accent-dim)',
  },
  docInfo: { display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' },
  docName: { fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  docMeta: { fontSize: 11, color: 'var(--text-dim)' },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    cursor: 'pointer',
    fontSize: 16,
    lineHeight: 1,
    padding: '0 2px',
    flexShrink: 0,
  },
  filterBadge: {
    margin: '0 12px 8px',
    padding: '8px 10px',
    background: 'var(--bg-input)',
    border: '1px solid var(--accent-dim)',
    borderRadius: 8,
    fontSize: 12,
    color: 'var(--text-dim)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  clearFilter: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: 12,
    padding: 0,
    textAlign: 'left',
  },
  footer: {
    padding: '8px 16px 0',
    borderTop: '1px solid var(--border)',
    marginTop: 'auto',
  },
  footerLink: { fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none' },
};
