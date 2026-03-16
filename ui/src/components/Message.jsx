import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Normalize RRF scores (which top out ~0.06) to a 0-100 relative scale
function normalizeCitations(citations) {
  if (!citations?.length) return [];
  const max = Math.max(...citations.map(c => c.score));
  return citations.map(c => ({
    ...c,
    pct: max > 0 ? Math.round((c.score / max) * 100) : 0,
  }));
}

// Color-code citations by confidence tier
function citationColor(pct) {
  if (pct >= 70) return { bg: 'var(--green-glow)', border: 'var(--green)', text: 'var(--green)' };
  if (pct >= 40) return { bg: 'var(--amber-glow)', border: 'var(--amber)', text: 'var(--amber)' };
  return { bg: 'var(--red-glow)', border: 'rgba(248,113,113,0.4)', text: 'var(--red)' };
}

function ConfidenceBar({ pct }) {
  const color = citationColor(pct);
  return (
    <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 3, background: 'var(--bg-input)', borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color.text, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ fontSize: 10, color: color.text, fontWeight: 600, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function Message({ msg }) {
  const [showChunks, setShowChunks] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // Loading
  if (msg.loading) {
    return (
      <div className="msg-enter" style={s.assistantRow}>
        <div style={s.card}>
          <div style={s.dots}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{ ...s.dot, animationDelay: `${i * 0.18}s` }} />
            ))}
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
          <p style={{ color: 'var(--red)', fontSize: 13 }}>⚠ {msg.error}</p>
        </div>
      </div>
    );
  }

  const citations = normalizeCitations(msg.citations);
  const totalTokens = (msg.tokens_used?.input ?? 0) + (msg.tokens_used?.output ?? 0);

  return (
    <div className="msg-enter msg-card" style={s.assistantRow}>
      <div style={s.card}>

        {/* Copy button — hover-revealed via CSS */}
        <button className="copy-btn" style={s.copyBtn} onClick={copyAnswer}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>

        {/* Answer */}
        <div className="answer-body">
          <ReactMarkdown>{msg.answer}</ReactMarkdown>
        </div>

        {/* Citations */}
        {citations.length > 0 && (
          <>
            <div style={s.divider} />
            <div>
              <p style={s.sectionLabel}>SOURCES</p>
              <div style={s.citCards}>
                {citations.map((c, i) => {
                  const col = citationColor(c.pct);
                  return (
                    <div key={i} style={{ ...s.citCard, background: col.bg, border: `1px solid ${col.border}` }}>
                      <div style={s.citTop}>
                        <span style={s.citIcon}>📄</span>
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
        {msg.retrieved_chunks?.length > 0 && (
          <>
            <div style={s.divider} />
            <button style={s.toggleBtn} onClick={() => setShowChunks(v => !v)}>
              {showChunks ? '▲' : '▶'} {showChunks ? 'Hide' : 'Show'} {msg.retrieved_chunks.length} retrieved passages
            </button>
            {showChunks && (
              <div style={s.chunksList}>
                {msg.retrieved_chunks.map((c, i) => (
                  <div key={i} style={s.chunk}>
                    <div style={s.chunkMeta}>
                      {c.source} · page {c.page}
                      <span style={s.chunkScore}>score {c.score.toFixed(4)}</span>
                    </div>
                    <p style={s.chunkText}>{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Footer */}
        {msg.model && (
          <>
            <div style={s.divider} />
            <div style={s.footer}>
              <span>{msg.model}</span>
              <span>·</span>
              <span>{totalTokens.toLocaleString()} tokens</span>
              {msg.elapsed && <><span>·</span><span>{msg.elapsed}s</span></>}
            </div>
          </>
        )}

      </div>
    </div>
  );
}

const s = {
  userRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 8 },
  userBubble: {
    maxWidth: '70%',
    background: 'linear-gradient(135deg, var(--accent-dim), #5570d4)',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '14px 14px 4px 14px',
    fontSize: 14,
    lineHeight: 1.65,
    boxShadow: 'var(--shadow-sm)',
    fontWeight: 450,
  },

  assistantRow: { display: 'flex', justifyContent: 'flex-start', marginBottom: 8 },
  card: {
    maxWidth: '88%',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--accent)',
    padding: '16px 18px',
    borderRadius: '4px 14px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
    boxShadow: 'var(--shadow-md)',
    position: 'relative',
  },

  copyBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    padding: '3px 10px',
    fontSize: 11,
    color: 'var(--text-dim)',
    cursor: 'pointer',
    fontWeight: 500,
    zIndex: 1,
  },

  dots: { display: 'flex', gap: 5, padding: '4px 2px', alignItems: 'center' },
  dot: {
    display: 'inline-block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--text-dim)',
    animation: 'bounce 1.2s ease-in-out infinite',
  },

  divider: {
    height: 1,
    background: 'rgba(255,255,255,0.05)',
    margin: '12px 0',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--text-faint)',
    letterSpacing: '0.1em',
    marginBottom: 8,
  },

  citCards: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  citCard: {
    flex: '1 1 160px',
    minWidth: 140,
    maxWidth: 220,
    borderRadius: 'var(--r-md)',
    padding: '10px 12px',
  },
  citTop: { display: 'flex', alignItems: 'center', gap: 6 },
  citIcon: { fontSize: 14, flexShrink: 0 },
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
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 0',
    textAlign: 'left',
    fontFamily: 'inherit',
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
    marginBottom: 5,
    display: 'flex',
    justifyContent: 'space-between',
  },
  chunkScore: { color: 'var(--text-faint)' },
  chunkText: { fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.65 },

  footer: {
    display: 'flex',
    gap: 6,
    fontSize: 11,
    color: 'var(--text-faint)',
    flexWrap: 'wrap',
  },
};
