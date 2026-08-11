import { useEffect, useState } from "react";

/**
 * Trails `value` by `delay`, settling once it stops changing. Used to keep preview
 * iframes from reloading (and flashing) on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
