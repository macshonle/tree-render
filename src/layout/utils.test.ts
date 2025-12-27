import { describe, it, expect } from 'vitest'
import {
  translateBounds,
  mergeBounds,
  nodeBounds,
  calculateChildrenTotalWidth,
  makeEmptyContour,
  contourFromNodeBox,
  mergeContours,
  translateContour,
  cloneContour,
} from './utils'
import type { SubtreeBounds, SkylineContour } from './types'

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

describe('makeEmptyContour', () => {
  it('creates contour with correct number of rows', () => {
    const result = makeEmptyContour(5, 4)
    expect(result.left.length).toBe(5)
    expect(result.right.length).toBe(5)
  })

  it('initializes left edges to positive infinity', () => {
    const result = makeEmptyContour(3, 4)
    expect(result.left).toEqual([Infinity, Infinity, Infinity])
  })

  it('initializes right edges to negative infinity', () => {
    const result = makeEmptyContour(3, 4)
    expect(result.right).toEqual([-Infinity, -Infinity, -Infinity])
  })

  it('sets height based on rows and rowStep', () => {
    const result = makeEmptyContour(5, 4)
    expect(result.height).toBe(20) // 5 * 4
  })

  it('uses default rowStep when not specified', () => {
    const result = makeEmptyContour(10)
    expect(result.rowStep).toBe(4) // DEFAULT_CONTOUR_ROW_STEP
    expect(result.height).toBe(40) // 10 * 4
  })
})

describe('contourFromNodeBox', () => {
  it('creates contour with correct row count', () => {
    const result = contourFromNodeBox(100, 20, 4)
    // 20 / 4 = 5 rows
    expect(result.left.length).toBe(5)
    expect(result.right.length).toBe(5)
  })

  it('creates centered left/right edges', () => {
    const result = contourFromNodeBox(100, 20, 4)
    // All rows should have left = -50, right = 50
    expect(result.left).toEqual([-50, -50, -50, -50, -50])
    expect(result.right).toEqual([50, 50, 50, 50, 50])
  })

  it('preserves exact height', () => {
    const result = contourFromNodeBox(80, 17, 4)
    expect(result.height).toBe(17)
  })

  it('rounds up row count for partial rows', () => {
    const result = contourFromNodeBox(40, 10, 4)
    // ceil(10 / 4) = 3 rows
    expect(result.left.length).toBe(3)
  })

  it('handles zero height', () => {
    const result = contourFromNodeBox(50, 0, 4)
    expect(result.left.length).toBe(0)
    expect(result.right.length).toBe(0)
    expect(result.height).toBe(0)
  })
})

describe('mergeContours', () => {
  it('handles negative vertical offset (partial overlap)', () => {
    const dst = contourFromNodeBox(20, 12, 4) // 3 rows
    const src = contourFromNodeBox(30, 8, 4) // 2 rows

    // Negative offset means source is above destination
    // rowShift = floor(-4 / 4) = -1
    mergeContours(dst, src, 0, -4, 4)

    // Row 0 of src maps to row -1 of dst (out of bounds, ignored)
    // Row 1 of src maps to row 0 of dst
    expect(dst.left[0]).toBe(-15) // min(-10, -15)
    expect(dst.right[0]).toBe(15) // max(10, 15)
  })

  it('handles large negative offset where all source rows are skipped', () => {
    const dst = contourFromNodeBox(20, 8, 4) // 2 rows
    const src = contourFromNodeBox(30, 8, 4) // 2 rows

    // Large negative offset: all source rows map to negative indices
    mergeContours(dst, src, 0, -16, 4) // rowShift = -4

    // Source rows map to indices -4, -3 which are out of bounds
    // Destination should be unchanged
    expect(dst.left).toEqual([-10, -10])
    expect(dst.right).toEqual([10, 10])
  })

  it('does not reduce height with negative dy', () => {
    const dst = contourFromNodeBox(20, 20, 4) // height = 20
    const src = contourFromNodeBox(30, 8, 4) // height = 8

    // Merge with negative dy
    mergeContours(dst, src, 0, -4, 4)

    // Height should remain at least the original dst.height
    // max(20, -4 + 8) = max(20, 4) = 20
    expect(dst.height).toBe(20)
  })

  it('merges source contour into destination with no offset', () => {
    const dst = makeEmptyContour(3, 4)
    const src = contourFromNodeBox(20, 12, 4) // 3 rows, left=-10, right=10

    mergeContours(dst, src, 0, 0, 4)

    expect(dst.left).toEqual([-10, -10, -10])
    expect(dst.right).toEqual([10, 10, 10])
  })

  it('applies horizontal offset to source', () => {
    const dst = makeEmptyContour(3, 4)
    const src = contourFromNodeBox(20, 12, 4)

    mergeContours(dst, src, 30, 0, 4)

    expect(dst.left).toEqual([20, 20, 20]) // -10 + 30
    expect(dst.right).toEqual([40, 40, 40]) // 10 + 30
  })

  it('shifts rows based on vertical offset', () => {
    const dst = makeEmptyContour(5, 4)
    const src = contourFromNodeBox(20, 8, 4) // 2 rows

    mergeContours(dst, src, 0, 8, 4) // Shift by 2 rows

    // First 2 rows should still be empty
    expect(dst.left[0]).toBe(Infinity)
    expect(dst.left[1]).toBe(Infinity)
    // Rows 2-3 should have the source values
    expect(dst.left[2]).toBe(-10)
    expect(dst.left[3]).toBe(-10)
  })

  it('expands destination arrays if needed', () => {
    const dst = makeEmptyContour(2, 4)
    const src = contourFromNodeBox(20, 8, 4) // 2 rows

    mergeContours(dst, src, 0, 8, 4) // Would need rows 2-3

    expect(dst.left.length).toBe(4)
    expect(dst.right.length).toBe(4)
  })

  it('updates height to include merged content', () => {
    const dst = makeEmptyContour(2, 4)
    dst.height = 8
    const src = contourFromNodeBox(20, 12, 4)

    mergeContours(dst, src, 0, 20, 4)

    expect(dst.height).toBe(32) // 20 + 12
  })

  it('takes min for left edges and max for right edges', () => {
    const dst = contourFromNodeBox(40, 8, 4) // left=-20, right=20
    const src = contourFromNodeBox(100, 8, 4) // left=-50, right=50

    mergeContours(dst, src, 0, 0, 4)

    expect(dst.left).toEqual([-50, -50]) // min(-20, -50)
    expect(dst.right).toEqual([50, 50]) // max(20, 50)
  })
})

describe('translateContour', () => {
  it('handles negative dy that would shift rows out of bounds', () => {
    const contour = contourFromNodeBox(20, 8, 4) // 2 rows

    // Negative dy creates a negative row shift
    // rowShift = floor(-4 / 4) = -1
    // newRows = -1 + 2 = 1
    const result = translateContour(contour, 0, -4, 4)

    // Only 1 row in result (row 1 of original maps to row 0 of result)
    expect(result.left.length).toBe(1)
    expect(result.left[0]).toBe(-10)
    expect(result.right[0]).toBe(10)
    expect(result.height).toBe(4) // 8 - 4
  })

  it('handles large negative dy where all rows are out of bounds', () => {
    const contour = contourFromNodeBox(20, 8, 4) // 2 rows

    // Very negative dy: rowShift = floor(-12 / 4) = -3
    // newRows = max(0, -3 + 2) = max(0, -1) = 0
    const result = translateContour(contour, 0, -12, 4)

    // Result should be an empty contour with zero height (clamped)
    expect(result.left.length).toBe(0)
    expect(result.right.length).toBe(0)
    expect(result.height).toBe(0) // max(0, 8 - 12) = 0
  })

  it('translates contour horizontally', () => {
    const contour = contourFromNodeBox(20, 8, 4) // left=-10, right=10

    const result = translateContour(contour, 50, 0, 4)

    expect(result.left).toEqual([40, 40]) // -10 + 50
    expect(result.right).toEqual([60, 60]) // 10 + 50
  })

  it('shifts rows with vertical translation', () => {
    const contour = contourFromNodeBox(20, 8, 4) // 2 rows

    const result = translateContour(contour, 0, 8, 4) // Shift by 2 rows

    expect(result.left.length).toBe(4) // 2 original + 2 shifted
    // First 2 rows should be empty (infinity)
    expect(result.left[0]).toBe(Infinity)
    expect(result.left[1]).toBe(Infinity)
    // Last 2 rows should have the values
    expect(result.left[2]).toBe(-10)
    expect(result.left[3]).toBe(-10)
  })

  it('updates height with vertical translation', () => {
    const contour = contourFromNodeBox(20, 12, 4)

    const result = translateContour(contour, 0, 20, 4)

    expect(result.height).toBe(32) // 12 + 20
  })

  it('does not mutate the original contour', () => {
    const original = contourFromNodeBox(20, 8, 4)
    const originalLeft = [...original.left]
    const originalRight = [...original.right]

    translateContour(original, 100, 100, 4)

    expect(original.left).toEqual(originalLeft)
    expect(original.right).toEqual(originalRight)
    expect(original.height).toBe(8)
  })
})

describe('cloneContour', () => {
  it('creates an exact copy', () => {
    const original: SkylineContour = {
      left: [-20, -30, -25],
      right: [20, 30, 25],
      height: 12,
      rowStep: 4,
    }

    const clone = cloneContour(original)

    expect(clone).toEqual(original)
  })

  it('creates independent arrays', () => {
    const original: SkylineContour = {
      left: [-10, -10],
      right: [10, 10],
      height: 8,
      rowStep: 4,
    }

    const clone = cloneContour(original)
    clone.left[0] = -999
    clone.right[0] = 999

    expect(original.left[0]).toBe(-10)
    expect(original.right[0]).toBe(10)
  })

  it('preserves height and rowStep', () => {
    const original: SkylineContour = {
      left: [-5],
      right: [5],
      height: 17,
      rowStep: 8,
    }

    const clone = cloneContour(original)

    expect(clone.height).toBe(17)
    expect(clone.rowStep).toBe(8)
  })
})
