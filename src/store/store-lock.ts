let pending: Promise<void> = Promise.resolve();

/**
 * Runs storage tasks one at a time. A later task starts only after the earlier
 * one finishes, including when the earlier one throws.
 */
export function enqueueStoreTask<T>(task: () => Promise<T>): Promise<T> {
  const run = pending.then(task, task);
  pending = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
