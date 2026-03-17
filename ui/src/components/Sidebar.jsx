import { useState, useRef } from 'react';
import { uploadPDF, deleteDocument } from '../api';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Sidebar({
  docs, onDocsChange, sourceFilter, onFilterChange,
  sessions, onLoadSession, onDeleteSession,
  collapsed, onToggleCollapse,
}) {
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState('');
  const [dragging, setDragging]         = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(null);
  const fileRef = useRef();

  async function ingest(file) {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
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

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    ingest(e.dataTransfer.files[0]);
  }

  async function handleDelete(source) {
    try {
      await deleteDocument(source);
      if (sourceFilter === source) onFilterChange(null);
      await onDocsChange();
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setConfirmDelete(null);
    }
  }

  // ── Collapsed view ───────────────────────────────────────────────────────
  if (collapsed) {
    return (
      <aside style={s.sidebarCollapsed} aria-label="Sidebar (collapsed)" data-collapsed="true">
        {/* Brand icon */}
        <div style={s.collapsedBrand} title="Research Copilot">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>

        {/* Upload icon */}
        <label style={s.collapsedBtn} title="Upload PDF" aria-label="Upload PDF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => ingest(e.target.files[0])} disabled={uploading} />
        </label>

        {/* Doc count */}
        <div style={s.collapsedBadgeRow} title={`${docs.length} document${docs.length !== 1 ? 's' : ''} ingested`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
          {docs.length > 0 && <span style={s.collapsedBadge}>{docs.length}</span>}
        </div>

        {/* Sessions count */}
        {sessions.length > 0 && (
          <div style={s.collapsedBadgeRow} title={`${sessions.length} saved session${sessions.length !== 1 ? 's' : ''}`}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span style={s.collapsedBadge}>{sessions.length}</span>
          </div>
        )}

        {/* Expand button */}
        <button style={s.collapseBtn} onClick={onToggleCollapse} title="Expand sidebar" aria-label="Expand sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 18 6-6-6-6"/>
          </svg>
        </button>
      </aside>
    );
  }

  // ── Expanded view ────────────────────────────────────────────────────────
  return (
    <aside style={s.sidebar} role="complementary" aria-label="Documents and upload">

      {/* Brand */}
      <div style={s.brand}>
        <div style={s.brandLogo}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={s.brandTitle}>Research Copilot</div>
          <div style={s.brandSub}>RAG · Grounded answers</div>
        </div>
        <button style={s.collapseExpandBtn} onClick={onToggleCollapse} title="Collapse sidebar" aria-label="Collapse sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6"/>
          </svg>
        </button>
      </div>

      {/* Upload zone */}
      <div style={s.uploadZone}
        onDragEnter={e => { e.preventDefault(); setDragging(true); }}
        onDragOver={e => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <label
          style={{ ...s.uploadBtn, ...(dragging ? s.uploadBtnDrag : {}), ...(uploading ? s.uploadBtnDisabled : {}) }}
          aria-label="Upload a PDF file"
        >
          {uploading ? (
            <span style={s.uploadingRow}><span style={s.spinner} />Ingesting…</span>
          ) : dragging ? (
            <span style={s.uploadingRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              Drop to upload
            </span>
          ) : (
            <span style={s.uploadingRow}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Upload PDF
            </span>
          )}
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: 'none' }}
            onChange={e => ingest(e.target.files[0])} disabled={uploading} />
        </label>
        {uploadError
          ? <p style={s.error}>{uploadError}</p>
          : <p style={s.uploadHint}>or drag & drop a PDF</p>
        }
      </div>

      {/* Documents */}
      <nav style={s.docsSection} aria-label="Ingested documents">
        <div style={s.sectionHeader}>
          <span style={s.sectionLabel}>DOCUMENTS</span>
          <span style={s.sectionCount}>{docs.length}</span>
          {sourceFilter && (
            <span style={s.filterPill}>
              filtered
              <button style={s.filterClear} onClick={() => onFilterChange(null)} aria-label="Clear filter">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </span>
          )}
        </div>

        <div style={s.docList}>
          {docs.length === 0 ? (
            <div style={s.emptyDocs}>
              <div style={s.emptyDocsIcon}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
              <div style={s.emptyDocsText}>No papers yet</div>
              <div style={s.emptyDocsSub}>Upload a PDF above</div>
            </div>
          ) : (
            docs.map(doc => (
              <div key={doc.source} className="doc-item"
                style={{ ...s.docItem, ...(sourceFilter === doc.source ? s.docActive : {}) }}
                onClick={() => { if (confirmDelete !== doc.source) onFilterChange(sourceFilter === doc.source ? null : doc.source); }}
                title={doc.source}
                role="button" aria-pressed={sourceFilter === doc.source} tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onFilterChange(sourceFilter === doc.source ? null : doc.source); }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                <div style={s.docInfo}>
                  <span style={s.docName}>{doc.source}</span>
                  <span style={s.docMeta}>{doc.chunks} chunks</span>
                </div>
                {sourceFilter === doc.source && <span style={s.activeRing} />}
                {confirmDelete === doc.source ? (
                  <div style={s.confirmRow} onClick={e => e.stopPropagation()}>
                    <button style={s.confirmYes} onClick={() => handleDelete(doc.source)}>Remove</button>
                    <button style={s.confirmNo}  onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </div>
                ) : (
                  <button className="delete-btn" style={s.deleteBtn}
                    onClick={e => { e.stopPropagation(); setConfirmDelete(doc.source); }}
                    aria-label={`Remove ${doc.source}`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </nav>

      {/* Recent sessions */}
      {sessions.length > 0 && (
        <nav style={s.sessionsSection} aria-label="Recent chats">
          <div style={s.sectionHeader}>
            <span style={s.sectionLabel}>RECENT CHATS</span>
            <span style={s.sectionCount}>{sessions.length}</span>
          </div>
          <div style={s.sessionList}>
            {sessions.slice(0, 5).map(sess => (
              <div key={sess.id} className="session-item" style={s.sessionItemWrap}>
                <button style={s.sessionItem} onClick={() => onLoadSession(sess)}
                  title={sess.title} aria-label={`Load session: ${sess.title}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <div style={s.sessionInfo}>
                    <span style={s.sessionTitle}>{sess.title}</span>
                    <span style={s.sessionTime}>{timeAgo(sess.timestamp)}</span>
                  </div>
                </button>
                {confirmDeleteSession === sess.id ? (
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, padding: '2px 0' }}>
                    <button style={s.confirmYes} onClick={() => { onDeleteSession(sess.id); setConfirmDeleteSession(null); }}>Remove</button>
                    <button style={s.confirmNo}  onClick={() => setConfirmDeleteSession(null)}>Cancel</button>
                  </div>
                ) : (
                  <button className="session-delete-btn" style={s.deleteBtn}
                    onClick={e => { e.stopPropagation(); setConfirmDeleteSession(sess.id); }}
                    aria-label={`Delete session: ${sess.title}`}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </nav>
      )}

      {/* Footer */}
      <div style={s.footer}>
        <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={s.footerLink}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          API Docs
        </a>
      </div>
    </aside>
  );
}

const s = {
  /* ── Expanded ── */
  sidebar: {
    width: 264, minWidth: 264,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    boxShadow: '2px 0 20px rgba(0,0,0,0.35)',
    display: 'flex', flexDirection: 'column',
    height: '100vh',
    transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '16px 12px 16px 16px',
    background: 'linear-gradient(135deg, var(--bg-panel) 0%, #1a1f3a 100%)',
    borderBottom: '1px solid var(--border)',
  },
  brandLogo: {
    width: 34, height: 34, flexShrink: 0,
    background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
    borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  brandTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: '0.02em' },
  brandSub:   { fontSize: 11, color: 'var(--text-faint)', marginTop: 1 },
  collapseExpandBtn: {
    background: 'none', border: '1px solid var(--border-dim)', borderRadius: 'var(--r-sm)',
    color: 'var(--text-faint)', cursor: 'pointer', padding: '4px 5px',
    display: 'flex', alignItems: 'center', flexShrink: 0, transition: 'border-color 0.15s, color 0.15s',
  },

  uploadZone: { padding: '12px 12px 8px' },
  uploadBtn: {
    width: '100%', padding: '9px 0',
    background: 'linear-gradient(135deg, var(--accent-dim) 0%, #5570d4 100%)',
    color: '#fff', border: 'none', borderRadius: 'var(--r-md)',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 2px 12px rgba(108,143,255,0.25)', transition: 'all 0.15s',
    display: 'block', textAlign: 'center',
  },
  uploadBtnDrag: {
    background: 'var(--bg-surface)', border: '2px dashed var(--accent)',
    boxShadow: '0 0 0 3px var(--accent-glow)', color: 'var(--accent)',
  },
  uploadBtnDisabled: { opacity: 0.65, cursor: 'not-allowed', pointerEvents: 'none' },
  uploadingRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 },
  spinner: {
    display: 'inline-block', width: 12, height: 12,
    border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
  },
  uploadHint: { fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', marginTop: 5 },
  error:      { color: 'var(--red)', fontSize: 12, marginTop: 5, textAlign: 'center' },

  docsSection: { display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 0' },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px' },
  sectionLabel:  { fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', letterSpacing: '0.08em' },
  sectionCount:  {
    fontSize: 11, background: 'var(--bg-input)', color: 'var(--text-dim)',
    borderRadius: 20, padding: '0 6px', fontWeight: 600,
  },
  filterPill: {
    marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11,
    color: 'var(--accent)', background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
    borderRadius: 20, padding: '2px 8px',
  },
  filterClear: {
    background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
    padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center',
  },
  docList: { overflowY: 'auto', padding: '0 8px', flex: 1, minHeight: 60 },
  docItem: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
    marginBottom: 2, transition: 'background 0.15s', border: '1px solid transparent', position: 'relative',
  },
  docActive: { background: 'var(--bg-surface)', border: '1px solid var(--accent-border)' },
  docInfo:   { flex: 1, overflow: 'hidden' },
  docName: {
    display: 'block', fontSize: 13, color: 'var(--text)', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  docMeta: { fontSize: 11, color: 'var(--text-dim)' },
  activeRing: { display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 },
  deleteBtn: {
    background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer',
    padding: 3, flexShrink: 0, display: 'flex', alignItems: 'center', borderRadius: 'var(--r-sm)',
  },
  confirmRow: { display: 'flex', gap: 4, flexShrink: 0 },
  confirmYes: {
    background: 'rgba(248,113,113,0.15)', border: '1px solid var(--red)', color: 'var(--red)',
    borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit',
  },
  confirmNo: {
    background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-dim)',
    borderRadius: 'var(--r-sm)', fontSize: 11, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit',
  },
  emptyDocs: { textAlign: 'center', padding: '20px 16px' },
  emptyDocsIcon: { display: 'flex', justifyContent: 'center', marginBottom: 8 },
  emptyDocsText: { fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 },
  emptyDocsSub:  { fontSize: 11, color: 'var(--text-faint)', marginTop: 3 },

  sessionsSection: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '4px 0', borderTop: '1px solid var(--border-dim)' },
  sessionList:  { overflowY: 'auto', padding: '0 8px', flex: 1 },
  sessionItemWrap: {
    display: 'flex', alignItems: 'center', gap: 2,
    borderRadius: 'var(--r-md)', marginBottom: 2,
  },
  sessionItem: {
    display: 'flex', alignItems: 'flex-start', gap: 8, flex: 1, minWidth: 0,
    padding: '7px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
    background: 'none', border: 'none', fontFamily: 'inherit',
    textAlign: 'left', transition: 'background 0.15s',
  },
  sessionInfo: { flex: 1, overflow: 'hidden' },
  sessionTitle: {
    display: 'block', fontSize: 12, color: 'var(--text-dim)', fontWeight: 500,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  sessionTime: { fontSize: 10, color: 'var(--text-faint)' },

  footer: { padding: '10px 16px', borderTop: '1px solid var(--border)', marginTop: 'auto' },
  footerLink: { fontSize: 12, color: 'var(--text-faint)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 5 },

  /* ── Collapsed ── */
  sidebarCollapsed: {
    width: 52, minWidth: 52,
    background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
    boxShadow: '2px 0 20px rgba(0,0,0,0.35)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    height: '100vh', paddingTop: 10, gap: 4,
    transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    overflow: 'hidden',
  },
  collapsedBrand: {
    width: 34, height: 34, background: 'var(--accent-glow)', border: '1px solid var(--accent-border)',
    borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginBottom: 4, cursor: 'default',
  },
  collapsedBtn: {
    width: 36, height: 36, background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--text-dim)', transition: 'border-color 0.15s',
  },
  collapsedBadgeRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative',
    width: 36, paddingTop: 4,
  },
  collapsedBadge: {
    position: 'absolute', top: 0, right: -2,
    background: 'var(--accent)', color: '#fff', borderRadius: 10,
    fontSize: 9, fontWeight: 700, padding: '1px 4px', lineHeight: 1.4,
  },
  collapseBtn: {
    marginTop: 'auto', marginBottom: 10,
    width: 36, height: 32, background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--text-dim)', transition: 'border-color 0.15s',
  },
};
