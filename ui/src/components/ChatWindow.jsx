import { useEffect, useRef } from 'react';
import Message from './Message';

export default function ChatWindow({ messages, sourceFilter }) {
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyCard}>
          <div style={s.emptyGlow} />
          <div style={s.emptyIcon}>🔬</div>
          <h2 style={s.emptyTitle}>Ask anything about your papers</h2>
          <p style={s.emptyDesc}>
            Upload PDFs via the sidebar. Answers are grounded in your documents with page citations.
          </p>
          <div style={s.examplesLabel}>Try asking</div>
          <div style={s.examples}>
            {[
              { q: 'How does multi-head attention work?',       icon: '🧠' },
              { q: 'What BLEU score was achieved on WMT 2014?', icon: '📊' },
              { q: 'What optimizer and learning rate was used?', icon: '⚙️' },
            ].map(({ q, icon }) => (
              <div key={q} style={s.exChip}>
                <span style={s.exIcon}>{icon}</span>
                <span style={s.exText}>{q}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>
      {sourceFilter && (
        <div style={s.filterBanner}>
          🔎 Searching only in <strong style={{ color: 'var(--accent)' }}>{sourceFilter}</strong>
        </div>
      )}
      {messages.map(msg => (
        <Message key={msg.id} msg={msg} />
      ))}
      <div ref={bottomRef} style={{ height: 1 }} />
    </div>
  );
}

const s = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px 16px',
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
    maxWidth: 500,
    textAlign: 'center',
    position: 'relative',
  },
  emptyGlow: {
    position: 'absolute',
    top: -60,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 300,
    height: 300,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(108,143,255,0.07) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  emptyIcon: { fontSize: 44, marginBottom: 16, display: 'block' },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 10 },
  emptyDesc: { fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 28 },
  examplesLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text-faint)',
    letterSpacing: '0.08em',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  examples: { display: 'flex', flexDirection: 'column', gap: 8 },
  exChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderLeft: '3px solid var(--accent-dim)',
    borderRadius: 'var(--r-md)',
    padding: '10px 14px',
    textAlign: 'left',
    cursor: 'default',
  },
  exIcon: { fontSize: 16, flexShrink: 0 },
  exText: { fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.5 },
};
