/**
 * Collects items and hands them to `flush` together, once `delayMs` after the
 * first item of a batch arrives. Items keep their arrival order.
 */
export function createBatcher<T>(
  flush: (items: T[]) => void,
  delayMs: number,
) {
  let pending: T[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  function run() {
    timer = undefined
    const items = pending
    pending = []
    flush(items)
  }
  return {
    add(item: T) {
      pending.push(item)
      timer ??= setTimeout(run, delayMs)
    },
  }
}
