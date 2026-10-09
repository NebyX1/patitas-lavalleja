import { useEffect, useState } from 'react';
import { initializeClientState } from './store';

export function useClientState() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    initializeClientState();
    setReady(true);
  }, []);
  return ready;
}
