export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `sleep`, but a no-op when `ms` is unset -- lets pacing be optional/overridable at every call
 * site without an `if (ms) await sleep(ms)` at each one. */
export function maybeSleep(ms: number | undefined): Promise<void> {
  return ms ? sleep(ms) : Promise.resolve();
}

/** Runs `worker` over `items` with at most `limit` in flight at once, preserving item order in
 * the returned results. Used by the batch import job runner to avoid either running hundreds of
 * downloads fully sequentially (slow) or firing them all at once (hammers the upstream host). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
