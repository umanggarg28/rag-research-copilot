import { useState, useRef, useEffect } from 'react';

const MODES = [
  { id: 'hybrid',   label: 'Hybrid',   title: 'Combines semantic + keyword search (best quality)' },
  { id: 'semantic', label: 'Semantic',  title: 'Embedding-based meaning search' },
  { id: 'keyword',  label: 'Keyword',   title: 'Exact term matching via BM25' },
];

export default function ChatInput({ onSend, onClear, disabled, hasMessages, pendingQuestion, onPendingConsumed }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState('hybrid');
  const [topK, setTopK] = useState(5);
  const textareaRef = useRef();

  // When a chip is clicked in ChatWindow, populate + send
  useEffect(() => {
    if (pendingQuestion) {
      setText(pendingQuestion);
      onPendingConsumed();
      setTimeout(() => {
        onSend(pendingQuestion, mode, topK);
        setText('');
      }, 0);
    }
  }, [pendingQuestion]); // eslint-disable-line

  // Keyboard shortcut: Cmd+K focuses input
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      if (e.key === 'Escape' && showSettings) {
        setShowSettings(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showSettings]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [text]);

  function submit() {
    const q = text.trim();
    if (!q || disabled) return;
    onSend(q, mode, topK);
    setText('');
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
  }

  const canSend = text.trim().length > 0 && !disabled;
  const charCount = text.length;

  return (
    <div style={s.wrapper}>
      {/* Toolbar: mode pills always visible + settings + clear */}
      <div style={s.toolbar}>
        <div style={s.modeGroup} role="group" aria-label="Search mode">
          {MODES.map(m => (
            <button
              key={m.id}
              style={{ ...s.modeBtn, ...(mode === m.id ? s.modeBtnActive : {}) }}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              title={m.title}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={s.toolbarRight}>
          <button
            style={s.settingsBtn}
            onClick={() => setShowSettings(v => !v)}
            aria-expanded={showSettings}
            aria-label="Toggle advanced settings"
            title="Advanced settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
            </svg>
            <svg style={{ marginLeft: 2, transition: 'transform 0.15s', transform: showSettings ? 'rotate(180deg)' : 'rotate(0deg)' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {hasMessages && (
            <button style={s.clearBtn} onClick={onClear} title="Start a new chat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 16h5v5"/>
              </svg>
              New chat
            </button>
          )}
        </div>
      </div>

      {/* Animated settings panel — always mounted, height-transitioned */}
      <div style={{
        ...s.settings,
        maxHeight: showSettings ? 120 : 0,
        opacity: showSettings ? 1 : 0,
        marginBottom: showSettings ? 10 : 0,
        paddingTop: showSettings ? 12 : 0,
        paddingBottom: showSettings ? 12 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.2s ease, opacity 0.15s ease, margin-bottom 0.2s ease, padding 0.2s ease',
      }}>
        <div style={s.settingRow}>
          <span style={s.settingLabel}>
            Top-K results
            <span style={s.settingValue}> {topK}</span>
          </span>
          <input
            type="range" min={1} max={15} value={topK}
            onChange={e => setTopK(Number(e.target.value))}
            style={s.slider}
            aria-label={`Top K results: ${topK}`}
          />
        </div>
        <p style={s.settingHint}>
          Number of document chunks retrieved before generating an answer.
          Higher = more context, slower response.
        </p>
      </div>

      {/* Input box */}
      <div style={{ ...s.box, ...(focused ? s.boxFocused : {}) }}>
        <textarea
          ref={textareaRef}
          style={s.textarea}
          placeholder="Ask a question about your papers…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          rows={1}
          aria-label="Question input"
        />
        <button
          className="send-btn"
          style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.3, transition: 'all 0.1s ease' }}
          onClick={submit}
          disabled={!canSend}
          aria-label="Send message"
          title="Send (Enter)"
        >
          {disabled ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          )}
        </button>
      </div>

      <div style={s.hintRow}>
        <p style={s.hint}>
          <kbd style={s.kbd}>Enter</kbd> to send ·
          <kbd style={s.kbd}>Shift+Enter</kbd> for newline ·
          <kbd style={s.kbd}>⌘K</kbd> to focus
        </p>
        {charCount > 50 && (
          <span style={{ ...s.charCount, color: charCount > 500 ? 'var(--amber)' : 'var(--text-faint)' }}>
            {charCount}
          </span>
        )}
      </div>
    </div>
  );
}

const s = {
  wrapper: {
    padding: '8px 20px 14px',
    borderTop: 'none',
    boxShadow: '0 -1px 0 rgba(20,20,19,0.07), 0 -8px 24px rgba(20,20,19,0.04)',
    background: 'rgba(250, 249, 245, 0.95)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    position: 'relative',
    zIndex: 10,
  },

  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: 6 },

  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: {
    padding: '4px 12px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: 'var(--bg)',
    border: '1.5px solid var(--accent)',
    color: 'var(--accent)',
  },

  settingsBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, color 0.15s',
  },
  clearBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '4px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontFamily: 'inherit',
    transition: 'border-color 0.15s, color 0.15s',
  },

  settings: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    paddingLeft: 14,
    paddingRight: 14,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  settingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingLabel: { fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 },
  settingValue: { color: 'var(--accent)', fontWeight: 600 },
  slider: { flex: 1, maxWidth: 140, accentColor: 'var(--accent)', cursor: 'pointer' },
  settingHint: { fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.6 },

  box: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-lg)',
    padding: '10px 12px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  boxFocused: {
    borderColor: 'var(--accent)',
    boxShadow: '0 0 0 3px var(--accent-glow)',
  },
  textarea: {
    flex: 1,
    background: 'none',
    border: 'none',
    outline: 'none',
    resize: 'none',
    color: 'var(--text)',
    fontSize: 15,
    lineHeight: 1.65,
    fontFamily: 'inherit',
    minHeight: 26,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    cursor: 'pointer',
  },

  hintRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 },
  hint: { fontSize: 11, color: 'var(--text-faint)' },
  charCount: { fontSize: 11, fontWeight: 500, transition: 'color 0.2s' },
  kbd: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 10,
    fontFamily: 'inherit',
    color: 'var(--text-dim)',
    margin: '0 2px',
  },
};
