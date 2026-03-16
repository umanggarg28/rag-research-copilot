import { useState, useRef, useEffect } from 'react';

const MODES = ['hybrid', 'semantic', 'keyword'];

export default function ChatInput({ onSend, onClear, disabled, hasMessages }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mode, setMode] = useState('hybrid');
  const [topK, setTopK] = useState(5);
  const textareaRef = useRef();

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

  return (
    <div style={s.wrapper}>

      {/* Settings bar */}
      <div style={s.toolbar}>
        <button style={s.settingsBtn} onClick={() => setShowSettings(v => !v)}>
          ⚙ Settings
          <span style={{ ...s.modeBadge, marginLeft: 6 }}>{mode}</span>
        </button>
        {hasMessages && (
          <button style={s.clearBtn} onClick={onClear}>
            ↺ New chat
          </button>
        )}
      </div>

      {/* Expandable settings */}
      {showSettings && (
        <div style={s.settings}>
          <div style={s.settingRow}>
            <span style={s.settingLabel}>Search mode</span>
            <div style={s.modeGroup}>
              {MODES.map(m => (
                <button
                  key={m}
                  style={{ ...s.modeBtn, ...(mode === m ? s.modeBtnActive : {}) }}
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div style={s.settingRow}>
            <span style={s.settingLabel}>Top-K results <span style={s.settingValue}>{topK}</span></span>
            <input
              type="range" min={1} max={15} value={topK}
              onChange={e => setTopK(Number(e.target.value))}
              style={s.slider}
            />
          </div>
          <p style={s.settingHint}>
            <strong>Hybrid</strong>: combines semantic + keyword (best) ·
            <strong> Semantic</strong>: meaning-based ·
            <strong> Keyword</strong>: exact term match (BM25)
          </p>
        </div>
      )}

      {/* Input box */}
      <div style={{
        ...s.box,
        ...(focused ? s.boxFocused : {}),
      }}>
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
        />
        <button
          style={{ ...s.sendBtn, opacity: canSend ? 1 : 0.35, cursor: canSend ? 'pointer' : 'default' }}
          onClick={submit}
          disabled={!canSend}
          title="Send message (Enter)"
        >
          {disabled ? '⏳' : '↑'}
        </button>
      </div>
      <p style={s.hint}>Enter to send · Shift+Enter for newline</p>
    </div>
  );
}

const s = {
  wrapper: { padding: '8px 20px 14px', borderTop: '1px solid var(--border)' },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingsBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-dim)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '3px 0',
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'inherit',
  },
  modeBadge: {
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 20,
    padding: '1px 7px',
    fontSize: 11,
    color: 'var(--accent)',
    fontWeight: 600,
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-faint)',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  settings: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    padding: '12px 14px',
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  settingRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingLabel: { fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 },
  settingValue: { color: 'var(--accent)', fontWeight: 600 },
  modeGroup: { display: 'flex', gap: 4 },
  modeBtn: {
    padding: '3px 10px',
    borderRadius: 20,
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text-dim)',
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 500,
    transition: 'all 0.15s',
  },
  modeBtnActive: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent-border)',
    color: '#fff',
  },
  slider: { flex: 1, maxWidth: 120, accentColor: 'var(--accent)', cursor: 'pointer' },
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
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: 'inherit',
    minHeight: 24,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 'var(--r-md)',
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    flexShrink: 0,
    transition: 'opacity 0.15s',
    boxShadow: '0 2px 8px rgba(108,143,255,0.3)',
  },
  hint: { fontSize: 11, color: 'var(--text-faint)', marginTop: 6, textAlign: 'center' },
};
