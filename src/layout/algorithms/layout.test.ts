import { describe, it, expect } from 'vitest'
import { boundingBoxLayout } from './boundingBox'
import { tidyLayout } from './tidy'
import type { TreeNode, TreeExample } from '@/types'
import type { LayoutContext, LaidOutChild, TextMeasurer } from '../types'

/**
 * Create a mock text measurer that returns predictable dimensions.
 * Width = length * 8, Height = 20 (single line)
 */
function createMockTextMeasurer(): TextMeasurer {
  return {
    measure(label: string, padding: number) {
      const lines = label.split('\n')
      const maxLineLength = Math.max(...lines.map((l) => l.length))
      const width = maxLineLength * 8 + padding * 2
      const height = lines.length * 18 + padding * 2
      return { width, height, lines }
    },
  }
}

/**
 * Create a mock TreeExample for testing
 */
function createMockTreeData(overrides: Partial<TreeExample> = {}): TreeExample {
  return {
    id: 'test',
    name: 'Test Tree',
    sizingMode: 'fit-content',
    root: { id: 'root', label: 'Root' },
    ...overrides,
  }
}

/**
 * Create a mock LayoutContext
 */
function createMockContext(overrides: Partial<LayoutContext> = {}): LayoutContext {
  return {
    measureText: createMockTextMeasurer(),
    treeData: createMockTreeData(),
    layout: {
      algorithm: 'bounding-box',
      horizontalGap: 10,
      verticalGap: 40,
      reduceLeafSiblingGaps: false,
    },
    padding: 10,
    edgeStyle: 'org-chart',
    ...overrides,
  }
}

/**
 * Create a simple tree node
 */
function node(label: string, children?: TreeNode[]): TreeNode {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    children,
  }
}

/**
 * Helper to lay out children first (simulating the recursive layout process)
 */
function layoutChildren(
  children: TreeNode[],
  context: LayoutContext,
  algorithm: typeof boundingBoxLayout
): LaidOutChild[] {
  return children.map((child) => ({
    node: child,
    layout: algorithm(child, layoutChildren(child.children ?? [], context, algorithm), context),
  }))
}

describe('boundingBoxLayout', () => {
  describe('single node (no children)', () => {
    it('positions node at origin', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.root.x).toBe(0)
      expect(result.root.y).toBe(0)
    })

    it('calculates dimensions from text measurement', () => {
      const context = createMockContext()
      const testNode = node('Hello') // 5 chars * 8 + 20 padding = 60

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.root.width).toBe(60) // 5 * 8 + 10 * 2
      expect(result.root.height).toBe(38) // 18 + 10 * 2
    })

    it('returns centered bounds', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.bounds.left).toBe(-result.root.width / 2)
      expect(result.bounds.right).toBe(result.root.width / 2)
      expect(result.bounds.top).toBe(-result.root.height / 2)
      expect(result.bounds.bottom).toBe(result.root.height / 2)
    })

    it('creates polygon contour matching node size', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.polygonContour.left.length).toBeGreaterThan(0)
      expect(result.polygonContour.right.length).toBeGreaterThan(0)
      // Left boundary should be at -width/2, right at +width/2
      expect(result.polygonContour.left[0].x).toBe(-result.root.width / 2)
      expect(result.polygonContour.right[0].x).toBe(result.root.width / 2)
    })
  })

  describe('parent with children', () => {
    it('positions single child below parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Child should be below parent
      expect(result.root.children[0].y).toBeGreaterThan(result.root.y)
    })

    it('centers single child under parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Child should be centered (x = 0 since parent is at x = 0)
      expect(result.root.children[0].x).toBe(0)
    })

    it('spreads multiple children horizontally', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // First child should be left of second child
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
    })

    it('aligns child tops (top-align characteristic)', () => {
      const context = createMockContext()
      const parent = node('Parent')
      // Create children with different heights by using multi-line labels
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild')
      const laidOutChildren = layoutChildren([shortChild, tallChild], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Both children should have the same top (top alignment)
      const shortTop = result.root.children[0].y - result.root.children[0].height / 2
      const tallTop = result.root.children[1].y - result.root.children[1].height / 2
      expect(shortTop).toBeCloseTo(tallTop, 5)
    })

    it('respects vertical gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 10, verticalGap: 100, reduceLeafSiblingGaps: false },
      })
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Gap should be at least verticalGap
      const parentBottom = result.root.y + result.root.height / 2
      const childTop = result.root.children[0].y - result.root.children[0].height / 2
      expect(childTop - parentBottom).toBeGreaterThanOrEqual(100)
    })

    it('respects horizontal gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 50, verticalGap: 40, reduceLeafSiblingGaps: false },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeCloseTo(50, 0)
    })

    it('reduces gap for leaf siblings when enabled', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeCloseTo(20, 0)
    })

    it('maintains full gap between non-leaf siblings when reduceLeafSiblingGaps is enabled', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      // Both children have their own children, so they're not leaves
      const child1 = node('A', [node('A1')])
      const child2 = node('B', [node('B1')])
      const laidOutChildren = layoutChildren([child1, child2], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Gap between non-leaf siblings should be full horizontalGap (40), not reduced
      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeGreaterThanOrEqual(40 - 1)
    })

    it('uses mixed gaps for mixed leaf/non-leaf siblings', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      // Mix: leaf, non-leaf, leaf
      const child1 = node('A')                    // leaf
      const child2 = node('B', [node('B1')])      // non-leaf
      const child3 = node('C')                    // leaf
      const laidOutChildren = layoutChildren([child1, child2, child3], context, boundingBoxLayout)

      const result = boundingBoxLayout(parent, laidOutChildren, context)

      // Gap between A (leaf) and B (non-leaf) should be full gap
      const gapAB =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)

      // Gap between B (non-leaf) and C (leaf) should be full gap
      const gapBC =
        result.root.children[2].x -
        result.root.children[2].width / 2 -
        (result.root.children[1].x + result.root.children[1].width / 2)

      expect(gapAB).toBeGreaterThanOrEqual(40 - 1)
      expect(gapBC).toBeGreaterThanOrEqual(40 - 1)
    })
  })

  describe('nested tree (3 levels)', () => {
    it('correctly positions all levels', () => {
      const context = createMockContext()
      const tree = node('Root', [node('A', [node('A1'), node('A2')]), node('B', [node('B1')])])
      const laidOutChildren = layoutChildren(tree.children!, context, boundingBoxLayout)

      const result = boundingBoxLayout(tree, laidOutChildren, context)

      // Root at level 0
      expect(result.root.y).toBe(0)

      // Children at level 1 (below root)
      const levelOneY = result.root.children[0].y
      expect(levelOneY).toBeGreaterThan(0)

      // Grandchildren at level 2 (below level 1)
      const a1 = result.root.children[0].children[0]
      expect(a1.y).toBeGreaterThan(levelOneY)
    })

    it('computes bounds encompassing entire subtree', () => {
      const context = createMockContext()
      const tree = node('Root', [node('Wide Child With Long Label')])
      const laidOutChildren = layoutChildren(tree.children!, context, boundingBoxLayout)

      const result = boundingBoxLayout(tree, laidOutChildren, context)

      // Bounds should include the wide child
      expect(result.bounds.right - result.bounds.left).toBeGreaterThan(result.root.width)
    })
  })

  describe('fixed sizing mode', () => {
    it('uses fixed dimensions when specified', () => {
      const context = createMockContext({
        treeData: createMockTreeData({ sizingMode: 'fixed', nodeWidth: 80, nodeHeight: 50 }),
      })
      const testNode = node('Short')

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.root.width).toBe(80)
      expect(result.root.height).toBe(50)
    })

    it('uses per-node dimensions over fixed dimensions', () => {
      const context = createMockContext({
        treeData: createMockTreeData({ sizingMode: 'fixed', nodeWidth: 80, nodeHeight: 50 }),
      })
      const testNode: TreeNode = { id: 'test', label: 'Test', width: 100, height: 60 }

      const result = boundingBoxLayout(testNode, [], context)

      expect(result.root.width).toBe(100)
      expect(result.root.height).toBe(60)
    })
  })
})

describe('polygon contour correctness', () => {
  it('single node polygon contour has correct bounds', () => {
    const context = createMockContext()
    const testNode = node('Test')

    const result = boundingBoxLayout(testNode, [], context)

    // Left boundary should start at top-left and go to bottom-left
    expect(result.polygonContour.left[0].x).toBe(-result.root.width / 2)
    expect(result.polygonContour.left[0].y).toBe(-result.root.height / 2)

    // Right boundary should start at top-right and go to bottom-right
    expect(result.polygonContour.right[0].x).toBe(result.root.width / 2)
    expect(result.polygonContour.right[0].y).toBe(-result.root.height / 2)
  })

  it('parent with children has polygon contour extending to children', () => {
    const context = createMockContext()
    const parent = node('Parent')
    const child = node('Child')
    const laidOutChildren = layoutChildren([child], context, boundingBoxLayout)

    const result = boundingBoxLayout(parent, laidOutChildren, context)

    // The polygon contour should exist and have vertices
    expect(result.polygonContour.left.length).toBeGreaterThan(0)
    expect(result.polygonContour.right.length).toBeGreaterThan(0)

    // The polygon contour should extend down to the child
    const childBottom = result.root.children[0].y + result.root.children[0].height / 2
    const contourBottomY = Math.max(
      ...result.polygonContour.left.map(p => p.y),
      ...result.polygonContour.right.map(p => p.y)
    )
    expect(contourBottomY).toBeCloseTo(childBottom, 1)
  })

  it('polygon contour is attached to layout nodes', () => {
    const context = createMockContext()
    const tree = node('Root', [node('A'), node('B')])
    const laidOutChildren = layoutChildren(tree.children!, context, boundingBoxLayout)

    const result = boundingBoxLayout(tree, laidOutChildren, context)

    // Root should have polygon contour
    expect(result.root.polygonContour).toBeDefined()
    expect(result.root.polygonContour!.left.length).toBeGreaterThan(0)
    expect(result.root.polygonContour!.right.length).toBeGreaterThan(0)
  })
})

describe('layout edge cases', () => {
  it('handles very long labels', () => {
    const context = createMockContext()
    const longLabel = 'A'.repeat(100)
    const testNode = node(longLabel)

    const result = boundingBoxLayout(testNode, [], context)

    expect(result.root.width).toBe(100 * 8 + 20) // 100 chars * 8 + padding
  })

  it('handles multi-line labels', () => {
    const context = createMockContext()
    const testNode = node('Line 1\nLine 2\nLine 3')

    const result = boundingBoxLayout(testNode, [], context)

    // Height should account for 3 lines
    expect(result.root.height).toBe(3 * 18 + 20) // 3 lines * 18 + padding
  })

  it('handles empty label', () => {
    const context = createMockContext()
    const testNode = node('')

    const result = boundingBoxLayout(testNode, [], context)

    // Should still have some width from padding
    expect(result.root.width).toBe(20) // Just padding
  })

  it('handles many children', () => {
    const context = createMockContext()
    const children = Array.from({ length: 20 }, (_, i) => node(`Child ${i}`))
    const laidOutChildren = layoutChildren(children, context, boundingBoxLayout)
    const parent = node('Parent')

    const result = boundingBoxLayout(parent, laidOutChildren, context)

    expect(result.root.children).toHaveLength(20)
    // All children should have unique x positions
    const xPositions = result.root.children.map((c) => c.x)
    const uniquePositions = new Set(xPositions)
    expect(uniquePositions.size).toBe(20)
  })

  it('handles deep nesting', () => {
    const context = createMockContext()

    // Create a deeply nested tree: A -> B -> C -> D -> E
    const e = node('E')
    const d = node('D', [e])
    const c = node('C', [d])
    const b = node('B', [c])
    const a = node('A', [b])

    const laidOutChildren = layoutChildren([b], context, boundingBoxLayout)
    const result = boundingBoxLayout(a, laidOutChildren, context)

    // Each level should be progressively lower
    let prevY = result.root.y
    let current = result.root.children[0]
    while (current) {
      expect(current.y).toBeGreaterThan(prevY)
      prevY = current.y
      current = current.children?.[0]
    }
  })
})

describe('tidyLayout', () => {
  describe('single node (no children)', () => {
    it('positions node at origin', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = tidyLayout(testNode, [], context)

      expect(result.root.x).toBe(0)
      expect(result.root.y).toBe(0)
    })

    it('returns same result as other algorithms for single node', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const tidyResult = tidyLayout(testNode, [], context)
      const boundingBoxResult = boundingBoxLayout(testNode, [], context)

      expect(tidyResult.root.width).toBe(boundingBoxResult.root.width)
      expect(tidyResult.root.height).toBe(boundingBoxResult.root.height)
      expect(tidyResult.bounds).toEqual(boundingBoxResult.bounds)
    })

    it('creates polygon contour matching node size', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = tidyLayout(testNode, [], context)

      expect(result.polygonContour.left.length).toBeGreaterThan(0)
      expect(result.polygonContour.right.length).toBeGreaterThan(0)
      expect(result.polygonContour.left[0].x).toBe(-result.root.width / 2)
      expect(result.polygonContour.right[0].x).toBe(result.root.width / 2)
    })
  })

  describe('parent with children', () => {
    it('positions single child below parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.root.children[0].y).toBeGreaterThan(result.root.y)
    })

    it('centers single child under parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      // Child should be centered (x = 0 since parent is at x = 0)
      expect(result.root.children[0].x).toBe(0)
    })

    it('spreads multiple children horizontally', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const laidOutChildren = layoutChildren(
        [node('Child1'), node('Child2'), node('Child3')],
        context,
        tidyLayout
      )

      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
      expect(result.root.children[1].x).toBeLessThan(result.root.children[2].x)
    })

    it('aligns child tops (top-align characteristic)', () => {
      const context = createMockContext()
      const parent = node('Parent')
      // Create children with different heights
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild\nHere')

      const laidOutChildren = layoutChildren([shortChild, tallChild], context, tidyLayout)
      const result = tidyLayout(parent, laidOutChildren, context)

      // Top edges should be at the same y
      const shortTop = result.root.children[0].y - result.root.children[0].height / 2
      const tallTop = result.root.children[1].y - result.root.children[1].height / 2
      expect(shortTop).toBeCloseTo(tallTop, 5)
    })

    it('respects vertical gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 100, reduceLeafSiblingGaps: false },
      })
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      const parentBottom = result.root.y + result.root.height / 2
      const childTop = result.root.children[0].y - result.root.children[0].height / 2
      expect(childTop - parentBottom).toBeGreaterThanOrEqual(100)
    })

    it('respects horizontal gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 50, verticalGap: 40, reduceLeafSiblingGaps: false },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      // Gap between children's bounding boxes should be at least the horizontal gap
      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeGreaterThanOrEqual(50 - 1) // Allow small floating point tolerance
    })

    it('reduces gap for leaf siblings when enabled', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeCloseTo(20, 1)
    })

    it('maintains full gap between non-leaf siblings when reduceLeafSiblingGaps is enabled', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      // Both children have their own children, so they're not leaves
      const child1 = node('A', [node('A1')])
      const child2 = node('B', [node('B1')])
      const laidOutChildren = layoutChildren([child1, child2], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      // Gap between non-leaf siblings should be at least full horizontalGap (40)
      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeGreaterThanOrEqual(40 - 1)
    })

    it('uses mixed gaps for mixed leaf/non-leaf siblings', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      // Mix: leaf, non-leaf, leaf
      const child1 = node('A')                    // leaf
      const child2 = node('B', [node('B1')])      // non-leaf
      const child3 = node('C')                    // leaf
      const laidOutChildren = layoutChildren([child1, child2, child3], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      // Gap between A (leaf) and B (non-leaf) should be at least full gap
      const gapAB =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)

      // Gap between B (non-leaf) and C (leaf) should be at least full gap
      const gapBC =
        result.root.children[2].x -
        result.root.children[2].width / 2 -
        (result.root.children[1].x + result.root.children[1].width / 2)

      expect(gapAB).toBeGreaterThanOrEqual(40 - 1)
      expect(gapBC).toBeGreaterThanOrEqual(40 - 1)
    })

    it('reduces gaps for consecutive leaf siblings in a larger group', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 40, verticalGap: 40, reduceLeafSiblingGaps: true },
      })
      const parent = node('Parent')
      // All leaves: A, B, C, D
      const children = [node('A'), node('B'), node('C'), node('D')]
      const laidOutChildren = layoutChildren(children, context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      // All gaps between consecutive leaves should be reduced (close to 20)
      for (let i = 0; i < result.root.children.length - 1; i++) {
        const gap =
          result.root.children[i + 1].x -
          result.root.children[i + 1].width / 2 -
          (result.root.children[i].x + result.root.children[i].width / 2)
        // With apportionment, gaps may vary slightly but should be around 20
        expect(gap).toBeGreaterThanOrEqual(20 - 1)
        expect(gap).toBeLessThanOrEqual(25)
      }
    })
  })

  describe('reflective symmetry', () => {
    it('produces mirrored layout for mirrored tree', () => {
      const context = createMockContext()

      // Create an asymmetric tree
      const tree = node('Root', [
        node('A', [node('A1'), node('A2'), node('A3')]),
        node('B'),
        node('C', [node('C1')]),
      ])

      // Create its mirror (reverse children at all levels)
      const mirrorTree = node('Root', [
        node('C', [node('C1')]),
        node('B'),
        node('A', [node('A3'), node('A2'), node('A1')]),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      const mirrorLaidOutChildren = layoutChildren(mirrorTree.children!, context, tidyLayout)
      const mirrorResult = tidyLayout(mirrorTree, mirrorLaidOutChildren, context)

      // The layouts should be reflections of each other
      // Child positions should be negated (mirrored around x=0)
      for (let i = 0; i < result.root.children.length; i++) {
        const originalChild = result.root.children[i]
        const mirrorChild = mirrorResult.root.children[result.root.children.length - 1 - i]
        expect(originalChild.x).toBeCloseTo(-mirrorChild.x, 5)
      }
    })

    it('produces symmetric layout for symmetric tree', () => {
      const context = createMockContext()

      // Create a symmetric tree with same-width labels for true symmetry
      const tree = node('Root', [node('AAA'), node('BBB'), node('CCC')])
      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // Center child should be at x=0
      expect(result.root.children[1].x).toBeCloseTo(0, 5)

      // Left and right children should be equidistant from center
      expect(Math.abs(result.root.children[0].x)).toBeCloseTo(
        Math.abs(result.root.children[2].x),
        5
      )
      expect(result.root.children[0].x).toBeCloseTo(-result.root.children[2].x, 5)
    })

    it('handles asymmetric subtrees with contour compaction', () => {
      const context = createMockContext()

      // Create tree with asymmetric subtrees
      const tree = node('Root', [
        node('A', [node('A1', [node('A11')])]),
        node('B'),
        node('C'),
        node('D'),
      ])

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // Tidy should produce a valid layout for asymmetric subtrees
      expect(tidyResult.root.children).toHaveLength(4)

      // All children should be placed left-to-right
      for (let i = 0; i < tidyResult.root.children.length - 1; i++) {
        expect(tidyResult.root.children[i].x).toBeLessThan(tidyResult.root.children[i + 1].x)
      }

      // All children should have valid positions
      for (const child of tidyResult.root.children) {
        expect(isFinite(child.x)).toBe(true)
        expect(isFinite(child.y)).toBe(true)
      }
    })
  })

  describe('apportionment (even gap distribution)', () => {
    it('distributes gaps evenly when deep subtree causes shift', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Create tree where first child has deep right-extending subtree
      // that would push the last child far right in LR Squeeze
      const tree = node('Root', [
        node('A', [node('A1', [node('A11', [node('A111')])])]),
        node('B'),
        node('C'),
        node('D'),
        node('E'),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // Calculate gaps between adjacent children (at root level)
      const gaps: number[] = []
      for (let i = 0; i < result.root.children.length - 1; i++) {
        const leftRight = result.root.children[i].x + result.root.children[i].width / 2
        const rightLeft = result.root.children[i + 1].x - result.root.children[i + 1].width / 2
        gaps.push(rightLeft - leftRight)
      }

      // Apportionment should keep gaps reasonably even
      // With stricter gap enforcement for Y-adjacent regions, some variation is expected
      // Check that standard deviation is reasonable relative to mean
      const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
      const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length
      const stdDev = Math.sqrt(variance)

      // Standard deviation should be less than half the average gap
      // This allows for variation while ensuring gaps are "reasonably even"
      expect(stdDev).toBeLessThan(avgGap * 0.5)

      // All gaps should be at least the minimum gap
      for (const gap of gaps) {
        expect(gap).toBeGreaterThanOrEqual(10 - 1)
      }
    })

    it('maintains minimum gap even with apportionment', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 20, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      const tree = node('Root', [
        node('A', [node('A1')]),
        node('B'),
        node('C'),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // All gaps should be at least horizontalGap
      for (let i = 0; i < result.root.children.length - 1; i++) {
        const leftRight = result.root.children[i].x + result.root.children[i].width / 2
        const rightLeft = result.root.children[i + 1].x - result.root.children[i + 1].width / 2
        const gap = rightLeft - leftRight
        expect(gap).toBeGreaterThanOrEqual(20 - 1) // Allow small tolerance
      }
    })

    it('produces reasonably even gaps for asymmetric trees', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Asymmetric tree: first child has deep subtree
      const tree = node('Root', [
        node('A', [node('A1', [node('A11')])]),
        node('B'),
        node('C'),
        node('D'),
      ])

      // Get Tidy layout
      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // Calculate gap variance
      const gaps: number[] = []
      for (let i = 0; i < tidyResult.root.children.length - 1; i++) {
        const leftRight = tidyResult.root.children[i].x + tidyResult.root.children[i].width / 2
        const rightLeft = tidyResult.root.children[i + 1].x - tidyResult.root.children[i + 1].width / 2
        gaps.push(rightLeft - leftRight)
      }
      const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
      const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length
      const stdDev = Math.sqrt(variance)

      // Tidy should have reasonably even gaps (standard deviation less than half the average)
      expect(stdDev).toBeLessThan(avgGap * 0.5)

      // All gaps should be at least the minimum gap
      for (const gap of gaps) {
        expect(gap).toBeGreaterThanOrEqual(10 - 1)
      }
    })
  })

  describe('contour-based compaction', () => {
    it('uses contour-based spacing for subtrees with different shapes', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      const leftSubtree = node('L', [node('LL')])
      const rightSubtree = node('R', [node('RR')])

      const parent = node('Parent')
      const laidOutChildren = layoutChildren([leftSubtree, rightSubtree], context, tidyLayout)
      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.root.children).toHaveLength(2)
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
    })

    it('compacts multiple children correctly', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      const children = [
        node('A', [node('A1')]),
        node('B'),
        node('C', [node('C1', [node('C11')])]),
        node('D'),
      ]

      const parent = node('Parent')
      const laidOutChildren = layoutChildren(children, context, tidyLayout)
      const result = tidyLayout(parent, laidOutChildren, context)

      // All children should be placed left-to-right
      for (let i = 0; i < result.root.children.length - 1; i++) {
        expect(result.root.children[i].x).toBeLessThan(result.root.children[i + 1].x)
      }

      // All children should have valid positions
      for (const child of result.root.children) {
        expect(isFinite(child.x)).toBe(true)
        expect(isFinite(child.y)).toBe(true)
      }
    })
  })

  describe('parent centering', () => {
    it('centers parent over children forest', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const laidOutChildren = layoutChildren(
        [node('Child1'), node('Child2'), node('Child3')],
        context,
        tidyLayout
      )

      const result = tidyLayout(parent, laidOutChildren, context)

      // Parent is at x=0
      expect(result.root.x).toBe(0)

      // Children should be centered around x=0
      const childrenLeft = Math.min(...result.root.children.map((c) => c.x - c.width / 2))
      const childrenRight = Math.max(...result.root.children.map((c) => c.x + c.width / 2))
      const childrenCenter = (childrenLeft + childrenRight) / 2

      expect(childrenCenter).toBeCloseTo(0, 5)
    })
  })

  describe('nested tree (3 levels)', () => {
    it('correctly positions all levels', () => {
      const context = createMockContext()
      const tree = node('Root', [node('A', [node('A1'), node('A2')]), node('B', [node('B1')])])
      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)

      const result = tidyLayout(tree, laidOutChildren, context)

      // Root at level 0
      expect(result.root.y).toBe(0)

      // Children at level 1 (below root)
      const levelOneY = result.root.children[0].y
      expect(levelOneY).toBeGreaterThan(0)

      // Grandchildren at level 2 (below level 1)
      const a1 = result.root.children[0].children[0]
      expect(a1.y).toBeGreaterThan(levelOneY)
    })
  })

  describe('edge cases', () => {
    it('handles two children correctly', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const laidOutChildren = layoutChildren([node('A'), node('B')], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.root.children).toHaveLength(2)
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
      // Should be symmetric around center
      expect(result.root.children[0].x).toBeCloseTo(-result.root.children[1].x, 5)
    })

    it('handles many children', () => {
      const context = createMockContext()
      const children = Array.from({ length: 10 }, (_, i) => node(`Child${i}`))
      const laidOutChildren = layoutChildren(children, context, tidyLayout)
      const parent = node('Parent')

      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.root.children).toHaveLength(10)
      // All children should have unique x positions
      const xPositions = result.root.children.map((c) => c.x)
      const uniquePositions = new Set(xPositions)
      expect(uniquePositions.size).toBe(10)
    })
  })

  describe('polygon contour correctness', () => {
    it('parent with children has polygon contour extending to children', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, tidyLayout)

      const result = tidyLayout(parent, laidOutChildren, context)

      expect(result.polygonContour.left.length).toBeGreaterThan(0)
      expect(result.polygonContour.right.length).toBeGreaterThan(0)

      // The polygon contour should extend down to the child
      const childBottom = result.root.children[0].y + result.root.children[0].height / 2
      const contourBottomY = Math.max(
        ...result.polygonContour.left.map((p) => p.y),
        ...result.polygonContour.right.map((p) => p.y)
      )
      expect(contourBottomY).toBeCloseTo(childBottom, 1)
    })

    it('polygon contour is attached to layout nodes', () => {
      const context = createMockContext()
      const tree = node('Root', [node('A'), node('B')])
      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)

      const result = tidyLayout(tree, laidOutChildren, context)

      expect(result.root.polygonContour).toBeDefined()
      expect(result.root.polygonContour!.left.length).toBeGreaterThan(0)
      expect(result.root.polygonContour!.right.length).toBeGreaterThan(0)
    })
  })
})

describe('error-prone edge cases', () => {
  describe('both algorithms handle edge cases consistently', () => {
    it('handles very deep nesting (6 levels)', () => {
      const context = createMockContext()

      // Create 6-level deep tree
      const tree = node('L1', [
        node('L2', [node('L3', [node('L4', [node('L5', [node('L6')])])])]),
      ])

      // Test boundingBox
      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      // Test tidy
      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // Both should have progressively lower y values at each level
      for (const result of [bbResult, tidyResult]) {
        let current = result.root
        let prevY = current.y
        for (let level = 0; level < 5; level++) {
          current = current.children[0]
          expect(current.y).toBeGreaterThan(prevY)
          prevY = current.y
        }
      }
    })

    it('handles single-child chain (linear tree)', () => {
      const context = createMockContext()

      // Linear tree: A -> B -> C -> D
      const tree = node('A', [node('B', [node('C', [node('D')])])])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // Single-child chain should have all nodes centered (x = 0)
      for (const result of [bbResult, tidyResult]) {
        let current = result.root
        while (current.children.length > 0) {
          expect(current.x).toBe(0)
          current = current.children[0]
        }
        expect(current.x).toBe(0) // Last node too
      }
    })

    it('handles empty labels', () => {
      const context = createMockContext()
      const tree = node('', [node(''), node('')])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        expect(result.root.width).toBeGreaterThan(0) // Still has padding
        expect(result.root.height).toBeGreaterThan(0)
        expect(result.root.children).toHaveLength(2)
      }
    })

    it('handles multiline labels with varying heights', () => {
      const context = createMockContext()

      const tree = node('Parent', [
        node('One\nLine'),
        node('Two\nLines\nHere'),
        node('Single'),
      ])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        // All children should be top-aligned
        const tops = result.root.children.map(c => c.y - c.height / 2)
        for (let i = 1; i < tops.length; i++) {
          expect(tops[i]).toBeCloseTo(tops[0], 5)
        }
      }
    })

    it('handles very wide tree (20 children)', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 5, verticalGap: 20, reduceLeafSiblingGaps: false },
      })

      const children = Array.from({ length: 20 }, (_, i) => node(`N${i}`))
      const tree = node('Root', children)

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        expect(result.root.children).toHaveLength(20)
        // All children should have unique, increasing x positions
        for (let i = 1; i < result.root.children.length; i++) {
          expect(result.root.children[i].x).toBeGreaterThan(result.root.children[i - 1].x)
        }
        // Children should be approximately centered around x=0
        // (small deviation is acceptable due to label width differences)
        const childrenLeft = Math.min(...result.root.children.map((c) => c.x - c.width / 2))
        const childrenRight = Math.max(...result.root.children.map((c) => c.x + c.width / 2))
        const childrenCenter = (childrenLeft + childrenRight) / 2
        expect(Math.abs(childrenCenter)).toBeLessThan(5)
      }
    })

    it('handles zero horizontal gap', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 0, verticalGap: 20, reduceLeafSiblingGaps: false },
      })

      const tree = node('Root', [node('A'), node('B'), node('C')])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        // Children should still be ordered left to right
        expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
        expect(result.root.children[1].x).toBeLessThan(result.root.children[2].x)

        // With zero gap, children should be touching
        const gap =
          result.root.children[1].x -
          result.root.children[1].width / 2 -
          (result.root.children[0].x + result.root.children[0].width / 2)
        expect(gap).toBeCloseTo(0, 1)
      }
    })

    it('handles per-node fixed dimensions', () => {
      const context = createMockContext()

      const tree: TreeNode = {
        id: 'root',
        label: 'Root',
        width: 200,
        height: 80,
        children: [
          { id: 'a', label: 'A', width: 50, height: 30 },
          { id: 'b', label: 'B', width: 100, height: 50 },
        ],
      }

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        expect(result.root.width).toBe(200)
        expect(result.root.height).toBe(80)
        expect(result.root.children[0].width).toBe(50)
        expect(result.root.children[0].height).toBe(30)
        expect(result.root.children[1].width).toBe(100)
        expect(result.root.children[1].height).toBe(50)
      }
    })

    it('handles extreme aspect ratios (very wide nodes)', () => {
      const context = createMockContext()

      const tree: TreeNode = {
        id: 'root',
        label: 'Root',
        width: 500,
        height: 20,
        children: [
          { id: 'a', label: 'A', width: 300, height: 15 },
          { id: 'b', label: 'B', width: 200, height: 25 },
        ],
      }

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        // Wide nodes should still be positioned correctly
        expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
        // Bounds should encompass the wide nodes
        expect(result.bounds.right - result.bounds.left).toBeGreaterThanOrEqual(300)
      }
    })

    it('handles extreme aspect ratios (very tall nodes)', () => {
      const context = createMockContext()

      const tree: TreeNode = {
        id: 'root',
        label: 'Root',
        width: 50,
        height: 200,
        children: [
          { id: 'a', label: 'A', width: 40, height: 150 },
          { id: 'b', label: 'B', width: 60, height: 100 },
        ],
      }

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      for (const result of [bbResult, tidyResult]) {
        // Tall nodes should still be positioned correctly (top-aligned)
        const aTop = result.root.children[0].y - result.root.children[0].height / 2
        const bTop = result.root.children[1].y - result.root.children[1].height / 2
        expect(aTop).toBeCloseTo(bTop, 5)
      }
    })
  })

  describe('bounding-box vs tidy equivalence for simple trees', () => {
    it('produces same layout for symmetric tree with uniform nodes', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Symmetric tree with uniform nodes
      const tree = node('Root', [node('AAA'), node('BBB'), node('CCC')])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // For symmetric trees with no subtrees, both algorithms should produce identical layouts
      for (let i = 0; i < 3; i++) {
        expect(tidyResult.root.children[i].x).toBeCloseTo(bbResult.root.children[i].x, 3)
        expect(tidyResult.root.children[i].y).toBeCloseTo(bbResult.root.children[i].y, 3)
      }
    })

    it('tidy can produce more compact layout than bounding-box for interlocking subtrees', () => {
      const context = createMockContext({
        layout: { algorithm: 'bounding-box', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Tree where left subtree extends right, and right subtree is short
      // Tidy can interlock these, bounding-box cannot
      const tree = node('Root', [
        node('A', [node('A1', [node('A11')])]),
        node('B'),
      ])

      const bbChildren = layoutChildren(tree.children!, context, boundingBoxLayout)
      const bbResult = boundingBoxLayout(tree, bbChildren, context)

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      // Tidy should produce a layout at least as compact as bounding-box
      const bbWidth = bbResult.bounds.right - bbResult.bounds.left
      const tidyWidth = tidyResult.bounds.right - tidyResult.bounds.left
      expect(tidyWidth).toBeLessThanOrEqual(bbWidth + 1) // Allow small tolerance
    })
  })

  describe('contour edge cases', () => {
    it('handles deep left-leaning subtree next to shallow right subtree', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Deep subtree on left, shallow on right
      const tree = node('Root', [
        node('A', [node('A1', [node('A11', [node('A111')])])]),
        node('B'),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // B should be positioned without overlapping A's deep descendants
      expect(result.root.children[1].x).toBeGreaterThan(result.root.children[0].x)
      // Verify no NaN or Infinity
      expect(isFinite(result.root.children[0].x)).toBe(true)
      expect(isFinite(result.root.children[1].x)).toBe(true)
    })

    it('handles deep right-leaning subtree next to shallow left subtree', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Shallow subtree on left, deep on right
      const tree = node('Root', [
        node('A'),
        node('B', [node('B1', [node('B11', [node('B111')])])]),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // A should be positioned without overlapping B's deep descendants
      expect(result.root.children[1].x).toBeGreaterThan(result.root.children[0].x)
      expect(isFinite(result.root.children[0].x)).toBe(true)
      expect(isFinite(result.root.children[1].x)).toBe(true)
    })

    it('handles multiple deep subtrees with varying depths', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40, reduceLeafSiblingGaps: false },
      })

      // Mix of deep and shallow subtrees
      const tree = node('Root', [
        node('A', [node('A1', [node('A11')])]),
        node('B'),
        node('C', [node('C1')]),
        node('D', [node('D1', [node('D11', [node('D111')])])]),
        node('E'),
      ])

      const laidOutChildren = layoutChildren(tree.children!, context, tidyLayout)
      const result = tidyLayout(tree, laidOutChildren, context)

      // All children should be ordered left to right
      for (let i = 0; i < result.root.children.length - 1; i++) {
        expect(result.root.children[i].x).toBeLessThan(result.root.children[i + 1].x)
      }

      // All positions should be valid numbers
      for (const child of result.root.children) {
        expect(isFinite(child.x)).toBe(true)
        expect(isFinite(child.y)).toBe(true)
      }
    })
  })
})
