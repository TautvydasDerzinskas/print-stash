import React from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

type LogEntry = { key: string; pathname: string };

type NavigationHistoryValue = {
  /** Retraces history like `navigate(-1)`, but first skips over any run of consecutive entries
   *  that share the current page's pathname (only the search string differs -- e.g. a sort-tab
   *  change on a list page pushes a new entry for the same route) so one click always actually
   *  leaves the page instead of landing back on what looks like the exact same screen. */
  goBack: () => void;
};

const NavigationHistoryContext = React.createContext<NavigationHistoryValue | null>(null);

/** Tracks the SPA's own navigation log (keyed by react-router's per-location `key`, which stays
 *  stable across a real POP back/forward too) so `goBack` can look at what pathname actually
 *  precedes the current one -- something the browser History API doesn't expose directly. Mount
 *  once, near the app root and inside the Router, so every route change is observed. */
export function NavigationHistoryProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const logRef = React.useRef<LogEntry[]>([]);
  const posRef = React.useRef(-1);

  React.useEffect(() => {
    const log = logRef.current;
    const entry: LogEntry = { key: location.key, pathname: location.pathname };
    if (navigationType === "PUSH") {
      log.splice(posRef.current + 1);
      log.push(entry);
      posRef.current = log.length - 1;
    } else if (navigationType === "REPLACE") {
      if (posRef.current >= 0) log[posRef.current] = entry;
      else {
        log.push(entry);
        posRef.current = 0;
      }
    } else {
      // POP -- either the browser's own back/forward button, or a `navigate(-n)` call this
      // provider made itself. Either way the target entry was already logged earlier, so find it
      // by key rather than assuming a single-step move.
      const idx = log.findIndex((e) => e.key === entry.key);
      if (idx !== -1) {
        posRef.current = idx;
      } else {
        log.length = 0;
        log.push(entry);
        posRef.current = 0;
      }
    }
  }, [location.key, location.pathname, navigationType]);

  const goBack = React.useCallback(() => {
    const log = logRef.current;
    const pos = posRef.current;
    if (pos <= 0) {
      navigate("/");
      return;
    }
    const currentPathname = log[pos].pathname;
    let steps = 1;
    while (pos - steps > 0 && log[pos - steps].pathname === currentPathname) {
      steps += 1;
    }
    navigate(-steps);
  }, [navigate]);

  const value = React.useMemo(() => ({ goBack }), [goBack]);

  return <NavigationHistoryContext.Provider value={value}>{children}</NavigationHistoryContext.Provider>;
}

/** `goBack()` in place of `navigate(-1)` for any "top bar back arrow" style control -- see
 *  NavigationHistoryProvider's doc comment for why a plain `navigate(-1)` isn't always enough. */
export function useSmartBack(): () => void {
  const ctx = React.useContext(NavigationHistoryContext);
  if (!ctx) throw new Error("useSmartBack must be used within a NavigationHistoryProvider");
  return ctx.goBack;
}
