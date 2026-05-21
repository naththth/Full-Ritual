import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { readJson, writeJson } from './storage';

export function useLocalState<T>(key: string, initialValue: T) {
  const [state, setState] = useState<{ key: string; value: T }>(() => ({
    key,
    value: readJson(key, initialValue),
  }));

  useEffect(() => {
    setState({ key, value: readJson(key, initialValue) });
  }, [key]);

  useEffect(() => {
    if (state.key !== key) return;
    writeJson(key, state.value);
  }, [key, state]);

  const setValue: Dispatch<SetStateAction<T>> = (next) => {
    setState((current) => {
      const currentValue = current.key === key ? current.value : readJson(key, initialValue);
      const value = typeof next === 'function'
        ? (next as (previous: T) => T)(currentValue)
        : next;

      return { key, value };
    });
  };

  const value = state.key === key ? state.value : readJson(key, initialValue);
  return [value, setValue] as const;
}
