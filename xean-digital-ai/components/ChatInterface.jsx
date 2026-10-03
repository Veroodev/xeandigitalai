'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import MessageList from './MessageList';
import Composer from './Composer';
import ArtifactViewer from './ArtifactViewer';
import { extractArtifacts, isLargeBlock } from '@/lib/artifacts';
import { streamChat } from '@/lib/stream';
import { loadModel, loadThreads, saveModel, saveThreads } from '@/lib/storage';
import { makeTitle, uid } from '@/lib/utils';
import ModelSelector from './ModelSelector';

export default function ChatInterface() {
  const [threads, setThreads] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [models, setModels] = useState([]);
  const [selection, setSelection] = useState(null);
  const [refreshingModels, setRefreshingModels] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const [artifactRef, setArtifactRef] = useState(null); // { messageId, index }
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const abortRef = useRef(null);
  const autoOpened = useRef(new Set());
  const modelChosen = useRef(false);

  // Muat riwayat dan model terpilih dari localStorage
  useEffect(() => {
    const saved = loadThreads();
    setThreads(saved);
    setActiveId(saved[0]?.id ?? null);
    const savedModel = loadModel();
    if (savedModel) {
      setSelection(savedModel);
      modelChosen.current = true;
    }
    setHydrated(true);
  }, []);

  async function syncModels(force = false) {
    setRefreshingModels(true);
    try {
      const res = await fetch(`/api/models${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Gagal mengambil katalog model.');
      if (!Array.isArray(data.models)) throw new Error('Format katalog model tidak valid.');
      setModels(data.models);
      if (!modelChosen.current) {
        const preferred = data.models.find((m) => m.provider === data.defaultProvider) || data.models[0];
        if (preferred) {
          setSelection({ provider: preferred.provider, id: preferred.id });
          saveModel({ provider: preferred.provider, id: preferred.id });
        }
      }
    } catch (err) {
      if (!force) setError(err?.message || 'Katalog model tidak tersedia.');
    } finally {
      setRefreshingModels(false);
    }
  }

  useEffect(() => {
    if (hydrated) syncModels(false);
  }, [hydrated]);

  // Simpan riwayat (ditunda saat streaming agar tidak menulis setiap token)
  useEffect(() => {
    if (!hydrated) return undefined;
    const t = setTimeout(() => saveThreads(threads), streaming ? 800 : 0);
    return () => clearTimeout(t);
  }, [threads, hydrated, streaming]);

  const activeThread = useMemo(() => threads.find((t) => t.id === activeId) || null, [threads, activeId]);

  const selectedModel = useMemo(() => models.find((m) => m.provider === selection?.provider && m.id === selection?.id) || null, [models, selection]);

  // Artifact yang sedang dibuka, dihitung ulang dari isi pesan agar ikut update saat streaming
  const artifactState = useMemo(() => {
    if (!artifactRef || !activeThread) return null;
    const idx = activeThread.messages.findIndex((m) => m.id === artifactRef.messageId);
    if (idx < 0) return null;
    const msg = activeThread.messages[idx];
    const blocks = extractArtifacts(msg.content).map((b) => ({ ...b, id: `${msg.id}:${b.index}` }));
    if (!blocks.length) return null;
    return {
      messageId: msg.id,
      blocks,
      index: Math.min(artifactRef.index, blocks.length - 1),
      streaming: streaming && idx === activeThread.messages.length - 1,
    };
  }, [artifactRef, activeThread, streaming]);

  const panelOpen = Boolean(artifactState);
  const activeArtifactId = artifactState ? `${artifactState.messageId}:${artifactState.index}` : null;

  // Buka panel otomatis saat AI mulai menulis blok kode yang cukup besar
  useEffect(() => {
    if (!streaming || !activeThread) return;
    const last = activeThread.messages[activeThread.messages.length - 1];
    if (!last || last.role !== 'assistant' || autoOpened.current.has(last.id)) return;
    const idx = extractArtifacts(last.content).findIndex((b) => isLargeBlock(b));
    if (idx >= 0) {
      autoOpened.current.add(last.id);
      setArtifactRef({ messageId: last.id, index: idx });
    }
  }, [activeThread, streaming]);

  // Escape menutup panel
  useEffect(() => {
    if (!panelOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setArtifactRef(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const updateThread = (id, fn) => setThreads((prev) => prev.map((t) => (t.id === id ? fn(t) : t)));

  function stop() {
    abortRef.current?.abort();
  }

  async function handleSend(text) {
    const content = text.trim();
    if (!content || streaming || !selection?.id || !selection?.provider) return;
    setError('');
    if (!selection?.id || !selection?.provider) {
      setError('Pilih model terlebih dahulu.');
      return;
    }

    const userMsg = { id: uid(), role: 'user', content };
    const botMsg = { id: uid(), role: 'assistant', content: '' };

    let threadId = activeId;
    let history;
    const existing = threads.find((t) => t.id === threadId);

    if (existing) {
      history = [...existing.messages, userMsg];
      updateThread(threadId, (t) => ({ ...t, messages: [...t.messages, userMsg, botMsg], updatedAt: Date.now() }));
    } else {
      threadId = uid();
      history = [userMsg];
      const created = { id: threadId, title: makeTitle(content), messages: [userMsg, botMsg], updatedAt: Date.now() };
      setThreads((prev) => [created, ...prev]);
      setActiveId(threadId);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);

    // Gabungkan token dalam jeda singkat agar render tetap ringan
    let pending = '';
    let timer = null;
    const flush = () => {
      timer = null;
      if (!pending) return;
      const chunk = pending;
      pending = '';
      updateThread(threadId, (t) => ({
        ...t,
        messages: t.messages.map((m) => (m.id === botMsg.id ? { ...m, content: m.content + chunk } : m)),
      }));
    };

    try {
      await streamChat({
        messages: history.map(({ role, content: c }) => ({ role, content: c })),
        model: selection?.id,
        provider: selection?.provider,
        modelMeta: selectedModel,
        signal: controller.signal,
        onToken: (tok) => {
          pending += tok;
          if (!timer) timer = setTimeout(flush, 40);
        },
      });
    } catch (err) {
      if (err?.name !== 'AbortError') setError(err?.message || 'Gagal menghubungi server.');
    } finally {
      if (timer) clearTimeout(timer);
      flush();
      // Buang balasan kosong (mis. saat galat atau dibatalkan sebelum token pertama)
      updateThread(threadId, (t) => ({
        ...t,
        messages: t.messages.filter((m) => m.id !== botMsg.id || m.content.trim()),
      }));
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function resetView() {
    stop();
    setArtifactRef(null);
    setSidebarOpen(false);
    setError('');
  }

  function handleNew() {
    resetView();
    setActiveId(null);
  }

  function handleSelect(id) {
    resetView();
    setActiveId(id);
  }

  function handleDelete(id) {
    const target = threads.find((t) => t.id === id);
    if (!target || !window.confirm(`Hapus percakapan "${target.title}"?`)) return;
    if (id === activeId) {
      resetView();
      const next = threads.find((t) => t.id !== id);
      setActiveId(next?.id ?? null);
    }
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }

  function handleModelChange(next) {
    modelChosen.current = true;
    const value = { provider: next.provider, id: next.id };
    setSelection(value);
    saveModel(value);
  }

  const docked = !panelOpen;

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-cream">
      <Sidebar
        threads={threads}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        docked={docked}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b-4 border-black bg-white px-4 py-3">
          <button
            type="button"
            className={`btn px-2 ${docked ? 'lg:hidden' : '2xl:hidden'}`}
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={18} />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-sans text-lg font-black">
            {activeThread?.title ?? 'Percakapan baru'}
          </h1>
          <div className="flex items-center gap-2 text-sm font-bold">
            <span className="sr-only sm:not-sr-only">Model</span>
            <ModelSelector
              models={models}
              selected={selection}
              onChange={handleModelChange}
              onRefresh={() => syncModels(true)}
              refreshing={refreshingModels}
              disabled={streaming}
            />
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-start gap-3 border-2 border-black bg-blaze p-3 text-sm font-bold shadow-brutal-sm"
          >
            <p className="min-w-0 flex-1 break-words">{error}</p>
            <button type="button" className="btn px-1.5 py-1" onClick={() => setError('')} aria-label="Tutup pesan galat">
              <X size={14} />
            </button>
          </div>
        )}

        <MessageList
          messages={activeThread?.messages ?? []}
          streaming={streaming}
          activeArtifactId={activeArtifactId}
          onOpenArtifact={(messageId, index) => setArtifactRef({ messageId, index })}
          onPrompt={handleSend}
        />

        <Composer onSend={handleSend} onStop={stop} streaming={streaming} />
      </section>

      {artifactState && (
        <aside
          className="fixed inset-0 z-50 flex flex-col bg-cream xl:static xl:z-auto xl:w-[52%] xl:max-w-[920px] xl:shrink-0 xl:border-l-4 xl:border-black"
          aria-label="Panel artifact"
        >
          <ArtifactViewer
            artifacts={artifactState.blocks}
            activeIndex={artifactState.index}
            onSelect={(i) => setArtifactRef({ messageId: artifactState.messageId, index: i })}
            onClose={() => setArtifactRef(null)}
            streaming={artifactState.streaming}
          />
        </aside>
      )}
    </div>
  );
}
