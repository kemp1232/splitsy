export type SerialQueue = {
  // Runs `task` after every previously enqueued task has settled. The
  // returned promise settles with the task's own result/rejection.
  enqueue<T>(task: () => Promise<T>): Promise<T>;
  // Resolves once every task enqueued before this call has settled.
  whenIdle(): Promise<void>;
};

const noop = () => {};

// A tiny one-at-a-time task queue. The assignments screen routes every write
// (chip taps, bulk assign, split-mode changes, refreshes) through one of these
// so overlapping setForLineItem calls — an async delete-then-insert on web —
// can never interleave, and writes land in the same order the user made them.
// A failed task never blocks the tasks queued after it.
export function createSerialQueue(): SerialQueue {
  let tail: Promise<void> = Promise.resolve();

  function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(() => task());
    tail = result.then(noop, noop);
    return result;
  }

  return {
    enqueue,
    whenIdle: () => enqueue(async () => {}),
  };
}
