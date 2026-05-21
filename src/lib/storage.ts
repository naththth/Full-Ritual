export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.warn(`[Full Ritual] Nao foi possivel ler ${key} do armazenamento local.`, error);
    return fallback;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`[Full Ritual] Nao foi possivel salvar ${key} no armazenamento local.`, error);
    notifyStorageError();
    return false;
  }
}

export const safeStringStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[Full Ritual] Nao foi possivel ler ${key} do armazenamento local.`, error);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[Full Ritual] Nao foi possivel salvar ${key} no armazenamento local.`, error);
      notifyStorageError();
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[Full Ritual] Nao foi possivel remover ${key} do armazenamento local.`, error);
    }
  },
};

function notifyStorageError() {
  window.dispatchEvent(new CustomEvent('full-ritual:storage-error'));
}
