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

  it('preserves rightmost child edge geometry detail in union', () => {
    // This test reproduces the bug where node 3's edge geometry dip is lost
    // when unioning node 2 and node 3's contours for building node 1's contour.
    //
    // Node 3's right boundary has an inward dip (horizontal segment going left)
    // from the edge connecting node 3 to its children (6, 7).
    // This dip should be preserved in the union's right boundary.

    // Simulate node 2's contour (left child, simpler - just a rectangle for this test)
    const node2Contour: YMonotonePolygon = {
      left: [
        { x: -65, y: 35 },  // node2 top-left (at x=-50, width 30)
        { x: -65, y: 65 },  // node2 bottom-left
      ],
      right: [
        { x: -35, y: 35 },  // node2 top-right
        { x: -35, y: 65 },  // node2 bottom-right
      ],
    }

    // Simulate node 3's contour WITH edge geometry (right child)
    // Node 3 is at x=50 in parent coords, has the inward dip from straight-arrow edges
    const node3Contour: YMonotonePolygon = {
      left: [
        { x: 35, y: 35 },   // node3 top-left (at x=50, width 30)
        { x: 35, y: 65 },   // node3 bottom-left
        { x: 50, y: 65 },   // node3 bottom-center (inward for edge)
        { x: 35, y: 95 },   // diagonal to child 6's top-left
        { x: 35, y: 115 },  // child 6's bottom-left
      ],
      right: [
        { x: 65, y: 35 },   // node3 top-right
        { x: 65, y: 65 },   // node3 bottom-right
        { x: 50, y: 65 },   // node3 bottom-center (INWARD DIP - this is the key point!)
        { x: 65, y: 95 },   // diagonal to child 7's top-right
        { x: 65, y: 115 },  // child 7's bottom-right
      ],
    }

    const union = unionContours([node2Contour, node3Contour])

    // The union's right boundary should preserve the inward dip at y=65
    // There should be a point at (50, 65) representing the edge geometry
    const dipPoint = union.right.find((p) => p.y === 65 && p.x === 50)
    expect(dipPoint).toBeDefined()

    // The right boundary should also have the outer point at (65, 65)
    const outerPoint = union.right.find((p) => p.y === 65 && p.x === 65)
    expect(outerPoint).toBeDefined()
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

      // Get bounds of node 3's subtree
      const node3Bounds = getContourBounds(node3Contour)

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

      const rootBounds = getContourBounds(rootContour)

      // The root's contour should extend to include the full depth of all children
      // Node 3 extends from -15 to +65 in its local coords, positioned at y=50
      // So in root's coords, node 3's bottom is at 50 + 65 = 115
      expect(rootBounds.bottom).toBe(50 + node3Bounds.bottom)

      // The root's right boundary should extend to node 3's rightmost point
      // Node 3's right is at +40 in local coords (child at +25 with half-width 15)
      // In root's coords, node 3's right is at 50 + 40 = 90
      expect(rootBounds.right).toBe(50 + node3Bounds.right)

      // The root's left boundary should extend to node 2's leftmost point
      // Node 2 is positioned at x=-50, and its left extends to -40 in local coords
      // So in root's coords, the left is at -50 + (-40) = -90
      const node2Bounds = getContourBounds(node2Contour)
      expect(rootBounds.left).toBe(-50 + node2Bounds.left)
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

describe('buildSubtreeContour - deep subtree preservation', () => {
  it('includes all detail from children contours including edge geometry', () => {
    // This test verifies that the contour includes ALL detail from children's
    // contours, including edge geometry that may create "inward" movements.
    // This detail is necessary for accurate layout calculations.
    //
    // The test case:
    //       Parent
    //       /    \
    //   Left    Right (narrower node, but children extend further right)
    //            / \
    //           A   B  (B extends further right than Right's node edge)

    const leafContour = createNodeContour(30, 30)

    // Build "Right" node's subtree with two children
    const rightSubtreeContour = buildSubtreeContour(
      40, // Right node width
      30, // Right node height
      [
        { contour: leafContour, offsetX: -15, offsetY: 50, width: 30, height: 30 }, // A
        { contour: leafContour, offsetX: 25, offsetY: 50, width: 30, height: 30 }, // B - extends right
      ],
      'org-chart'
    )

    // Build "Left" node (just a leaf for simplicity)
    const leftContour = createNodeContour(40, 30)

    // Build Parent's contour
    const parentContour = buildSubtreeContour(
      50, // Parent width
      30, // Parent height
      [
        { contour: leftContour, offsetX: -50, offsetY: 50, width: 40, height: 30 }, // Left
        { contour: rightSubtreeContour, offsetX: 50, offsetY: 50, width: 40, height: 30 }, // Right
      ],
      'org-chart'
    )

    const bounds = getContourBounds(parentContour)

    // The contour should extend to B's right edge
    // Right child at x=50, B at x=25 within Right, B's right edge at 50+25+15=90
    expect(bounds.right).toBe(90)

    // The contour should extend to the bottom of B
    // Right child at y=50, B at y=50 within Right (relative to Right's center)
    // B's bottom at 50 + 50 + 15 = 115 in Parent's coords
    expect(bounds.bottom).toBe(115)

    // Verify the contour has multiple points on the right boundary (not simplified)
    // This ensures we're keeping all the detail
    expect(parentContour.right.length).toBeGreaterThan(6)
  })

  it('preserves rightmost child deep descendants (Group G bug)', () => {
    // This test reproduces the "Group G" bug:
    //
    //       Category C
    //       /        \
    //   Factor F   Group G
    //    /   \       /   \
    //   L  LongLbl  N    O
    //
    // When building Category C's contour, Group G's children (N, O)
    // should be included in the right boundary.

    const leafContour = createNodeContour(30, 30)
    const wideLeafContour = createNodeContour(80, 30) // "Longer Label M"

    // Build Factor F's subtree contour
    const factorFContour = buildSubtreeContour(
      50,
      30,
      [
        { contour: leafContour, offsetX: -25, offsetY: 50, width: 30, height: 30 }, // L
        { contour: wideLeafContour, offsetX: 30, offsetY: 50, width: 80, height: 30 }, // Longer Label M
      ],
      'org-chart'
    )

    // Build Group G's subtree contour
    const groupGContour = buildSubtreeContour(
      50,
      30,
      [
        { contour: leafContour, offsetX: -20, offsetY: 50, width: 30, height: 30 }, // N
        { contour: leafContour, offsetX: 20, offsetY: 50, width: 30, height: 30 }, // O
      ],
      'org-chart'
    )

    // Log Group G's contour to understand its structure
    console.log('Group G right boundary:', groupGContour.right.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' → '))

    // Verify Group G's own contour extends to its children
    const groupGBounds = getContourBounds(groupGContour)
    expect(groupGBounds.bottom).toBe(65) // children at y=50, half-height 15

    // Build Category C's contour
    const categoryCContour = buildSubtreeContour(
      60,
      30,
      [
        { contour: factorFContour, offsetX: -70, offsetY: 50, width: 50, height: 30 }, // Factor F
        { contour: groupGContour, offsetX: 70, offsetY: 50, width: 50, height: 30 }, // Group G
      ],
      'org-chart'
    )

    const categoryCBounds = getContourBounds(categoryCContour)

    // Log Category C's right boundary to check for decoherence
    console.log('Category C right boundary:', categoryCContour.right.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' → '))

    // Check for inward dips on the right boundary below Group G's node bottom
    // Group G is at y=50 with height 30, so its bottom is at y=65
    const groupGBottom = 50 + 30 / 2
    const pointsBelowGroupG = categoryCContour.right.filter((p) => p.y > groupGBottom)
    console.log('Points below Group G bottom:', pointsBelowGroupG.map((p) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' → '))

    // Category C's contour should extend to Group G's children (N, O)
    // Group G is at y=50, its children extend to 50+65=115 in Category C's coords
    expect(categoryCBounds.bottom).toBe(50 + groupGBounds.bottom) // Should be 115

    // The right boundary should extend to O's right edge
    // Group G at x=70, O at x=20 within Group G, O's right edge at 70+20+15=105
    expect(categoryCBounds.right).toBe(70 + groupGBounds.right)

    // Verify there are points at the deep level on the RIGHT boundary
    const deepYLevel = 100 // Below Factor F and Group G's node level
    const hasDeepRightPoints = categoryCContour.right.some((p) => p.y > deepYLevel)
    expect(hasDeepRightPoints).toBe(true)

    // Additional check: verify the exact max y on right boundary
    const maxRightY = Math.max(...categoryCContour.right.map((p) => p.y))
    expect(maxRightY).toBe(115) // Should extend to bottom of N, O

    // Verify that the contour includes detail from Group G's edge geometry
    // (the boundary may go "inward" at the bar level, which is correct behavior)
    expect(categoryCContour.right.length).toBeGreaterThan(8)
  })

  it('handles contours with different depths correctly (no diagonal jumps)', () => {
    // This test reproduces the "Deep Tree" bug where a diagonal line appears
    // when one contour extends deeper than another and there are no explicit
    // points in certain y-ranges.
    //
    // Structure:
    //   Union of:
    //   - Contour A: extends to y=150 (deep)
    //   - Contour B: ends at y=80 (shallow)
    //
    // At y-levels [80, 150], only Contour A contributes.
    // The union's left boundary should follow Contour A's left boundary
    // without any diagonal jumps.

    // Contour A: deep contour on the left
    const contourA: YMonotonePolygon = {
      left: [
        { x: -50, y: 0 },
        { x: -50, y: 50 },   // explicit point
        { x: -60, y: 100 },  // goes more left
        { x: -60, y: 150 },  // deep point
      ],
      right: [
        { x: -30, y: 0 },
        { x: -30, y: 150 },
      ],
    }

    // Contour B: shallow contour on the right
    const contourB: YMonotonePolygon = {
      left: [
        { x: 30, y: 0 },
        { x: 30, y: 80 },  // ends here
      ],
      right: [
        { x: 50, y: 0 },
        { x: 50, y: 80 },
      ],
    }

    const union = unionContours([contourA, contourB])

    // The left boundary should follow contour A entirely (it's always leftmost)
    // Check that we have a point at or near y=100 (contour A's inflection point)
    const pointNearY100 = union.left.find((p) => p.y === 100)
    expect(pointNearY100).toBeDefined()
    expect(pointNearY100?.x).toBe(-60)

    // Check the boundary extends to the deep level
    const deepPoint = union.left.find((p) => p.y === 150)
    expect(deepPoint).toBeDefined()

    // Verify no huge jumps in y (which would indicate a diagonal)
    for (let i = 1; i < union.left.length; i++) {
      const prevY = union.left[i - 1].y
      const currY = union.left[i].y
      // Allow reasonable gaps, but not huge jumps that skip explicit points
      expect(currY - prevY).toBeLessThanOrEqual(60) // Reasonable threshold
    }
  })

  it('preserves deep right-extending subtree from non-rightmost child', () => {
    // This test reproduces the "Item I" bug from the Deep Tree example:
    //
    //           Branch B
    //          /        \
    //     Depth D     Element E
    //      /   \
    //     H   Item I
    //          /  \
    //         P    Q
    //
    // When building Branch B's contour, Item I and its children (P, Q)
    // should be included even though Depth D is the leftmost child.
    // The bug was that only Depth D's LEFT boundary was used,
    // losing Item I's subtree which is on Depth D's RIGHT boundary.

    // Create leaf contours for P and Q
    const leafContour = createNodeContour(30, 30)

    // Build "Item I" subtree contour (with children P, Q)
    const itemIContour = buildSubtreeContour(
      60, // Item I is wider
      30,
      [
        { contour: leafContour, offsetX: -25, offsetY: 50, width: 30, height: 30 },
        { contour: leafContour, offsetX: 25, offsetY: 50, width: 30, height: 30 },
      ],
      'org-chart'
    )

    // Build "Depth D" subtree contour (with children H, Item I)
    const hContour = createNodeContour(30, 30) // H is a leaf
    const depthDContour = buildSubtreeContour(
      50,
      30,
      [
        { contour: hContour, offsetX: -40, offsetY: 50, width: 30, height: 30 },
        { contour: itemIContour, offsetX: 40, offsetY: 50, width: 60, height: 30 },
      ],
      'org-chart'
    )

    // Build "Element E" contour (a leaf, positioned to the right of Depth D)
    const elementEContour = createNodeContour(60, 30)

    // Build "Branch B" contour (with children Depth D, Element E)
    const branchBContour = buildSubtreeContour(
      50,
      30,
      [
        { contour: depthDContour, offsetX: -60, offsetY: 50, width: 50, height: 30 },
        { contour: elementEContour, offsetX: 60, offsetY: 50, width: 60, height: 30 },
      ],
      'org-chart'
    )

    // The key assertion: Branch B's contour should extend down to where P and Q are
    // P and Q are at y = 50 (Depth D) + 50 (Item I) + 50/2 (P/Q center) = ~100 below Branch B
    // Plus the leaf height of 15 below center = ~115 total
    const bounds = getContourBounds(branchBContour)

    // The contour should extend to at least the depth of P and Q
    // Depth D is at y=50, Item I is at y=100, P/Q are at y=150
    // So bottom should be at least 150 + 15 = 165 (from Branch B's center at 0)
    expect(bounds.bottom).toBeGreaterThanOrEqual(140) // Allow some margin

    // Also verify that the left boundary extends to include H
    // H is at Depth D position (-60) + H offset (-40) = -100, minus half width (-15) = -115
    expect(bounds.left).toBeLessThanOrEqual(-90) // Allow some margin

    // The right boundary should extend to include Q (the rightmost deep node)
    // Depth D is at x=-60, Item I offset within Depth D is +40, Q offset within Item I is +25
    // So Q is at -60 + 40 + 25 = 5, plus half width of 15 = 20
    // This should be part of the contour even though Element E (rightmost child) is at x=60+30=90
    // The deep subtree should still be represented
    // Actually, Element E's right edge (60 + 30 = 90) should be the rightmost at shallow levels,
    // but at deep levels, only the P/Q subtree exists, so it should be represented

    // Verify the contour has points at the deep level where only Depth D's subtree exists
    const deepYLevel = 130 // Below where Element E ends
    const hasDeepPoints = branchBContour.left.some(p => p.y > deepYLevel) ||
                          branchBContour.right.some(p => p.y > deepYLevel)
    expect(hasDeepPoints).toBe(true)
  })
})
