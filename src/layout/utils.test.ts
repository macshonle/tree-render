import { describe, it, expect } from 'vitest'
import {
  translateBounds,
  mergeBounds,
  nodeBounds,
  calculateChildrenTotalWidth,
} from './utils'
import type { SubtreeBounds } from './types'

describe('translateBounds', () => {
  it('translates bounds by positive offsets', () => {
    const bounds: SubtreeBounds = { left: -10, right: 10, top: -5, bottom: 5 }
    const result = translateBounds(bounds, 20, 30)
    expect(result).toEqual({ left: 10, right: 30, top: 25, bottom: 35 })
  })

  it('translates bounds by negative offsets', () => {
    const bounds: SubtreeBounds = { left: 0, right: 100, top: 0, bottom: 50 }
    const result = translateBounds(bounds, -25, -10)
    expect(result).toEqual({ left: -25, right: 75, top: -10, bottom: 40 })
  })

  it('translates bounds by zero offsets', () => {
    const bounds: SubtreeBounds = { left: -5, right: 5, top: -5, bottom: 5 }
    const result = translateBounds(bounds, 0, 0)
    expect(result).toEqual({ left: -5, right: 5, top: -5, bottom: 5 })
  })

  it('does not mutate the original bounds', () => {
    const original: SubtreeBounds = { left: 0, right: 10, top: 0, bottom: 10 }
    translateBounds(original, 50, 50)
    expect(original).toEqual({ left: 0, right: 10, top: 0, bottom: 10 })
  })
})

describe('mergeBounds', () => {
  it('returns zero bounds for empty list', () => {
    const result = mergeBounds([])
    expect(result).toEqual({ left: 0, right: 0, top: 0, bottom: 0 })
  })

  it('returns same bounds for single item', () => {
    const bounds: SubtreeBounds = { left: -20, right: 20, top: -10, bottom: 10 }
    const result = mergeBounds([bounds])
    expect(result).toEqual({ left: -20, right: 20, top: -10, bottom: 10 })
  })

  it('merges non-overlapping bounds', () => {
    const bounds1: SubtreeBounds = { left: 0, right: 10, top: 0, bottom: 10 }
    const bounds2: SubtreeBounds = { left: 20, right: 30, top: 20, bottom: 30 }
    const result = mergeBounds([bounds1, bounds2])
    expect(result).toEqual({ left: 0, right: 30, top: 0, bottom: 30 })
  })

  it('merges overlapping bounds', () => {
    const bounds1: SubtreeBounds = { left: 0, right: 20, top: 0, bottom: 20 }
    const bounds2: SubtreeBounds = { left: 10, right: 30, top: 10, bottom: 30 }
    const result = mergeBounds([bounds1, bounds2])
    expect(result).toEqual({ left: 0, right: 30, top: 0, bottom: 30 })
  })

  it('merges bounds with negative coordinates', () => {
    const bounds1: SubtreeBounds = { left: -50, right: -10, top: -50, bottom: -10 }
    const bounds2: SubtreeBounds = { left: 10, right: 50, top: 10, bottom: 50 }
    const result = mergeBounds([bounds1, bounds2])
    expect(result).toEqual({ left: -50, right: 50, top: -50, bottom: 50 })
  })

  it('merges multiple bounds correctly', () => {
    const bounds = [
      { left: 0, right: 10, top: 0, bottom: 10 },
      { left: -5, right: 5, top: -5, bottom: 5 },
      { left: 15, right: 25, top: 5, bottom: 15 },
    ]
    const result = mergeBounds(bounds)
    expect(result).toEqual({ left: -5, right: 25, top: -5, bottom: 15 })
  })
})

describe('nodeBounds', () => {
  it('creates centered bounds for given dimensions', () => {
    const result = nodeBounds(100, 50)
    expect(result).toEqual({ left: -50, right: 50, top: -25, bottom: 25 })
  })

  it('creates centered bounds for square', () => {
    const result = nodeBounds(40, 40)
    expect(result).toEqual({ left: -20, right: 20, top: -20, bottom: 20 })
  })

  it('creates centered bounds for zero dimensions', () => {
    const result = nodeBounds(0, 0)
    // Note: -0/2 = -0 in JavaScript, but -0 == 0 is true
    // Using == to avoid Object.is distinction between -0 and 0
    expect(result.left == 0).toBe(true)
    expect(result.right == 0).toBe(true)
    expect(result.top == 0).toBe(true)
    expect(result.bottom == 0).toBe(true)
  })

  it('handles odd dimensions', () => {
    const result = nodeBounds(11, 7)
    expect(result).toEqual({ left: -5.5, right: 5.5, top: -3.5, bottom: 3.5 })
  })
})

describe('calculateChildrenTotalWidth', () => {
  it('returns 0 for empty array', () => {
    const result = calculateChildrenTotalWidth([], 10)
    expect(result).toBe(0)
  })

  it('returns single width for one child (no gaps)', () => {
    const result = calculateChildrenTotalWidth([100], 20)
    expect(result).toBe(100)
  })

  it('calculates total width with gaps for multiple children', () => {
    const result = calculateChildrenTotalWidth([50, 60, 70], 10)
    // 50 + 60 + 70 = 180 widths + 2 gaps * 10 = 200
    expect(result).toBe(200)
  })

  it('handles zero gap', () => {
    const result = calculateChildrenTotalWidth([30, 40, 50], 0)
    expect(result).toBe(120)
  })

  it('handles large gaps', () => {
    const result = calculateChildrenTotalWidth([10, 10], 100)
    // 10 + 10 + 1 gap * 100 = 120
    expect(result).toBe(120)
  })
})
