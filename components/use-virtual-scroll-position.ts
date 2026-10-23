'use client';

import { useLayoutEffect } from 'react';

export function useVirtualScrollPosition(baseRow: number) {
  useLayoutEffect(() => {
    const notify = () =>
      window.dispatchEvent(new Event('questkeeps:virtual-scroll'));
    notify();
    // Also update controls after the virtual list is removed or reset.
    return () => {
      notify();
    };
  }, [baseRow]);
}
