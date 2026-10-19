export function sameSnapshot(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameSnapshot(left[key], right[key]));
}

// One in-flight write per field, with only the latest pending snapshot retained.
export function createDailySaver({ initial, expected, write, isCurrent, onChange }) {
  let acknowledged = initial;
  let baseline = expected;
  let desired = initial;
  let running = null;
  let failure = null;
  let failedValue = null;
  let retryValue = null;
  let stopped = false;
  const dirty = () => !sameSnapshot(acknowledged, desired);
  const notify = () => {
    if (!stopped && isCurrent()) onChange({ dirty: Boolean(running || failure || dirty()), error: failure });
  };
  function pump() {
    if (running || failure || stopped || (!retryValue && !dirty()) || !isCurrent()) return;
    const value = retryValue ? retryValue.value : desired;
    retryValue = null;
    running = Promise.resolve().then(async () => {
      if (stopped || !isCurrent()) return;
      baseline = await write(value, baseline);
      acknowledged = value;
    }).catch((error) => { failure = error; failedValue = { value }; }).finally(() => {
      running = null;
      if (stopped || !isCurrent()) return;
      notify();
      pump();
    });
  }
  return {
    submit(value) { desired = value; pump(); notify(); },
    // Retry the uncertain write first, then the latest snapshot. The server can
    // acknowledge an identical committed write whose response was lost.
    retry() { retryValue = failedValue; failedValue = null; failure = null; pump(); notify(); },
    stop() { stopped = true; },
  };
}
