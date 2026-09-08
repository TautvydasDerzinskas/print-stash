import { useEffect, useRef } from "react";

/** Returns a ref to attach to a sentinel element near the end of a list -- once it scrolls into
 *  view, `onLoadMore` fires automatically, no click needed. `rootMargin` starts the fetch a bit
 *  before the sentinel is actually on screen so the next page is usually ready before the user
 *  reaches the bottom. Re-arms itself after every load (a fresh IntersectionObserver per
 *  dependency change), so scrolling straight through several pages keeps paging in. */
export function useInfiniteScroll(onLoadMore: () => void, hasMore: boolean, loading: boolean) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, loading]);

  return sentinelRef;
}
