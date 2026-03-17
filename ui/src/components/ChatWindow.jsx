import { useEffect, useRef } from 'react';
import Message from './Message';

export default function ChatWindow({ messages, sourceFilter, onChipClick }) {
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyCard}>
          <div style={s.emptyGlow} />
          <div style={s.emptyIcon}>
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
            </svg>
          </div>
          <h2 style={s.emptyTitle}>Ask anything about your papers</h2>
          <p style={s.emptyDesc}>
            Upload PDFs via the sidebar. Answers are grounded in your documents with page citations.
          </p>
          <div style={s.examplesLabel}>Try asking</div>
          <div style={s.examples}>
            {[
              { q: 'How does multi-head attention work?',        icon: '🧠' },
              { q: 'What BLEU score was achieved on WMT 2014?',  icon: '📊' },
              { q: 'What optimizer and learning rate was used?', icon: '⚙️' },
            ].map(({ q, icon }) => (
              <button
                key={q}
                style={s.exChip}
                onClick={() => onChipClick(q)}
                aria-label={`Ask: ${q}`}
              >
                <span style={s.exIcon}>{icon}</span>
                <span style={s.exText}>{q}</span>
                <svg style={s.exArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.scrollOuter} role="log" aria-live="polite" aria-label="Chat messages">
      <div style={s.container}>
        {sourceFilter && (
          <div style={s.filterBanner}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Searching only in <strong style={{ color: 'var(--accent)' }}>{sourceFilter}</strong>
          </div>
        )}
        {messages.map(msg => (
          <Message key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} style={{ height: 1 }} />
      </div>
    </div>
  );
}

const s = {
  scrollOuter: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px 16px',
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  filterBanner: {
    background: 'var(--accent-glow)',
    border: '1px solid var(--accent-border)',
    borderRadius: 'var(--r-md)',
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--text-dim)',
    marginBottom: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    background: 'radial-gradient(ellipse at 50% 40%, rgba(108,143,255,0.04) 0%, transparent 65%)',
  },
  emptyCard: {
    maxWidth: 520,
    width: '100%',
    textAlign: 'center',
    position: 'relative',
  },
  emptyGlow: {
    position: 'absolute',
    top: -60,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 320,
    height: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(108,143,255,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  emptyIcon: {
    marginBottom: 20,
    display: 'flex',
    justifyContent: 'center',
    opacity: 0.9,
  },
  emptyTitle: { fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 10 },
  emptyDesc: { fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 32 },
  examplesLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-faint)',
    letterSpacing: '0.1em',
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  examples: { display: 'flex', flexDirection: 'column', gap: 8 },
  exChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--accent)',
    borderRadius: 'var(--r-md)',
    padding: '12px 16px',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
    transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
    color: 'var(--text-dim)',
  },
  exIcon: { fontSize: 16, flexShrink: 0 },
  exText: { fontSize: 13, color: 'var(--text)', lineHeight: 1.5, flex: 1 },
  exArrow: { flexShrink: 0, color: 'var(--accent)', opacity: 0.6 },
};
