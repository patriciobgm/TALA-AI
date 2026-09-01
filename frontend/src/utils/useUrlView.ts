import { useCallback, useEffect, useState } from "react";

export function useUrlView<T extends string>(
  allowed: readonly T[],
  fallback: T,
  parameter = "view",
) {
  const read = useCallback(() => {
    const requested = new URLSearchParams(window.location.search).get(parameter);
    return allowed.includes(requested as T) ? (requested as T) : fallback;
  }, [allowed, fallback, parameter]);
  const [value, setValueState] = useState<T>(read);

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(parameter);
      else url.searchParams.set(parameter, next);
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    },
    [fallback, parameter],
  );

  useEffect(() => {
    const restore = () => setValueState(read());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [read]);

  return [value, setValue] as const;
}
