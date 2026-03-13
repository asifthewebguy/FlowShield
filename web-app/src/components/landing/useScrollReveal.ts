'use client';
import { useEffect, useRef, useState } from 'react';

export function useScrollReveal(threshold = 0.15) {
  const ref = useRef<HTMLElement>(null);
  // Start as visible (SSR-safe, prevents blank sections on full-page render)
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Opt-in to animation by marking element as "will-animate" after hydration.
    // Calling setIsVisible(false) here syncs React state with the DOM animation state;
    // it's intentional and not a cascading update.
    el.classList.add('will-animate');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsVisible(false);

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, isVisible };
}
