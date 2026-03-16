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
    try {
      const data = await listDocuments();
      setDocs(data);
    } catch {
      // backend not ready yet
    }
  }, []);

  // Load documents on mount
  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  async function handleSend(question) {
    // Add user message immediately
    const userMsg = { id: ++msgId, role: 'user', content: question };
    const loadingMsg = { id: ++msgId, role: 'assistant', loading: true };
    setMessages(prev => [...prev, userMsg, loadingMsg]);
    setLoading(true);

    try {
      const result = await queryRAG(question, 5, sourceFilter);
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, loading: false, ...result }
          : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, loading: false, error: err.message }
          : m
      ));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.app}>
      <Sidebar
        docs={docs}
        onDocsChange={refreshDocs}
        sourceFilter={sourceFilter}
        onFilterChange={setSourceFilter}
      />
      <div style={styles.main}>
        <ChatWindow messages={messages} sourceFilter={sourceFilter} />
        <ChatInput onSend={handleSend} disabled={loading} />
      </div>
    </div>
  );
}

const styles = {
  app: { display: 'flex', height: '100vh', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
};
