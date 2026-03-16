import { useState, useRef, useEffect } from 'react';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef();

  // Auto-resize textarea as user types
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [text]);

  function submit() {
    const q = text.trim();
    if (!q || disabled) return;
    onSend(q);
    setText('');
  }

  function handleKey(e) {
    // Enter sends, Shift+Enter adds newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.box}>
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          placeholder="Ask a question about your papers…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
          rows={1}
        />
        <button style={{ ...styles.sendBtn, opacity: text.trim() && !disabled ? 1 : 0.4 }} onClick={submit} disabled={!text.trim() || disabled}>
          {disabled ? '⏳' : '↑'}
        </button>
      </div>
      <p style={styles.hint}>Enter to send · Shift+Enter for newline</p>
    </div>
  );
}

const styles = {
  wrapper: { padding: '12px 20px 16px', borderTop: '1px solid var(--border)' },
  box: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '10px 12px',
  },
  textarea: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    resize: 'none',
    color: 'var(--text)',
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: 'inherit',
    minHeight: 24,
  },
  sendBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 0.15s',
  },
  hint: { fontSize: 11, color: 'var(--text-dim)', marginTop: 6, textAlign: 'center' },
};
