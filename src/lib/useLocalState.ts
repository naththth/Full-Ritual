import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';

function readLocalState<T>(key: string, initialValue: T) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : initialValue;
  } catch {
    return initialValue;
  }
}

export function useLocalState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: readLocalState(key, initialValue),
  }));

  useEffect(() => {
    setState({ key, value: readLocalState(key, initialValue) });
  }, [key]);

  useEffect(() => {
    if (state.key !== key) return;
    localStorage.setItem(key, JSON.stringify(state.value));
  }, [key, state]);

  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    setState((current) => {
      const currentValue = current.key === key ? current.value : readLocalState(key, initialValue);
      const value = typeof next === 'function'
        ? (next as (previous: T) => T)(currentValue)
        : next;

      return { key, value };
    });
  };

  const value = state.key === key ? state.value : readLocalState(key, initialValue);
  return [value, setValue] as const;
}
