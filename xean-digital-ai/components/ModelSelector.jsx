'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, RefreshCw, Search, Sparkles, Wrench, Eye, Brain } from 'lucide-react';

const FILTERS = [
  ['all', 'Semua'],
  ['free', 'Gratis'],
  ['paid', 'Berbayar'],
  ['premium', 'Premium'],
  ['vision', 'Vision'],
  ['reasoning', 'Reasoning'],
  ['tools', 'Tools'],
  ['coding', 'Coding'],
  ['long_context', 'Long Context'],
];

function formatContext(value) {
  if (!Number.isFinite(value)) return 'Context tidak diketahui';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M context`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K context`;
  return `${value} context`;
}

function metaText(model) {
  const parts = [];
  if (model.accessTier) parts.push(model.accessTier);
  if (model.contextLength) parts.push(formatContext(model.contextLength));
  return parts.join(' • ') || 'Metadata terbatas';
}

export default function ModelSelector({ models, selected, onChange, onRefresh, refreshing, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const availableFilters = useMemo(() => FILTERS.filter(([key]) => {
    if (key === 'all') return true;
    if (['free', 'paid', 'premium'].includes(key)) return models.some((m) => m.accessTier === key);
    if (key === 'long_context') return models.some((m) => m.capabilities?.long_context === true);
    return models.some((m) => m.capabilities?.[key] === true);
  }), [models]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models.filter((m) => {
      if (filter === 'free' || filter === 'paid' || filter === 'premium') {
        if (m.accessTier !== filter) return false;
      } else if (filter !== 'all' && m.capabilities?.[filter] !== true) return false;
      if (!q) return true;
      return [m.name, m.id, m.provider, m.vendor, m.ownedBy, m.accessTier, m.contextLength, ...(Object.keys(m.capabilities || {}))]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [models, query, filter]);

  const selectedModel = models.find((m) => m.provider === selected?.provider && m.id === selected?.id) || null;

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 max-w-[min(78vw,28rem)] items-center gap-2 border-2 border-black bg-aqua px-2 py-1.5 font-mono text-xs font-bold shadow-brutal-sm disabled:opacity-50"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate text-left">{selectedModel?.name || selected?.id || 'Pilih model'}</span>
        <ChevronDown size={15} className="shrink-0" />
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Tutup pemilih model" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-[min(92vw,30rem)] overflow-hidden border-4 border-black bg-cream shadow-brutal-lg">
            <div className="border-b-4 border-black bg-white p-3">
              {selectedModel && (
                <div className="mb-3 border-2 border-black bg-aqua p-3 shadow-brutal-sm">
                  <div className="font-sans text-sm font-black">{selectedModel.name}</div>
                  <div className="mt-1 break-all font-mono text-[10px]">{selectedModel.id}</div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] font-bold sm:grid-cols-4">
                    <span>Provider: {selectedModel.provider}</span>
                    <span>Tier: {selectedModel.accessTier || '—'}</span>
                    <span>Context: {formatContext(selectedModel.contextLength)}</span>
                    <span>Output: {selectedModel.maxOutputTokens ? selectedModel.maxOutputTokens.toLocaleString() : '—'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-black">
                    {selectedModel.capabilities?.vision === true && <span className="border border-black bg-white px-1">Vision</span>}
                    {selectedModel.capabilities?.tools === true && <span className="border border-black bg-white px-1">Tools</span>}
                    {selectedModel.capabilities?.reasoning === true && <span className="border border-black bg-white px-1">Reasoning</span>}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <label className="flex min-w-0 flex-1 items-center gap-2 border-2 border-black bg-white px-3 py-2 shadow-brutal-sm">
                  <Search size={16} />
                  <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama, ID, vendor, capability..." className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none" />
                </label>
                <button type="button" className="btn btn-sm" onClick={onRefresh} disabled={refreshing} title="Sync Models">
                  <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {availableFilters.map(([key, label]) => (
                  <button key={key} type="button" onClick={() => setFilter(key)} className={`shrink-0 border-2 border-black px-2 py-1 text-xs font-black ${filter === key ? 'bg-black text-white' : 'bg-white'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
              {filtered.length === 0 && <p className="p-4 text-sm font-bold">Model tidak ditemukan.</p>}
              {filtered.map((m) => {
                const active = selected?.provider === m.provider && selected?.id === m.id;
                return (
                  <button key={`${m.provider}:${m.id}`} type="button" role="option" aria-selected={active} onClick={() => { onChange(m); setOpen(false); }} className={`mb-2 w-full border-2 border-black p-3 text-left ${active ? 'bg-black text-white' : 'bg-white hover:bg-lemon'}`}>
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-sans text-sm font-black">
                          {m.name}
                          {m.capabilities?.vision && <Eye size={13} />}
                          {m.capabilities?.reasoning && <Brain size={13} />}
                          {m.capabilities?.tools && <Wrench size={13} />}
                        </div>
                        <div className="mt-1 break-all font-mono text-[10px] opacity-80">{m.id}</div>
                        <div className="mt-2 text-[11px] font-bold">{metaText(m)}</div>
                      </div>
                      <Sparkles size={15} className="shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
