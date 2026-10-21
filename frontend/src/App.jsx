import AskPanel from './components/AskPanel.jsx';
import IngestForm from './components/IngestForm.jsx';
import ItemList from './components/ItemList.jsx';
import { useItems } from './hooks/useItems.js';
import { useRuntimeInfo } from './hooks/useRuntimeInfo.js';

export default function App() {
  const { items, loading, error, addItem, removeItem } = useItems();
  const runtime = useRuntimeInfo();
  const readyCount = items.filter((item) => item.status === 'ready').length;

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Your personal knowledge workspace</p>
          <h1>AI Knowledge Inbox</h1>
          <p className="subtitle">Save useful notes and web pages, then ask questions across everything you keep.</p>
        </div>
        <p className="runtime">
          {runtime
            ? `Embeddings: ${runtime.embeddingModel} · Answers: ${runtime.answerMode === 'llm' ? runtime.chatModel : 'extractive (no LLM)'}`
            : 'API not reachable yet'}
        </p>
      </header>

      <main className="layout">
        <IngestForm onSubmit={addItem} />
        <AskPanel readyCount={readyCount} />
        <ItemList items={items} loading={loading} error={error} onDelete={removeItem} />
      </main>
    </div>
  );
}
