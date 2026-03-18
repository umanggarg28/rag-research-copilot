import { useEffect, useRef } from 'react';
import Message from './Message';

export default function ChatWindow({ messages, sourceFilter, onChipClick }) {
  const bottomRef = useRef();
  const scrollRef = useRef();

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    const isStreaming = lastMsg?.loading;

    if (isStreaming) {
      // While streaming: only stay pinned if user hasn't scrolled up.
      // "Near bottom" = within 120px of the bottom edge.
      const el = scrollRef.current;
      if (el) {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (distFromBottom > 120) return; // user scrolled up — respect it
      }
      bottomRef.current?.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    } else {
      // New message added — always smooth-scroll to show it
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={s.empty}>
        <div style={s.emptyCard}>
          {/* Anthropic-style diamond mark */}
          <div style={s.orbWrap}>
            <svg width="40" height="40" viewBox="0 0 80 80" fill="none" aria-hidden="true">
              <path d="M40 4L47 33L76 40L47 47L40 76L33 47L4 40L33 33Z" fill="var(--accent)" opacity="0.9"/>
            </svg>
          </div>
          <h2 style={s.emptyTitle}>How can I help you today?</h2>
          <p style={s.emptyDesc}>
            Upload a research paper to get grounded answers with page-level citations.
          </p>
          <div style={s.examples}>
            {[
              'How does multi-head attention work?',
              'What BLEU score was achieved on WMT 2014?',
              'What optimizer and learning rate was used?',
            ].map(q => (
              <button
                key={q}
                className="ex-chip"
                style={s.exChip}
                onClick={() => onChipClick(q)}
                aria-label={`Ask: ${q}`}
              >
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
    <div ref={scrollRef} style={s.scrollOuter} role="log" aria-live="polite" aria-label="Chat messages">
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
    minHeight: 0,
    overflowY: 'auto',
    padding: '0 0 80px 0',
  },
  container: {
    maxWidth: 768,
    margin: '0 auto',
    width: '100%',
    padding: '24px 28px 0',
    display: 'flex',
    flexDirection: 'column',
  },
  filterBanner: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
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
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 28px',
  },
  emptyCard: {
    maxWidth: 500,
    width: '100%',
    textAlign: 'center',
  },
  orbWrap: {
    width: 48,
    height: 48,
    margin: '0 auto 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 28, fontWeight: 400, color: 'var(--text)', marginBottom: 14, fontFamily: '"Anthropic Serif", Georgia, serif', letterSpacing: '-0.02em' },
  emptyDesc: { fontSize: 15, color: 'var(--text-faint)', lineHeight: 1.6, marginBottom: 28, maxWidth: '38ch', margin: '0 auto 28px' },
  examples: { display: 'flex', flexDirection: 'column', gap: 8 },
  exChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '11px 16px',
    textAlign: 'left',
    cursor: 'pointer',
    width: '100%',
    fontFamily: 'inherit',
    transition: 'background 0.12s, border-color 0.12s',
  },
  exText: { fontSize: 14, color: 'var(--text)', lineHeight: 1.5, flex: 1 },
  exArrow: { flexShrink: 0, color: 'var(--text-faint)', opacity: 0.5 },
};
