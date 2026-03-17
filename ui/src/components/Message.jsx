import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

function CodeBlock({ className, children }) {
  const [copied, setCopied] = useState(false);
  const lang = className?.replace('language-', '') ?? 'code';
  const code = String(children).trimEnd();
  function copy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <pre style={{ position: 'relative', margin: '14px 0', overflow: 'hidden', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px', background: 'var(--bg-input)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: '"Anthropic Mono", monospace' }}>{lang}</span>
        <button onClick={copy} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text-faint)', fontSize: 10, cursor: 'pointer', padding: '2px 8px', fontFamily: 'inherit', transition: 'color 0.12s, border-color 0.12s' }}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code style={{ display: 'block', padding: '14px 16px', overflowX: 'auto', background: 'none', color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.7, fontFamily: '"Anthropic Mono", monospace' }}>{children}</code>
    </pre>
  );
}

const mdComponents = {
  // Strip the outer <pre> react-markdown adds — CodeBlock provides its own
  pre({ children }) { return <>{children}</>; },
  code({ node, inline, className, children, ...props }) {
    if (inline) return <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 'var(--r-sm)', fontSize: 13, fontFamily: '"Anthropic Mono", monospace', color: 'var(--accent)', border: '1px solid var(--border)' }} {...props}>{children}</code>;
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
};

// Normalize RRF scores (which top out ~0.06) to a 0-100 relative scale
function normalizeCitations(citations) {
  if (!citations?.length) return [];
  const max = Math.max(...citations.map(c => c.score));
  return citations.map(c => ({
    ...c,
    pct: max > 0 ? Math.round((c.score / max) * 100) : 0,
  }));
}

function normalizeChunks(chunks) {
  if (!chunks?.length) return [];
  const max = Math.max(...chunks.map(c => c.score));
  return chunks.map(c => ({
    ...c,
    pct: max > 0 ? Math.round((c.score / max) * 100) : 0,
  }));
}

// Single neutral palette — relevance shown by bar width, not color
function citationColor() {
  return { bg: 'var(--bg-input)', border: 'var(--border)', text: 'var(--text-dim)' };
}

function ConfidenceBar({ pct }) {
  return (
    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--border)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', opacity: 0.7, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 500, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function ConfidenceDot({ pct }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-faint)', fontWeight: 500, background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 6px' }}>
      {pct}%
    </span>
  );
}

export default function Message({ msg }) {
  const [showChunks, setShowChunks] = useState(false);
  const [copied, setCopied] = useState(false);
  const [highlightedKey, setHighlightedKey] = useState(null); // "source::page"

  function handleCitationClick(c) {
    const key = `${c.source}::${c.page}`;
    setHighlightedKey(prev => prev === key ? null : key);
    setShowChunks(true);
  }

  function copyAnswer() {
    navigator.clipboard.writeText(msg.answer || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // User bubble
  if (msg.role === 'user') {
    return (
      <div className="msg-enter" style={s.userRow}>
        <div style={s.userBubble}>{msg.content}</div>
      </div>
    );
  }

  // Loading: show dots if no text yet, or stream partial text with cursor
  if (msg.loading) {
    if (!msg.answer) {
      return (
        <div className="msg-enter" style={s.assistantRow}>
          <div style={s.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={s.dots}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{ ...s.dot, animationDelay: `${i * 0.18}s` }} />
                ))}
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
                Searching documents…
              </span>
            </div>
          </div>
        </div>
      );
    }
    // Streaming in progress
    return (
      <div className="msg-enter" style={s.assistantRow}>
        <div style={s.card}>
          <div className="answer-body">
            <ReactMarkdown components={mdComponents}>{msg.answer}</ReactMarkdown>
            <span className="streaming-cursor" aria-hidden="true" />
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (msg.error) {
    return (
      <div className="msg-enter" style={s.assistantRow}>
        <div style={{ ...s.card, borderLeft: '3px solid var(--red)' }}>
          <div style={s.errorRow}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{msg.error}</p>
          </div>
        </div>
      </div>
    );
  }

  const citations = normalizeCitations(msg.citations);
  const chunks = normalizeChunks(msg.retrieved_chunks);
  const totalTokens = (msg.tokens_used?.input ?? 0) + (msg.tokens_used?.output ?? 0);

  return (
    <div className="msg-enter msg-card" style={s.assistantRow}>
      <div style={s.card}>

        {/* Answer */}
        <div className="answer-body">
          <ReactMarkdown components={mdComponents}>{msg.answer}</ReactMarkdown>
        </div>

        {/* Copy button — hover-revealed via CSS, below the answer */}
        <button
          className="copy-btn"
          style={s.copyBtn}
          onClick={copyAnswer}
          aria-label="Copy answer to clipboard"
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy
            </>
          )}
        </button>

        {/* Citations */}
        {citations.length > 0 && (
          <>
            <div style={s.divider} />
            <div>
              <p style={s.sectionLabel}>Sources</p>
              <div className="cit-scroll" style={s.citCards} role="region" aria-label="Source citations" tabIndex={0}>
                {citations.map((c, i) => {
                  const col = citationColor(c.pct);
                  return (
                    <div
                      key={i}
                      className="cit-card"
                      style={{
                        ...s.citCard,
                        background: col.bg,
                        border: `1px solid ${col.border}`,
                        outline: highlightedKey === `${c.source}::${c.page}` ? `2px solid ${col.border}` : 'none',
                        outlineOffset: 2,
                      }}
                      title={`${c.filename} — page ${c.page} · Click to highlight passage`}
                      onClick={() => handleCitationClick(c)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCitationClick(c); }}
                      role="button"
                      tabIndex={0}
                      aria-label={`View source passage: ${c.source} page ${c.page}`}
                    >
                      <div style={s.citTop}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={col.text} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                        </svg>
                        <span style={s.citName}>{c.source}</span>
                        <span style={{ ...s.citPage, color: col.text }}>p.{c.page}</span>
                      </div>
                      <ConfidenceBar pct={c.pct} />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Retrieved chunks toggle */}
        {chunks.length > 0 && (
          <>
            <div style={s.divider} />
            <button
              className="toggle-btn"
              style={s.toggleBtn}
              onClick={() => setShowChunks(v => !v)}
              aria-expanded={showChunks}
              aria-label={`${showChunks ? 'Hide' : 'Show'} source passages`}
            >
              <svg
                style={{ transition: 'transform 0.15s', transform: showChunks ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              >
                <path d="m9 18 6-6-6-6"/>
              </svg>
              View source passages ({chunks.length})
            </button>
            {showChunks && (
              <div style={s.chunksList}>
                {chunks.map((c, i) => {
                  const isHighlighted = highlightedKey === `${c.source}::${c.page}`;
                  return (
                    <div key={i} style={{ ...s.chunk, ...(isHighlighted ? s.chunkHighlighted : {}) }}>
                      <div style={s.chunkMeta}>
                        <span>{c.source} · page {c.page}</span>
                        <ConfidenceDot pct={c.pct} />
                      </div>
                      <p style={s.chunkText}>{c.text}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {msg.model && (
          <>
            <div style={s.divider} />
            <div style={s.footer}>
              <span style={s.footerModel}>{msg.model}</span>
              <span style={s.footerDot}>·</span>
              <span>{totalTokens.toLocaleString()} tokens</span>
              {msg.elapsed && <><span style={s.footerDot}>·</span><span>{msg.elapsed}s</span></>}
              {msg.timestamp && <><span style={s.footerDot}>·</span><span>{msg.timestamp}</span></>}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

const s = {
  userRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 6, marginTop: 28 },
  userBubble: {
    maxWidth: '72%',
    background: 'var(--bg-surface)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    padding: '12px 18px',
    borderRadius: '18px 18px 4px 18px',
    fontSize: 15,
    lineHeight: 1.6,
    fontWeight: 400,
  },

  assistantRow: { display: 'flex', justifyContent: 'flex-start', marginBottom: 8 },
  card: {
    width: '100%',
    background: 'transparent',
    border: 'none',
    padding: '4px 0',
    borderRadius: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    position: 'relative',
  },

  errorRow: { display: 'flex', alignItems: 'center', gap: 8 },

  copyBtn: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: '3px 10px',
    fontSize: 11,
    color: 'var(--text-faint)',
    cursor: 'pointer',
    fontWeight: 500,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: 'inherit',
    alignSelf: 'flex-start',
    transition: 'color 0.12s, border-color 0.12s',
  },

  dots: { display: 'flex', gap: 5, padding: '4px 2px', alignItems: 'center' },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--text-dim)',
    animation: 'bounce 0.85s ease-in-out infinite',
  },

  divider: {
    height: 1,
    background: 'var(--border)',
    margin: '12px 0',
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--text-faint)',
    marginBottom: 10,
  },

  citCards: { display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', gap: 8, paddingBottom: 4 },
  citCard: {
    flex: '0 0 auto',
    width: 180,
    borderRadius: 'var(--r-md)',
    padding: '10px 12px',
  },
  citTop: { display: 'flex', alignItems: 'center', gap: 6 },
  citName: {
    flex: 1,
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  citPage: { fontSize: 11, fontWeight: 700, flexShrink: 0 },

  toggleBtn: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    color: 'var(--text-dim)',
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '4px 12px',
    textAlign: 'left',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
    letterSpacing: '0.01em',
  },
  chunksList: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  chunk: {
    background: 'var(--bg-input)',
    borderRadius: 'var(--r-md)',
    padding: '10px 12px',
    border: '1px solid var(--border-dim)',
  },
  chunkMeta: {
    fontSize: 11,
    color: 'var(--accent)',
    marginBottom: 6,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chunkText: { fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.65 },
  chunkHighlighted: {
    borderLeft: '3px solid var(--accent)',
    background: 'var(--accent-glow)',
    borderColor: 'var(--accent-border)',
  },

  footer: {
    display: 'flex',
    gap: 6,
    fontSize: 11,
    color: 'var(--text-faint)',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  footerModel: { color: 'var(--text-dim)', fontWeight: 500 },
  footerDot: { opacity: 0.4 },
};
