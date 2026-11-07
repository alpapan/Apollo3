import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { createBatcher } from './createBatcher'

describe('createBatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('hands every item added within the window to one flush, in order', () => {
    const flushed: number[][] = []
    const batcher = createBatcher<number>((items) => flushed.push(items), 100)
    for (let i = 0; i < 195; i++) {
      batcher.add(i)
      jest.advanceTimersByTime(0)
    }
    expect(flushed).toEqual([])
    jest.advanceTimersByTime(100)
    expect(flushed).toHaveLength(1)
    expect(flushed[0]).toEqual(Array.from({ length: 195 }, (_, i) => i))
  })

  it('starts a new batch for items added after a flush', () => {
    const flushed: string[][] = []
    const batcher = createBatcher<string>((items) => flushed.push(items), 100)
    batcher.add('a')
    jest.advanceTimersByTime(100)
    batcher.add('b')
    batcher.add('c')
    jest.advanceTimersByTime(100)
    expect(flushed).toEqual([['a'], ['b', 'c']])
  })

  it('does not flush when no item arrives', () => {
    const flushed: number[][] = []
    createBatcher<number>((items) => flushed.push(items), 100)
    jest.advanceTimersByTime(1000)
    expect(flushed).toEqual([])
  })
})
