import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { listDocuments, queryRAGStream } from './api';

let msgId = 0;

function loadSessions() {
  try { return JSON.parse(localStorage.getItem('rag-sessions') || '[]'); } catch { return []; }
}

export default function App() {
  const [docs, setDocs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(null);
  const [pendingQuestion, setPendingQuestion] = useState(null);
  const [sessions, setSessions] = useState(loadSessions);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );
  const [theme, setTheme] = useState(
    () => localStorage.getItem('theme') ?? 'light'
  );

  // Stable ref for the current session ID — survives re-renders without causing them.
  // Set when the first message is sent (new convo) or when a session is loaded.
  const sessionIdRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'light' ? 'dark' : 'light');
  }

  const refreshDocs = useCallback(async () => {
    try { setDocs(await listDocuments()); } catch {}
  }, []);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  /**
   * Upsert a session in localStorage. Updates the existing entry if the session
   * ID already exists, otherwise prepends a new one (capped at 10 sessions).
   */
  function persistSession(msgs, sessionId) {
    const firstQ = msgs.find(m => m.role === 'user')?.content;
    if (!firstQ || !sessionId) return;

    const session = {
      id: sessionId,
      title: firstQ.slice(0, 55),
      messages: msgs,
      timestamp: new Date().toISOString(),
    };

    setSessions(prev => {
      const exists = prev.some(s => s.id === sessionId);
      const updated = exists
        ? prev.map(s => s.id === sessionId ? session : s)
        : [session, ...prev].slice(0, 10);
      localStorage.setItem('rag-sessions', JSON.stringify(updated));
      return updated;
    });
  }

  function handleClear() {
    if (messages.length > 0) persistSession(messages, sessionIdRef.current);
    setMessages([]);
    sessionIdRef.current = null;
  }

  function deleteSession(id) {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    localStorage.setItem('rag-sessions', JSON.stringify(updated));
  }

  function loadSession(session) {
    if (messages.length > 0) persistSession(messages, sessionIdRef.current);
    setMessages(session.messages);
    sessionIdRef.current = session.id;
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  }

  async function handleSend(question, mode, topK) {
    // Assign a session ID the first time a message is sent in this conversation
    if (!sessionIdRef.current) {
      sessionIdRef.current = Date.now();
    }

    const userMsg    = { id: ++msgId, role: 'user', content: question };
    const loadingMsg = { id: ++msgId, role: 'assistant', loading: true, answer: '' };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    const t0 = Date.now();
    const sid = sessionIdRef.current;

    try {
      await queryRAGStream(
        question, topK, sourceFilter, mode,
        // onToken — accumulate streamed text
        (token) => {
          setMessages(prev => prev.map(m =>
            m.id === loadingMsg.id
              ? { ...m, answer: (m.answer || '') + token }
              : m
          ));
        },
        // onDone — merge final metadata then auto-save
        (result) => {
          const elapsed   = ((Date.now() - t0) / 1000).toFixed(1);
          const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          setMessages(prev => {
            const updated = prev.map(m =>
              m.id === loadingMsg.id
                ? { ...m, loading: false, ...result, elapsed, timestamp }
                : m
            );
            // Auto-save every time a response completes so a page refresh
            // never loses the conversation.
            persistSession(updated, sid);
            return updated;
          });
        },
      );
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id ? { ...m, loading: false, error: err.message } : m
      ));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.app}>
      <Sidebar
        docs={docs}
        onDocsChange={refreshDocs}
        sourceFilter={sourceFilter}
        onFilterChange={setSourceFilter}
        sessions={sessions}
        onLoadSession={loadSession}
        onDeleteSession={deleteSession}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      <div style={s.main}>
        <ChatWindow
          messages={messages}
          sourceFilter={sourceFilter}
          onChipClick={q => setPendingQuestion(q)}
        />
        <ChatInput
          onSend={handleSend}
          onClear={handleClear}
          disabled={loading}
          hasMessages={messages.length > 0}
          pendingQuestion={pendingQuestion}
          onPendingConsumed={() => setPendingQuestion(null)}
        />
      </div>
    </div>
  );
}

const s = {
  app:  { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 },
};
