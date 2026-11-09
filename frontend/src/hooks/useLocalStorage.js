import { useState, useCallback, useRef } from 'react';

/**
 * useLocalStorage — state backed by localStorage.
 * @param {string} key
 * @param {*} initialValue
 */
export function useLocalStorage(key, initialValue) {
  const initialValueRef = useRef(initialValue);

  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValueRef.current;
    } catch {
      return initialValueRef.current;
    }
  });

  const setValue = useCallback(
    (value) => {
      try {
        setStoredValue((prev) => {
          const valueToStore = value instanceof Function ? value(prev) : value;
          localStorage.setItem(key, JSON.stringify(valueToStore));
          return valueToStore;
        });
      } catch (err) {
        console.error('useLocalStorage error:', err);
      }
    },
    [key]
  );

  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch (err) {
      console.error('useLocalStorage remove error:', err);
    }
    setStoredValue(initialValueRef.current);
  }, [key]);

  return [storedValue, setValue, removeValue];
}
