import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { listDocuments, queryRAG } from './api';

let msgId = 0;

export default function App() {
  const [docs, setDocs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(null);

  const refreshDocs = useCallback(async () => {
    try { setDocs(await listDocuments()); } catch {}
  }, []);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  async function handleSend(question, mode, topK) {
    const userMsg = { id: ++msgId, role: 'user', content: question };
    const loadingMsg = { id: ++msgId, role: 'assistant', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    const t0 = Date.now();
    try {
      const result = await queryRAG(question, topK, sourceFilter, mode);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id ? { ...m, loading: false, ...result, elapsed } : m
      ));
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
      />
      <div style={s.main}>
        <ChatWindow messages={messages} sourceFilter={sourceFilter} />
        <ChatInput
          onSend={handleSend}
          onClear={() => setMessages([])}
          disabled={loading}
          hasMessages={messages.length > 0}
        />
      </div>
    </div>
  );
}

const s = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
};
