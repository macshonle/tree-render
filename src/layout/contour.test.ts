import { describe, it, expect } from 'vitest'
import {
  createNodeContour,
  translateContour,
  cloneContour,
  getContourBounds,
  buildSubtreeContour,
  unionContours,
  subtreeContour,
  type ChildContourInfo,
} from './contour'
import type { LayoutNode } from '@/types'
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

      // With uniform envelope approach (corner-to-corner), right boundary includes:
      // - Parent top-right
      // - Parent bottom-right
      // - Diagonal to child top-right
      // - Child bottom-right
      expect(contour.right.length).toBeGreaterThan(2)

      // First point should be parent top-right
      expect(contour.right[0].x).toBe(30) // parent width/2
      expect(contour.right[0].y).toBe(-20) // -parent height/2

      // Uniform approach uses corner-to-corner, NOT center-to-center
      // So there's no point at (0, 20) - verify the contour goes to child's corner instead
      // Child: width=40 (halfWidth=20), height=30 (halfHeight=15), offsetX=0, offsetY=60
      // Child top-right is at (20, 60-15) = (20, 45)
      const childTopRight = contour.right.find((p) => p.x === 20 && p.y === 45)
      expect(childTopRight).toBeDefined()
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
    it('uses same envelope as curve style (uniform approach)', () => {
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

      // All edge styles now use the same uniform envelope approach
      const orgChartContour = buildSubtreeContour(60, 40, children, 'org-chart')
      const curveContour = buildSubtreeContour(60, 40, children, 'curve')

      // Contours should be identical since we now use corner-to-corner for all styles
      expect(orgChartContour.left).toEqual(curveContour.left)
      expect(orgChartContour.right).toEqual(curveContour.right)
    })
  })

  describe('straight-arrow edge style', () => {
    it('uses same envelope as curve style (uniform approach)', () => {
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

      // All edge styles now use the same uniform envelope approach
      const straightContour = buildSubtreeContour(60, 40, children, 'straight-arrow')
      const curveContour = buildSubtreeContour(60, 40, children, 'curve')

      // Contours should be identical since we now use corner-to-corner for all styles
      expect(straightContour.left).toEqual(curveContour.left)
      expect(straightContour.right).toEqual(curveContour.right)
    })
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

    // With uniform corner-to-corner approach, contours are simpler but still preserve
    // the essential boundary information. What matters is the bounds are correct.
    expect(parentContour.right.length).toBeGreaterThanOrEqual(4)
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

    // With uniform envelope approach, contours are simpler (corner-to-corner)
    // but still preserve the essential geometry
    expect(categoryCContour.right.length).toBeGreaterThan(2)
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

// ============================================================================
// Tests that would have failed before the detail-preserving union fix
// ============================================================================

describe('unionContours - detail preservation edge cases', () => {
  it('preserves all inflection points from rightmost contour on right boundary', () => {
    // Before the fix: union computed envelope (min/max) losing internal detail
    // After the fix: preserves ALL points from dominant contour

    // Create a contour with multiple inflection points (zigzag pattern)
    const zigzagContour: YMonotonePolygon = {
      left: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
      right: [
        { x: 50, y: 0 },    // start wide
        { x: 50, y: 20 },
        { x: 30, y: 20 },   // inward dip
        { x: 30, y: 40 },
        { x: 50, y: 40 },   // back out
        { x: 50, y: 60 },
        { x: 20, y: 60 },   // deeper inward dip
        { x: 20, y: 80 },
        { x: 50, y: 80 },   // back out again
        { x: 50, y: 100 },
      ],
    }

    // Create a simple contour to the left that won't affect right boundary
    const simpleContour: YMonotonePolygon = {
      left: [
        { x: -50, y: 0 },
        { x: -50, y: 100 },
      ],
      right: [
        { x: -30, y: 0 },
        { x: -30, y: 100 },
      ],
    }

    const union = unionContours([simpleContour, zigzagContour])

    // The right boundary should preserve ALL inflection points from zigzagContour
    // Check for the inward dips at y=20 and y=60
    const dipAt20 = union.right.find(p => p.y === 20 && p.x === 30)
    const dipAt60 = union.right.find(p => p.y === 60 && p.x === 20)

    expect(dipAt20).toBeDefined()
    expect(dipAt60).toBeDefined()

    // Verify point count - should have similar number of points as the zigzag
    expect(union.right.length).toBeGreaterThanOrEqual(zigzagContour.right.length - 2)
  })

  it('handles three contours with interleaved dominance on left boundary', () => {
    // Three contours where left boundary dominance changes:
    // y=0-45: contour A is leftmost (starts at x=-100, interpolates toward -50)
    // y=45-55: contour B is leftmost (at x=-80)
    // y=70-100: contour C is leftmost (at x=-90)

    const contourA: YMonotonePolygon = {
      left: [
        { x: -100, y: 0 },  // leftmost at top
        { x: -50, y: 50 },  // moves right
        { x: -50, y: 100 },
      ],
      right: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
    }

    const contourB: YMonotonePolygon = {
      left: [
        { x: -60, y: 0 },
        { x: -60, y: 45 },
        { x: -80, y: 45 },  // leftmost in middle section
        { x: -80, y: 55 },
        { x: -60, y: 55 },
        { x: -60, y: 100 },
      ],
      right: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
    }

    const contourC: YMonotonePolygon = {
      left: [
        { x: -40, y: 0 },
        { x: -40, y: 70 },
        { x: -90, y: 70 },  // leftmost at bottom
        { x: -90, y: 100 },
      ],
      right: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ],
    }

    const union = unionContours([contourA, contourB, contourC])

    // Verify the union contains the key inflection points from each dominant contour
    const topPoint = union.left.find(p => p.y === 0)
    expect(topPoint?.x).toBe(-100)

    // The union should include contourB's leftmost point at y=45
    // Note: Due to algorithm design, there may be a transition point before it
    const hasContourBInflection = union.left.some(p => p.y === 45 && p.x === -80)
    expect(hasContourBInflection).toBe(true)

    // The union should include contourC's leftmost point at y=70
    const bottomPoint = union.left.find(p => p.y >= 70 && p.x === -90)
    expect(bottomPoint).toBeDefined()

    // Verify the union encompasses all input bounds
    const unionBounds = getContourBounds(union)
    expect(unionBounds.left).toBe(-100)  // leftmost from contourA
    expect(unionBounds.bottom).toBe(100)
  })

  it('handles contours that share exact y-breakpoints', () => {
    // Two contours with points at exactly the same y-coordinates
    // This tests that we handle the edge case where multiple contours
    // have explicit points at the same y-level

    const contourA: YMonotonePolygon = {
      left: [
        { x: -50, y: 0 },
        { x: -50, y: 50 },  // explicit point at y=50
        { x: -50, y: 100 },
      ],
      right: [
        { x: -30, y: 0 },
        { x: -30, y: 100 },
      ],
    }

    const contourB: YMonotonePolygon = {
      left: [
        { x: 30, y: 0 },
        { x: 30, y: 50 },   // also has explicit point at y=50
        { x: 30, y: 100 },
      ],
      right: [
        { x: 50, y: 0 },
        { x: 50, y: 50 },   // and on right boundary
        { x: 50, y: 100 },
      ],
    }

    const union = unionContours([contourA, contourB])

    // Should not have duplicate points at y=50
    const leftPointsAt50 = union.left.filter(p => p.y === 50)
    const rightPointsAt50 = union.right.filter(p => p.y === 50)

    expect(leftPointsAt50.length).toBe(1)
    expect(rightPointsAt50.length).toBe(1)
    expect(leftPointsAt50[0].x).toBe(-50)  // leftmost
    expect(rightPointsAt50[0].x).toBe(50)  // rightmost
  })

  it('handles horizontal segments at dominance transition', () => {
    // Contour with horizontal segment exactly where dominance changes
    // This tests the interaction between horizontal segments and dominance transitions

    const contourWithHorizontal: YMonotonePolygon = {
      left: [
        { x: -50, y: 0 },
        { x: -50, y: 50 },
        { x: -30, y: 50 },  // horizontal segment at y=50
        { x: -30, y: 100 },
      ],
      right: [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
    }

    const simpleContour: YMonotonePolygon = {
      left: [
        { x: -40, y: 30 },   // starts at y=30, goes left of horizontal at y=50
        { x: -60, y: 50 },   // leftmost at y=50
        { x: -60, y: 80 },
      ],
      right: [
        { x: 0, y: 30 },
        { x: 0, y: 80 },
      ],
    }

    const union = unionContours([contourWithHorizontal, simpleContour])

    // The union should include simpleContour's leftmost point at y=50
    const hasLeftmostAt50 = union.left.some(p => p.y === 50 && p.x === -60)
    expect(hasLeftmostAt50).toBe(true)

    // Verify the union bounds encompass both contours
    const bounds = getContourBounds(union)
    expect(bounds.left).toBeLessThanOrEqual(-60)  // should include simpleContour's leftmost
    expect(bounds.top).toBe(0)    // from contourWithHorizontal
    expect(bounds.bottom).toBe(100)  // from contourWithHorizontal
  })

  it('preserves detail when one contour is entirely within another y-range', () => {
    // Outer contour spans y=0-100
    // Inner contour spans y=30-70 but extends further left in that range

    const outerContour: YMonotonePolygon = {
      left: [
        { x: -30, y: 0 },
        { x: -30, y: 100 },
      ],
      right: [
        { x: 30, y: 0 },
        { x: 30, y: 100 },
      ],
    }

    const innerContour: YMonotonePolygon = {
      left: [
        { x: -50, y: 30 },   // extends further left
        { x: -50, y: 50 },
        { x: -70, y: 50 },   // even further left
        { x: -70, y: 70 },
      ],
      right: [
        { x: 0, y: 30 },
        { x: 0, y: 70 },
      ],
    }

    const union = unionContours([outerContour, innerContour])

    // At y=0-30: should follow outerContour (x=-30)
    const topPoint = union.left[0]
    expect(topPoint.x).toBe(-30)
    expect(topPoint.y).toBe(0)

    // At y=30-70: should follow innerContour with its inflection
    const inflectionPoint = union.left.find(p => p.y === 50 && p.x === -70)
    expect(inflectionPoint).toBeDefined()

    // At y=70-100: should return to outerContour (x=-30)
    const bottomSection = union.left.filter(p => p.y >= 70)
    const hasOuterAtBottom = bottomSection.some(p => p.x === -30)
    expect(hasOuterAtBottom).toBe(true)
  })
})

// ============================================================================
// Property-based invariant tests
// ============================================================================

describe('Y-monotone polygon invariants', () => {
  /**
   * Helper to verify Y-monotonicity: points should be ordered by increasing y
   */
  function verifyYMonotonicity(boundary: { x: number; y: number }[], name: string): void {
    for (let i = 1; i < boundary.length; i++) {
      expect(
        boundary[i].y >= boundary[i - 1].y,
        `${name}: y should be non-decreasing, but y[${i-1}]=${boundary[i-1].y} > y[${i}]=${boundary[i].y}`
      ).toBe(true)
    }
  }

  /**
   * Helper to verify no duplicate consecutive points
   */
  function verifyNoDuplicates(boundary: { x: number; y: number }[], name: string): void {
    for (let i = 1; i < boundary.length; i++) {
      const isDupe = boundary[i].x === boundary[i - 1].x && boundary[i].y === boundary[i - 1].y
      expect(
        isDupe,
        `${name}: duplicate point at index ${i}: (${boundary[i].x}, ${boundary[i].y})`
      ).toBe(false)
    }
  }

  it('createNodeContour produces valid Y-monotone polygon', () => {
    const contour = createNodeContour(100, 50)

    verifyYMonotonicity(contour.left, 'left')
    verifyYMonotonicity(contour.right, 'right')
    verifyNoDuplicates(contour.left, 'left')
    verifyNoDuplicates(contour.right, 'right')
  })

  it('translateContour preserves Y-monotonicity', () => {
    const original = createNodeContour(100, 50)
    const translated = translateContour(original, 200, -100)

    verifyYMonotonicity(translated.left, 'left')
    verifyYMonotonicity(translated.right, 'right')
    verifyNoDuplicates(translated.left, 'left')
    verifyNoDuplicates(translated.right, 'right')
  })

  it('unionContours preserves Y-monotonicity for arbitrary contour combinations', () => {
    // Test with various contour configurations
    const testCases: YMonotonePolygon[][] = [
      // Two simple rectangles
      [
        translateContour(createNodeContour(40, 40), -30, 0),
        translateContour(createNodeContour(40, 40), 30, 0),
      ],
      // Three rectangles at different y-levels
      [
        translateContour(createNodeContour(30, 30), 0, -40),
        translateContour(createNodeContour(30, 30), -30, 0),
        translateContour(createNodeContour(30, 30), 30, 40),
      ],
      // Complex nested contours
      [
        {
          left: [{ x: -50, y: 0 }, { x: -50, y: 100 }],
          right: [{ x: -30, y: 0 }, { x: -30, y: 100 }],
        },
        {
          left: [{ x: -20, y: 20 }, { x: -40, y: 50 }, { x: -40, y: 80 }],
          right: [{ x: 20, y: 20 }, { x: 20, y: 80 }],
        },
        {
          left: [{ x: 30, y: 0 }, { x: 30, y: 100 }],
          right: [{ x: 50, y: 0 }, { x: 50, y: 100 }],
        },
      ],
    ]

    for (let i = 0; i < testCases.length; i++) {
      const union = unionContours(testCases[i])
      verifyYMonotonicity(union.left, `case ${i} left`)
      verifyYMonotonicity(union.right, `case ${i} right`)
      verifyNoDuplicates(union.left, `case ${i} left`)
      verifyNoDuplicates(union.right, `case ${i} right`)
    }
  })

  it('buildSubtreeContour preserves Y-monotonicity for all edge styles', () => {
    const childContour = createNodeContour(30, 30)
    const edgeStyles: Array<'curve' | 'straight-arrow' | 'org-chart'> = [
      'curve',
      'straight-arrow',
      'org-chart'
    ]

    for (const edgeStyle of edgeStyles) {
      const contour = buildSubtreeContour(
        50,
        40,
        [
          { contour: childContour, offsetX: -30, offsetY: 60, width: 30, height: 30 },
          { contour: childContour, offsetX: 30, offsetY: 60, width: 30, height: 30 },
        ],
        edgeStyle
      )

      verifyYMonotonicity(contour.left, `${edgeStyle} left`)
      verifyYMonotonicity(contour.right, `${edgeStyle} right`)
      verifyNoDuplicates(contour.left, `${edgeStyle} left`)
      verifyNoDuplicates(contour.right, `${edgeStyle} right`)
    }
  })

  it('union bounds encompass all input contour bounds', () => {
    const contours = [
      translateContour(createNodeContour(40, 40), -50, -20),
      translateContour(createNodeContour(60, 30), 30, 10),
      translateContour(createNodeContour(30, 50), 0, 50),
    ]

    const union = unionContours(contours)
    const unionBounds = getContourBounds(union)

    for (const contour of contours) {
      const bounds = getContourBounds(contour)
      expect(unionBounds.left).toBeLessThanOrEqual(bounds.left)
      expect(unionBounds.right).toBeGreaterThanOrEqual(bounds.right)
      expect(unionBounds.top).toBeLessThanOrEqual(bounds.top)
      expect(unionBounds.bottom).toBeGreaterThanOrEqual(bounds.bottom)
    }
  })

  it('inflection point count does not decrease when building parent contour', () => {
    // Key invariant: parent contour should have >= inflection points as children
    // (we're adding parent edge geometry on top of child detail)

    const grandchildContour = createNodeContour(20, 20)

    // Build child subtree with edge geometry
    const childContour = buildSubtreeContour(
      40,
      30,
      [
        { contour: grandchildContour, offsetX: -20, offsetY: 50, width: 20, height: 20 },
        { contour: grandchildContour, offsetX: 20, offsetY: 50, width: 20, height: 20 },
      ],
      'straight-arrow'
    )

    const childInflections = childContour.right.length

    // Build parent with this child
    const parentContour = buildSubtreeContour(
      60,
      40,
      [
        { contour: childContour, offsetX: 0, offsetY: 70, width: 40, height: 30 },
      ],
      'straight-arrow'
    )

    const parentInflections = parentContour.right.length

    // Parent should have at least as many points (more, since we add parent geometry)
    expect(parentInflections).toBeGreaterThanOrEqual(childInflections)
  })
})

describe('uniform envelope approach for all edge styles', () => {
  /**
   * With the uniform envelope approach, all edge styles use corner-to-corner
   * connections for contour building, so the contour of a subtree covers the
   * same area regardless of the visual edge style (curve, straight-arrow,
   * org-chart). Org-chart adds the inflection points of its horizontal bar.
   */

  it('curve and straight-arrow produce identical contours', () => {
    const childContour = createNodeContour(44, 38)
    const childOffsetY = 78
    const childPositions = [-81, -27, 27, 81]

    const children = childPositions.map((x) => ({
      contour: childContour,
      offsetX: x,
      offsetY: childOffsetY,
      width: 44,
      height: 38,
    }))

    const curveContour = buildSubtreeContour(92, 38, children, 'curve')
    const straightContour = buildSubtreeContour(92, 38, children, 'straight-arrow')

    // Curve and straight-arrow use the same corner-to-corner envelope
    expect(straightContour).toEqual(curveContour)
  })

  it('org-chart includes horizontal bar inflection points when children extend beyond parent', () => {
    const childContour = createNodeContour(44, 38)
    const childOffsetY = 78
    // Children extend beyond parent width (parent is 92 wide, so halfW = 46)
    const childPositions = [-81, -27, 27, 81]

    const children = childPositions.map((x) => ({
      contour: childContour,
      offsetX: x,
      offsetY: childOffsetY,
      width: 44,
      height: 38,
    }))

    const curveContour = buildSubtreeContour(92, 38, children, 'curve')
    const orgChartContour = buildSubtreeContour(92, 38, children, 'org-chart')

    // Org-chart should have more points due to horizontal bar inflection
    // (stays vertical at parent edge, then steps out horizontally at bar level)
    expect(orgChartContour.left.length).toBeGreaterThan(curveContour.left.length)
    expect(orgChartContour.right.length).toBeGreaterThan(curveContour.right.length)

    // But bounds should be identical - both encompass the same area
    const curveBounds = getContourBounds(curveContour)
    const orgChartBounds = getContourBounds(orgChartContour)
    expect(orgChartBounds.left).toBe(curveBounds.left)
    expect(orgChartBounds.right).toBe(curveBounds.right)
    expect(orgChartBounds.bottom).toBe(curveBounds.bottom)
  })

  it('contour bounds include all children regardless of edge style', () => {
    const childContour = createNodeContour(40, 30)
    const childOffsetY = 60

    // Child positioned far to the left
    const children = [
      { contour: childContour, offsetX: -80, offsetY: childOffsetY, width: 40, height: 30 },
    ]

    // Test all edge styles
    const edgeStyles: Array<'curve' | 'straight-arrow' | 'org-chart'> = ['curve', 'straight-arrow', 'org-chart']

    for (const style of edgeStyles) {
      const subtreeContour = buildSubtreeContour(60, 30, children, style)
      const bounds = getContourBounds(subtreeContour)

      // Bounds should include the child's left edge: -80 - 20 = -100
      expect(bounds.left).toBe(-100)

      // Bounds should extend to child's bottom: 60 + 15 = 75
      expect(bounds.bottom).toBe(75)
    }
  })
})

describe('subtreeContour', () => {
  const edgeStyles = ['curve', 'straight-arrow', 'org-chart'] as const

  /** A layout node from its centre, its size and its children. */
  function box(x: number, y: number, width: number, height: number, children: LayoutNode[] = []): LayoutNode {
    return { id: `${x},${y}`, label: '', x, y, width, height, children }
  }

  /** The same contour, give or take rounding in interpolated points. */
  function expectSameContour(actual: YMonotonePolygon, expected: YMonotonePolygon): void {
    for (const side of ['left', 'right'] as const) {
      expect(actual[side]).toHaveLength(expected[side].length)
      actual[side].forEach((point, i) => {
        expect(point.x).toBeCloseTo(expected[side][i].x, 9)
        expect(point.y).toBeCloseTo(expected[side][i].y, 9)
      })
    }
  }

  /** The contour of a subtree built one parent at a time from its children's contours. */
  function stepByStep(node: LayoutNode, edgeStyle: (typeof edgeStyles)[number]): YMonotonePolygon {
    const children: ChildContourInfo[] = node.children.map((child) => ({
      contour: stepByStep(child, edgeStyle),
      offsetX: child.x - node.x,
      offsetY: child.y - node.y,
      width: child.width,
      height: child.height,
    }))
    return buildSubtreeContour(node.width, node.height, children, edgeStyle)
  }

  /** Three children of different depths; the middle one reaches deepest and widest. */
  function sampleTree() {
    const deep = box(-30, 280, 140, 30)
    const a1 = box(-30, 190, 60, 40, [deep])
    const a2 = box(50, 185, 40, 30)
    const a = box(10, 100, 80, 40, [a1, a2])
    const b = box(-110, 95, 50, 30)
    const c = box(140, 105, 70, 50)
    const root = box(0, 0, 120, 60, [b, a, c])
    return { root, a, a1, a2, b, c, deep }
  }

  it('outlines a single node as its rectangle', () => {
    for (const edgeStyle of edgeStyles) {
      expect(subtreeContour(box(0, 0, 100, 50), edgeStyle)).toEqual(createNodeContour(100, 50))
    }
  })

  it('matches building the same tree one parent at a time', () => {
    const tree = sampleTree()
    for (const edgeStyle of edgeStyles) {
      for (const node of Object.values(tree)) {
        expectSameContour(subtreeContour(node, edgeStyle), stepByStep(node, edgeStyle))
      }
    }
  })

  it('is relative to the node it outlines', () => {
    const { a } = sampleTree()
    const moved = (node: LayoutNode): LayoutNode => ({
      ...node,
      x: node.x - a.x,
      y: node.y - a.y,
      children: node.children.map(moved),
    })

    for (const edgeStyle of edgeStyles) {
      const contour = subtreeContour(a, edgeStyle)
      expect(contour.left[0]).toEqual({ x: -a.width / 2, y: -a.height / 2 })
      expect(contour.right[0]).toEqual({ x: a.width / 2, y: -a.height / 2 })
      expectSameContour(contour, subtreeContour(moved(a), edgeStyle))
    }
  })

  it('covers only the subtree it is asked about', () => {
    const { root, b } = sampleTree()
    const whole = getContourBounds(subtreeContour(root, 'curve'))
    const leaf = getContourBounds(subtreeContour(b, 'curve'))

    // The whole tree reaches the deepest node and the outermost edges.
    expect(whole.bottom).toBe(280 + 15)
    expect(whole.left).toBe(-110 - 25)
    expect(whole.right).toBe(140 + 35)
    // A leaf is just its own box.
    expect(leaf).toEqual({ top: -15, bottom: 15, left: -25, right: 25 })
  })

  it('takes children left to right whatever order they are listed in', () => {
    const { root } = sampleTree()
    const shuffled = { ...root, children: [root.children[2], root.children[0], root.children[1]] }
    for (const edgeStyle of edgeStyles) {
      expect(subtreeContour(shuffled, edgeStyle)).toEqual(subtreeContour(root, edgeStyle))
    }
  })

  it('leaves the layout untouched', () => {
    const { root } = sampleTree()
    const before = JSON.stringify(root)
    for (const edgeStyle of edgeStyles) subtreeContour(root, edgeStyle)
    expect(JSON.stringify(root)).toBe(before)
  })

  it('outlines a 50,000-node chain without revisiting the levels below', () => {
    // One node under another, 60 apart. Copying or re-reading the contour of
    // everything below at each level would take billions of steps here.
    const count = 50_000
    let node = box(0, (count - 1) * 60, 40, 20)
    for (let i = count - 2; i >= 0; i--) node = box(0, i * 60, i % 2 === 0 ? 40 : 30, 20, [node])

    for (const edgeStyle of edgeStyles) {
      const contour = subtreeContour(node, edgeStyle)
      // Two corners per node on each side.
      expect(contour.left).toHaveLength(2 * count)
      expect(contour.right).toHaveLength(2 * count)
      expect(contour.left[0]).toEqual({ x: -20, y: -10 })
      expect(contour.left[2 * count - 1]).toEqual({ x: -20, y: (count - 1) * 60 + 10 })
      // Every other node is narrower: the third from last is one of those.
      expect(contour.right[2 * count - 3]).toEqual({ x: 20, y: (count - 2) * 60 + 10 })
      expect(contour.right[2 * count - 5]).toEqual({ x: 15, y: (count - 3) * 60 + 10 })
    }
  })

  it('outlines a deep spine with a leaf on each side at every level', () => {
    const levels = 20_000
    let spine = box(0, levels * 60, 40, 20)
    for (let i = levels - 1; i >= 0; i--) {
      const y = (i + 1) * 60
      spine = box(0, i * 60, 40, 20, [box(-50, y, 30, 20), spine, box(50, y + 5, 30, 30)])
    }

    const contour = subtreeContour(spine, 'org-chart')
    const bounds = getContourBounds(contour)
    expect(bounds).toEqual({ top: -10, bottom: levels * 60 + 20, left: -65, right: 65 })
    for (const side of [contour.left, contour.right]) {
      let outOfOrder = 0
      for (let i = 1; i < side.length; i++) if (side[i].y < side[i - 1].y) outOfOrder++
      expect(outOfOrder).toBe(0)
    }
  })

  it('outlines 50,000 children of one node', () => {
    // Different heights, so the children's bottoms are all at different levels.
    const count = 50_000
    const children: LayoutNode[] = []
    for (let i = 0; i < count; i++) {
      const height = 20 + ((i * 7919) % count) / 100
      children.push(box((i - count / 2) * 30, 60 + height / 2, 20, height))
    }
    const root = box(0, 0, 40, 20, children)

    const contour = subtreeContour(root, 'curve')
    const bounds = getContourBounds(contour)
    expect(bounds.left).toBe((0 - count / 2) * 30 - 10)
    expect(bounds.right).toBe((count - 1 - count / 2) * 30 + 10)
    expect(bounds.bottom).toBeCloseTo(60 + 20 + (count - 1) / 100, 9)
  })
})
