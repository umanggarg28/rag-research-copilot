import { useEffect, useRef } from 'react';
import Message from './Message';

export default function ChatWindow({ messages, sourceFilter }) {
  const bottomRef = useRef();

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyInner}>
          <p style={styles.emptyIcon}>🔬</p>
          <p style={styles.emptyTitle}>Ask anything about your papers</p>
          <p style={styles.emptyDesc}>
            Upload a PDF using the sidebar, then ask questions.<br />
            Answers are grounded in your documents with citations.
          </p>
          <div style={styles.examples}>
            {[
              'How does multi-head attention work?',
              'What BLEU score was achieved on WMT 2014?',
              'What optimizer and learning rate was used?',
            ].map(q => (
              <span key={q} style={styles.exampleChip}>{q}</span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {sourceFilter && (
        <div style={styles.filterBanner}>
          🔎 Searching only in <strong>{sourceFilter}</strong>
        </div>
      )}
      {messages.map(msg => (
        <Message key={msg.id} msg={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

const styles = {
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
  },
  filterBanner: {
    background: 'var(--bg-input)',
    border: '1px solid var(--accent-dim)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    color: 'var(--text-dim)',
    marginBottom: 16,
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyInner: { maxWidth: 480, textAlign: 'center' },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 20 },
  examples: { display: 'flex', flexDirection: 'column', gap: 8 },
  exampleChip: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 13,
    color: 'var(--text-dim)',
  },
};
