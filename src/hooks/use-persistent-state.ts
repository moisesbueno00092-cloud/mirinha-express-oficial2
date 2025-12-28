
"use client";

import { useState, useEffect, Dispatch, SetStateAction, useCallback } from 'react';

function usePersistentState<T>(key: string, initialState: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    // This function now runs only on initial render on the client.
    // It avoids the need for a separate initialization effect.
    if (typeof window === 'undefined') {
      return initialState;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item && item !== 'undefined') {
        return JSON.parse(item);
      }
      return initialState;
    } catch (error) {
      console.error(`Error reading localStorage key “${key}”:`, error);
      return initialState;
    }
  });

  useEffect(() => {
    // This effect now only handles writing to localStorage when state changes.
    try {
      if (state === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(state));
      }
    } catch (error) {
      console.error(`Error setting localStorage key “${key}”:`, error);
    }
  }, [key, state]);

  return [state, setState];
}

export default usePersistentState;
