const THREADS_KEY = 'xean-digital-ai:threads:v1';
const MODEL_KEY = 'xean-digital-ai:model';

export function loadThreads() {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveThreads(threads) {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 100)));
  } catch {
    /* penyimpanan penuh atau diblokir: abaikan */
  }
}

export function loadModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || '';
  } catch {
    return '';
  }
}

export function saveModel(id) {
  try {
    localStorage.setItem(MODEL_KEY, id);
  } catch {
    /* abaikan */
  }
}
