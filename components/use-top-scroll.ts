'use client';

import { useEffect, useState } from 'react';

// Passing cards during a top animation must not start a new wave of downloads.
export function useTopScroll() {
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      clearTimeout(timer);
      setRunning(false);
    };
    const start = () => {
      setRunning(true);
      clearTimeout(timer);
      timer = setTimeout(stop, 3000);
    };
    const scroll = () => {
      if (window.scrollY <= 8) stop();
    };
    window.addEventListener('questkeeps:scroll-to-top', start);
    window.addEventListener('scroll', scroll, { passive: true });
    window.addEventListener('scrollend', stop);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    window.addEventListener('keydown', stop);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('questkeeps:scroll-to-top', start);
      window.removeEventListener('scroll', scroll);
      window.removeEventListener('scrollend', stop);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
      window.removeEventListener('keydown', stop);
    };
  }, []);
  return running;
}
