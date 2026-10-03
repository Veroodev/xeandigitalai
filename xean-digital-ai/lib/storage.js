const THREADS_KEY = 'xean-digital-ai:threads:v1';
const MODEL_KEY = 'xean-digital-ai:model:v2';

export function loadThreads() {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function saveThreads(threads) {
  try { localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 100))); } catch {}
}

export function loadModel() {
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.provider) return null;
    return parsed;
  } catch { return null; }
}

export function saveModel(selection) {
  try { localStorage.setItem(MODEL_KEY, JSON.stringify(selection)); } catch {}
}
