import { describe, it, expect } from 'vitest'
import {
  createNodeContour,
  translateContour,
  cloneContour,
  getContourBounds,
  buildSubtreeContour,
  unionContours,
  findMinHorizontalGap,
  calculatePlacementOffset,
  type ChildContourInfo,
} from './contour'
import type { YMonotonePolygon } from './types'

describe('createNodeContour', () => {
  it('creates centered rectangle contour', () => {
    const contour = createNodeContour(100, 50)

    // Left boundary: top-left to bottom-left
    expect(contour.left).toEqual([
      { x: -50, y: -25 },
      { x: -50, y: 25 },
    ])

    // Right boundary: top-right to bottom-right
    expect(contour.right).toEqual([
      { x: 50, y: -25 },
      { x: 50, y: 25 },
    ])
  })

  it('handles square nodes', () => {
    const contour = createNodeContour(40, 40)

    expect(contour.left[0]).toEqual({ x: -20, y: -20 })
    expect(contour.right[0]).toEqual({ x: 20, y: -20 })
  })

  it('handles zero-size nodes', () => {
    const contour = createNodeContour(0, 0)

    expect(contour.left.length).toBe(2)
    expect(contour.right.length).toBe(2)
  })
})

describe('translateContour', () => {
  it('translates contour by positive offset', () => {
    const contour = createNodeContour(20, 20)
    const translated = translateContour(contour, 100, 50)

    expect(translated.left[0]).toEqual({ x: 90, y: 40 })
    expect(translated.right[0]).toEqual({ x: 110, y: 40 })
  })

  it('translates contour by negative offset', () => {
    const contour = createNodeContour(20, 20)
    const translated = translateContour(contour, -30, -20)

    expect(translated.left[0]).toEqual({ x: -40, y: -30 })
    expect(translated.right[0]).toEqual({ x: -20, y: -30 })
  })

  it('does not mutate original contour', () => {
    const contour = createNodeContour(20, 20)
    const originalLeftX = contour.left[0].x
    translateContour(contour, 100, 100)

    expect(contour.left[0].x).toBe(originalLeftX)
  })
})

describe('cloneContour', () => {
  it('creates deep copy of contour', () => {
    const original = createNodeContour(50, 30)
    const clone = cloneContour(original)

    // Modify clone
    clone.left[0].x = 999

    // Original should be unchanged
    expect(original.left[0].x).toBe(-25)
  })
})

describe('getContourBounds', () => {
  it('returns correct bounds for simple rectangle', () => {
    const contour = createNodeContour(100, 60)
    const bounds = getContourBounds(contour)

    expect(bounds).toEqual({
      top: -30,
      bottom: 30,
      left: -50,
      right: 50,
    })
  })

  it('returns correct bounds for translated contour', () => {
    const contour = translateContour(createNodeContour(20, 20), 50, 30)
    const bounds = getContourBounds(contour)

    expect(bounds).toEqual({
      top: 20,
      bottom: 40,
      left: 40,
      right: 60,
    })
  })
})

describe('unionContours', () => {
  it('returns empty contour for empty input', () => {
    const result = unionContours([])

    expect(result.left).toEqual([])
    expect(result.right).toEqual([])
  })

  it('returns clone for single contour', () => {
    const contour = createNodeContour(40, 30)
    const result = unionContours([contour])

    expect(result.left).toEqual(contour.left)
    expect(result.right).toEqual(contour.right)
  })

  it('unions two non-overlapping contours horizontally', () => {
    const left = translateContour(createNodeContour(20, 20), -30, 0)
    const right = translateContour(createNodeContour(20, 20), 30, 0)
    const result = unionContours([left, right])

    // Left boundary should be from left contour
    expect(result.left[0].x).toBe(-40)
    // Right boundary should be from right contour
    expect(result.right[0].x).toBe(40)
  })

  it('unions two vertically stacked contours', () => {
    const top = translateContour(createNodeContour(20, 20), 0, -30)
    const bottom = translateContour(createNodeContour(20, 20), 0, 30)
    const result = unionContours([top, bottom])

    // Should span from top of first to bottom of second
    const bounds = getContourBounds(result)
    expect(bounds.top).toBe(-40)
    expect(bounds.bottom).toBe(40)
  })

  it('handles horizontal segments correctly for right boundary', () => {
    // Create a contour with a horizontal segment on the right boundary
    // This simulates the edge geometry from straight-arrow edges
    const contourWithHorizontal: YMonotonePolygon = {
      left: [
        { x: -20, y: 0 },
        { x: -20, y: 40 },
      ],
      right: [
        { x: 20, y: 0 },
        { x: 20, y: 20 }, // Vertical down
        { x: 0, y: 20 }, // Horizontal inward (to center for edge)
        { x: 30, y: 40 }, // Diagonal outward to child
        { x: 50, y: 40 }, // Horizontal to child's right edge
        { x: 50, y: 60 }, // Child's right edge
      ],
    }

    const result = unionContours([contourWithHorizontal])

    // At y=20, the rightmost x should be 20 (from the vertical segment),
    // not 0 (from the horizontal going inward)
    const pointAtY20 = result.right.find((p) => p.y === 20)
    expect(pointAtY20?.x).toBe(20)
  })

  it('handles horizontal segments correctly for left boundary', () => {
    // Create a contour with a horizontal segment on the left boundary
    const contourWithHorizontal: YMonotonePolygon = {
      left: [
        { x: -20, y: 0 },
        { x: -20, y: 20 }, // Vertical down
        { x: 0, y: 20 }, // Horizontal inward (to center for edge)
        { x: -30, y: 40 }, // Diagonal outward to child
        { x: -50, y: 40 }, // Horizontal to child's left edge
        { x: -50, y: 60 }, // Child's left edge
      ],
      right: [
        { x: 20, y: 0 },
        { x: 20, y: 60 },
      ],
    }

    const result = unionContours([contourWithHorizontal])

    // At y=20, the leftmost x should be -20 (from the vertical segment),
    // not 0 (from the horizontal going inward)
    const pointAtY20 = result.left.find((p) => p.y === 20)
    expect(pointAtY20?.x).toBe(-20)
  })
})

describe('buildSubtreeContour', () => {
  it('returns node contour when no children', () => {
    const contour = buildSubtreeContour(100, 50, [], 'straight-arrow')

    expect(contour.left).toEqual([
      { x: -50, y: -25 },
      { x: -50, y: 25 },
    ])
    expect(contour.right).toEqual([
      { x: 50, y: -25 },
      { x: 50, y: 25 },
    ])
  })

  describe('straight-arrow edge style', () => {
    it('creates contour with edge geometry for single child', () => {
      const childContour = createNodeContour(40, 30)
      const children: ChildContourInfo[] = [
        {
          contour: childContour,
          offsetX: 0,
          offsetY: 60, // Child center is 60 below parent center
          width: 40,
          height: 30,
        },
      ]

      const contour = buildSubtreeContour(60, 40, children, 'straight-arrow')

      // Should have parent rectangle + edge geometry + child
      // Right boundary should include:
      // - Parent top-right
      // - Parent bottom-right
      // - Parent bottom-center (for edge start)
      // - Child top-center (diagonal)
      // - Child top-right (horizontal)
      // - Child bottom-right
      expect(contour.right.length).toBeGreaterThan(2)

      // First point should be parent top-right
      expect(contour.right[0].x).toBe(30) // parent width/2
      expect(contour.right[0].y).toBe(-20) // -parent height/2

      // Should include edge connection point at parent bottom center
      const bottomCenterPoint = contour.right.find((p) => p.x === 0 && p.y === 20)
      expect(bottomCenterPoint).toBeDefined()
    })

    it('preserves child subtree inflection points', () => {
      // Create a child that has its own children (grandchildren)
      // The child's contour should have edge geometry that gets preserved
      const grandchildContour = createNodeContour(30, 20)

      // Build child's subtree contour (child with one grandchild)
      const childSubtreeContour = buildSubtreeContour(
        40,
        30,
        [
          {
            contour: grandchildContour,
            offsetX: 0,
            offsetY: 50,
            width: 30,
            height: 20,
          },
        ],
        'straight-arrow'
      )

      // Now build parent's contour with this child
      const parentContour = buildSubtreeContour(
        60,
        40,
        [
          {
            contour: childSubtreeContour,
            offsetX: 0,
            offsetY: 80,
            width: 40,
            height: 30,
          },
        ],
        'straight-arrow'
      )

      // The parent's right contour should preserve the inflection points
      // from the child's edge to the grandchild
      // Count inflection points (where direction changes)
      const rightBoundary = parentContour.right

      // Should have multiple points representing:
      // - Parent rectangle corners
      // - Parent-to-child edge geometry
      // - Child-to-grandchild edge geometry (preserved from child's contour)
      expect(rightBoundary.length).toBeGreaterThanOrEqual(6)
    })

    it('preserves inflection points for binary tree structure', () => {
      // Simulate the binary tree: root with two children, each having two children
      // This is the exact case that was failing before the fix

      // Create leaf contours (nodes 4, 5, 6, 7)
      const leafContour = createNodeContour(30, 30)

      // Build subtree for node 2 (with children 4, 5)
      const node2Contour = buildSubtreeContour(
        30,
        30,
        [
          { contour: leafContour, offsetX: -25, offsetY: 50, width: 30, height: 30 },
          { contour: leafContour, offsetX: 25, offsetY: 50, width: 30, height: 30 },
        ],
        'straight-arrow'
      )

      // Build subtree for node 3 (with children 6, 7)
      const node3Contour = buildSubtreeContour(
        30,
        30,
        [
          { contour: leafContour, offsetX: -25, offsetY: 50, width: 30, height: 30 },
          { contour: leafContour, offsetX: 25, offsetY: 50, width: 30, height: 30 },
        ],
        'straight-arrow'
      )

      // Count inflection points in node 3's right boundary
      const node3RightPoints = node3Contour.right.length

      // Build root contour (node 1 with children 2, 3)
      const rootContour = buildSubtreeContour(
        30,
        30,
        [
          { contour: node2Contour, offsetX: -50, offsetY: 50, width: 30, height: 30 },
          { contour: node3Contour, offsetX: 50, offsetY: 50, width: 30, height: 30 },
        ],
        'straight-arrow'
      )

      // The root's right boundary should preserve node 3's inflection points
      // (minus the top points that get replaced by root's edge geometry)
      // Root adds: top-right, bottom-right, bottom-center, diagonal to 3, horizontal to 3's right
      // Then continues with node 3's contour below node 3's top

      // The key test: root's right boundary should have at least as many
      // inflection points as node 3's boundary (accounting for the connection)
      const rootRightPoints = rootContour.right.length

      // Root should have: 5 points for root+edge geometry + (node3 points - 1 skipped top point)
      expect(rootRightPoints).toBeGreaterThanOrEqual(node3RightPoints + 3)
    })
  })

  describe('curve edge style', () => {
    it('creates diagonal edge from corner to corner', () => {
      const childContour = createNodeContour(40, 30)
      const children: ChildContourInfo[] = [
        {
          contour: childContour,
          offsetX: 0,
          offsetY: 60,
          width: 40,
          height: 30,
        },
      ]

      const contour = buildSubtreeContour(60, 40, children, 'curve')

      // Right boundary should go from parent top-right to parent bottom-right
      // then diagonal to child top-right
      expect(contour.right[0]).toEqual({ x: 30, y: -20 }) // Parent top-right
      expect(contour.right[1]).toEqual({ x: 30, y: 20 }) // Parent bottom-right
      expect(contour.right[2]).toEqual({ x: 20, y: 45 }) // Child top-right (60-30/2=45)
    })
  })

  describe('org-chart edge style', () => {
    it('creates rectangular edge with horizontal bar', () => {
      const childContour = createNodeContour(40, 30)
      const children: ChildContourInfo[] = [
        {
          contour: childContour,
          offsetX: 0,
          offsetY: 60,
          width: 40,
          height: 30,
        },
      ]

      const contour = buildSubtreeContour(60, 40, children, 'org-chart')

      // Should have more points due to rectangular routing
      // Parent corners + vertical drop + horizontal bar + vertical drop + child
      expect(contour.right.length).toBeGreaterThan(4)

      // Should include a point at the horizontal bar Y level
      const barY = (20 + 45) / 2 // midpoint between parent bottom and child top
      const barPoint = contour.right.find((p) => Math.abs(p.y - barY) < 1)
      expect(barPoint).toBeDefined()
    })
  })
})

describe('findMinHorizontalGap', () => {
  it('returns null for non-overlapping contours vertically', () => {
    const top = translateContour(createNodeContour(20, 20), 0, -50)
    const bottom = translateContour(createNodeContour(20, 20), 0, 50)

    const gap = findMinHorizontalGap(top, bottom)
    expect(gap).toBeNull()
  })

  it('finds gap between horizontally separated contours', () => {
    const left = translateContour(createNodeContour(20, 20), -30, 0)
    const right = translateContour(createNodeContour(20, 20), 30, 0)

    // Left contour right edge at -20, right contour left edge at 20
    // Gap should be 40
    const gap = findMinHorizontalGap(left, right)
    expect(gap).toBe(40)
  })

  it('returns negative gap for overlapping contours', () => {
    const left = translateContour(createNodeContour(40, 20), -10, 0)
    const right = translateContour(createNodeContour(40, 20), 10, 0)

    // Left contour right edge at 10, right contour left edge at -10
    // They overlap, so gap is negative
    const gap = findMinHorizontalGap(left, right)
    expect(gap).toBeLessThan(0)
  })
})

describe('calculatePlacementOffset', () => {
  it('calculates offset to achieve desired gap', () => {
    const left = translateContour(createNodeContour(20, 20), 0, 0)
    const right = createNodeContour(20, 20) // At origin

    // Left right edge at 10, right left edge at -10 (current gap = -20, overlapping)
    // To get gap of 10, need to move right by 30
    const offset = calculatePlacementOffset(left, right, 10)
    expect(offset).toBe(30)
  })

  it('handles non-overlapping y-ranges', () => {
    const left = translateContour(createNodeContour(20, 20), 0, 0)
    const right = translateContour(createNodeContour(20, 20), 0, 100) // Far below

    // No y-overlap, should use bounding box calculation
    const offset = calculatePlacementOffset(left, right, 10)
    expect(offset).toBeGreaterThan(0)
  })
})
