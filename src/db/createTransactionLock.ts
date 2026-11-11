export type TransactionLock = {
  // Runs `task` once every task started before it has settled; resolves or
  // rejects with the task's own result. A failing task still releases the
  // lock for the next one.
  run<T>(task: () => Promise<T>): Promise<T>;
};

const noop = () => {};

// A promise-chain mutex for the web database's transactions (client.web.ts).
// drizzle-orm/sqlite-proxy runs every transaction as BEGIN … COMMIT on the one
// shared connection, so two transactions started at once interleave and the
// second BEGIN fails ("cannot start a transaction within a transaction") while
// the first still commits — the half-applied "split equally" bug. Serializing
// them here fixes that for every caller. Nested transactions are unaffected:
// they go through the outer `tx` object (savepoints), never back through the
// locked db.transaction, so they can't deadlock.
export function createTransactionLock(): TransactionLock {
  let tail: Promise<void> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task);
      tail = result.then(noop, noop);
      return result;
    },
  };
}
