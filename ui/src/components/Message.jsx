import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

// Renders a single chat exchange: question + answer + citations + chunks
export default function Message({ msg }) {
  const [showChunks, setShowChunks] = useState(false);

  if (msg.role === 'user') {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>{msg.content}</div>
      </div>
    );
  }

  // Assistant message
  if (msg.loading) {
    return (
      <div style={styles.assistantRow}>
        <div style={styles.assistantBubble}>
          <div style={styles.thinking}>
            <span style={styles.dot} />
            <span style={styles.dot} />
            <span style={styles.dot} />
          </div>
        </div>
      </div>
    );
  }

  if (msg.error) {
    return (
      <div style={styles.assistantRow}>
        <div style={{ ...styles.assistantBubble, borderColor: 'var(--red)' }}>
          <p style={{ color: 'var(--red)', fontSize: 14 }}>⚠ {msg.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.assistantRow}>
      <div style={styles.assistantBubble}>

        {/* Answer */}
        <div style={styles.answer} className="answer">
          <ReactMarkdown>{msg.answer}</ReactMarkdown>
        </div>

        {/* Citations */}
        {msg.citations?.length > 0 && (
          <div style={styles.citationsBox}>
            <p style={styles.citLabel}>Sources</p>
            <div style={styles.citList}>
              {msg.citations.map((c, i) => (
                <span key={i} style={styles.citTag}>
                  📄 {c.source} · p.{c.page}
                  <span style={styles.score}>{(c.score * 100).toFixed(0)}%</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Toggle retrieved chunks */}
        {msg.retrieved_chunks?.length > 0 && (
          <div style={styles.chunksSection}>
            <button style={styles.toggleBtn} onClick={() => setShowChunks(v => !v)}>
              {showChunks ? '▲ Hide' : '▼ Show'} retrieved context ({msg.retrieved_chunks.length} chunks)
            </button>
            {showChunks && (
              <div style={styles.chunksList}>
                {msg.retrieved_chunks.map((c, i) => (
                  <div key={i} style={styles.chunk}>
                    <div style={styles.chunkMeta}>
                      {c.source} · page {c.page} · score {c.score.toFixed(4)}
                    </div>
                    <p style={styles.chunkText}>{c.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Model + token info */}
        {msg.model && (
          <p style={styles.modelInfo}>
            {msg.model} · {msg.tokens_used?.input + msg.tokens_used?.output} tokens
          </p>
        )}

      </div>
    </div>
  );
}

const styles = {
  userRow: { display: 'flex', justifyContent: 'flex-end', marginBottom: 16 },
  userBubble: {
    maxWidth: '70%',
    background: 'var(--accent-dim)',
    color: 'var(--text)',
    padding: '10px 14px',
    borderRadius: '14px 14px 2px 14px',
    fontSize: 14,
    lineHeight: 1.6,
  },
  assistantRow: { display: 'flex', justifyContent: 'flex-start', marginBottom: 16 },
  assistantBubble: {
    maxWidth: '85%',
    background: 'var(--bg-panel)',
    border: '1px solid var(--border)',
    padding: '14px 16px',
    borderRadius: '2px 14px 14px 14px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  answer: {
    fontSize: 14,
    lineHeight: 1.7,
    color: 'var(--text)',
  },
  citationsBox: {
    background: 'var(--bg-input)',
    borderRadius: 8,
    padding: '10px 12px',
  },
  citLabel: { fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, letterSpacing: '0.06em' },
  citList: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  citTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '3px 8px',
    fontSize: 12,
    color: 'var(--text)',
  },
  score: {
    background: 'var(--accent-dim)',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 11,
    color: 'var(--accent)',
  },
  chunksSection: { borderTop: '1px solid var(--border)', paddingTop: 10 },
  toggleBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    padding: 0,
  },
  chunksList: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 },
  chunk: {
    background: 'var(--bg-input)',
    borderRadius: 8,
    padding: '10px 12px',
    border: '1px solid var(--border)',
  },
  chunkMeta: { fontSize: 11, color: 'var(--accent)', marginBottom: 4 },
  chunkText: { fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 },
  modelInfo: { fontSize: 11, color: 'var(--text-dim)', marginTop: 2 },
  // Loading dots animation
  thinking: { display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' },
  dot: {
    display: 'block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--text-dim)',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
};
