import { useEffect, useRef } from 'react';

// Dispara `save` quando `value` muda, com debounce. Não roda no mount inicial.
export function useAutoSave<T>(value: T, save: () => void | Promise<void>, delay = 800) {
  const initial = useRef(true);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    const handle = setTimeout(() => {
      void saveRef.current();
    }, delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay]);
}
