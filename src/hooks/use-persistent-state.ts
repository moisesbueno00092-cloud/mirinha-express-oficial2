
"use client";

import { useState, useEffect, Dispatch, SetStateAction, useCallback } from 'react';

function usePersistentState<T>(key: string, initialState: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialState);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // This effect runs once on mount to read from localStorage.
    if (typeof window !== 'undefined') {
      try {
        const item = window.localStorage.getItem(key);
        if (item && item !== 'undefined' && item !== 'null') {
          setState(JSON.parse(item));
        }
      } catch (error) {
        console.error(`Error reading localStorage key “${key}”:`, error);
      } finally {
        setIsInitialized(true);
      }
    }
  }, [key]);

  useEffect(() => {
    // This effect runs only after initialization and when state changes.
    if (isInitialized) {
      try {
        if (state === undefined || state === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, JSON.stringify(state));
        }
      } catch (error) {
        console.error(`Error setting localStorage key “${key}”:`, error);
      }
    }
  }, [key, state, isInitialized]);

  return [state, setState];
}


export default usePersistentState;
