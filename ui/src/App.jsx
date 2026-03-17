import { useState, useEffect, useCallback } from 'react';
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
  const [loadedSessionId, setLoadedSessionId] = useState(null); // tracks if current msgs came from a saved session
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  );

  const refreshDocs = useCallback(async () => {
    try { setDocs(await listDocuments()); } catch {}
  }, []);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  function saveSession(msgs) {
    const firstQ = msgs.find(m => m.role === 'user')?.content;
    if (!firstQ) return;
    const session = {
      id: Date.now(),
      title: firstQ.slice(0, 55),
      messages: msgs,
      timestamp: new Date().toISOString(),
    };
    const updated = [session, ...sessions].slice(0, 10);
    setSessions(updated);
    localStorage.setItem('rag-sessions', JSON.stringify(updated));
  }

  function handleClear() {
    // Only save if messages aren't already a saved session (no new messages added)
    if (messages.length > 0 && !loadedSessionId) saveSession(messages);
    setMessages([]);
    setLoadedSessionId(null);
  }

  function deleteSession(id) {
    const updated = sessions.filter(s => s.id !== id);
    setSessions(updated);
    localStorage.setItem('rag-sessions', JSON.stringify(updated));
  }

  function loadSession(session) {
    // Only save current messages if they're a new unsaved conversation
    if (messages.length > 0 && !loadedSessionId) saveSession(messages);
    setMessages(session.messages);
    setLoadedSessionId(session.id);
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebar-collapsed', String(next));
  }

  async function handleSend(question, mode, topK) {
    const userMsg    = { id: ++msgId, role: 'user', content: question };
    const loadingMsg = { id: ++msgId, role: 'assistant', loading: true, answer: '' };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoadedSessionId(null); // new message means this is no longer the saved session as-is
    setLoading(true);

    const t0 = Date.now();
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
        // onDone — merge final metadata
        (result) => {
          const elapsed   = ((Date.now() - t0) / 1000).toFixed(1);
          const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          setMessages(prev => prev.map(m =>
            m.id === loadingMsg.id
              ? { ...m, loading: false, ...result, elapsed, timestamp }
              : m
          ));
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
