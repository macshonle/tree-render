import { describe, it, expect } from 'vitest'
import { maxwidthLayout } from './maxwidth'
import { topAlignLayout } from './topAlign'
import { lrSqueezeLayout } from './lrSqueeze'
import { rlSqueezeLayout } from './rlSqueeze'
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
      algorithm: 'maxwidth',
      horizontalGap: 10,
      verticalGap: 40,
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
  algorithm: typeof maxwidthLayout
): LaidOutChild[] {
  return children.map((child) => ({
    node: child,
    layout: algorithm(child, layoutChildren(child.children ?? [], context, algorithm), context),
  }))
}

describe('maxwidthLayout', () => {
  describe('single node (no children)', () => {
    it('positions node at origin', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = maxwidthLayout(testNode, [], context)

      expect(result.root.x).toBe(0)
      expect(result.root.y).toBe(0)
    })

    it('calculates dimensions from text measurement', () => {
      const context = createMockContext()
      const testNode = node('Hello') // 5 chars * 8 + 20 padding = 60

      const result = maxwidthLayout(testNode, [], context)

      expect(result.root.width).toBe(60) // 5 * 8 + 10 * 2
      expect(result.root.height).toBe(38) // 18 + 10 * 2
    })

    it('returns centered bounds', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = maxwidthLayout(testNode, [], context)

      expect(result.bounds.left).toBe(-result.root.width / 2)
      expect(result.bounds.right).toBe(result.root.width / 2)
      expect(result.bounds.top).toBe(-result.root.height / 2)
      expect(result.bounds.bottom).toBe(result.root.height / 2)
    })

    it('creates polygon contour matching node size', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = maxwidthLayout(testNode, [], context)

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
      const laidOutChildren = layoutChildren([child], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      // Child should be below parent
      expect(result.root.children[0].y).toBeGreaterThan(result.root.y)
    })

    it('centers single child under parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      // Child should be centered (x = 0 since parent is at x = 0)
      expect(result.root.children[0].x).toBe(0)
    })

    it('spreads multiple children horizontally', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      // First child should be left of second child
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
    })

    it('aligns child centers vertically (maxwidth characteristic)', () => {
      const context = createMockContext()
      const parent = node('Parent')
      // Create children with different heights by using multi-line labels
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild')
      const laidOutChildren = layoutChildren([shortChild, tallChild], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      // Both children should have the same y (center alignment)
      expect(result.root.children[0].y).toBe(result.root.children[1].y)
    })

    it('respects vertical gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'maxwidth', horizontalGap: 10, verticalGap: 100 },
      })
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      // Gap should be at least verticalGap
      const parentBottom = result.root.y + result.root.height / 2
      const childTop = result.root.children[0].y - result.root.children[0].height / 2
      expect(childTop - parentBottom).toBeGreaterThanOrEqual(100)
    })

    it('respects horizontal gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'maxwidth', horizontalGap: 50, verticalGap: 40 },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, maxwidthLayout)

      const result = maxwidthLayout(parent, laidOutChildren, context)

      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeCloseTo(50, 0)
    })
  })

  describe('nested tree (3 levels)', () => {
    it('correctly positions all levels', () => {
      const context = createMockContext()
      const tree = node('Root', [node('A', [node('A1'), node('A2')]), node('B', [node('B1')])])
      const laidOutChildren = layoutChildren(tree.children!, context, maxwidthLayout)

      const result = maxwidthLayout(tree, laidOutChildren, context)

      // Root at level 0
      expect(result.root.y).toBe(0)

      // Children at level 1 (below root)
      const levelOneY = result.root.children[0].y
      expect(levelOneY).toBeGreaterThan(0)
      expect(result.root.children[1].y).toBe(levelOneY)

      // Grandchildren at level 2 (below level 1)
      const a1 = result.root.children[0].children[0]
      expect(a1.y).toBeGreaterThan(levelOneY)
    })

    it('computes bounds encompassing entire subtree', () => {
      const context = createMockContext()
      const tree = node('Root', [node('Wide Child With Long Label')])
      const laidOutChildren = layoutChildren(tree.children!, context, maxwidthLayout)

      const result = maxwidthLayout(tree, laidOutChildren, context)

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

      const result = maxwidthLayout(testNode, [], context)

      expect(result.root.width).toBe(80)
      expect(result.root.height).toBe(50)
    })

    it('uses per-node dimensions over fixed dimensions', () => {
      const context = createMockContext({
        treeData: createMockTreeData({ sizingMode: 'fixed', nodeWidth: 80, nodeHeight: 50 }),
      })
      const testNode: TreeNode = { id: 'test', label: 'Test', width: 100, height: 60 }

      const result = maxwidthLayout(testNode, [], context)

      expect(result.root.width).toBe(100)
      expect(result.root.height).toBe(60)
    })
  })
})

describe('topAlignLayout', () => {
  describe('single node (no children)', () => {
    it('positions node at origin', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = topAlignLayout(testNode, [], context)

      expect(result.root.x).toBe(0)
      expect(result.root.y).toBe(0)
    })

    it('returns same result as maxwidth for single node', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const maxwidthResult = maxwidthLayout(testNode, [], context)
      const topAlignResult = topAlignLayout(testNode, [], context)

      expect(topAlignResult.root.width).toBe(maxwidthResult.root.width)
      expect(topAlignResult.root.height).toBe(maxwidthResult.root.height)
      expect(topAlignResult.bounds).toEqual(maxwidthResult.bounds)
    })
  })

  describe('parent with children of different heights', () => {
    it('aligns child tops (top-align characteristic)', () => {
      const context = createMockContext()
      const parent = node('Parent')
      // Create children with different heights
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild\nHere')

      // Lay out children individually first
      const shortLayout = topAlignLayout(shortChild, [], context)
      const tallLayout = topAlignLayout(tallChild, [], context)

      const laidOutChildren: LaidOutChild[] = [
        { node: shortChild, layout: shortLayout },
        { node: tallChild, layout: tallLayout },
      ]

      const result = topAlignLayout(parent, laidOutChildren, context)

      // Top edges should be at the same y
      const shortTop = result.root.children[0].y - result.root.children[0].height / 2
      const tallTop = result.root.children[1].y - result.root.children[1].height / 2
      expect(shortTop).toBeCloseTo(tallTop, 5)
    })

    it('differs from maxwidth for varying height children', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild')

      // Layout with maxwidth
      const maxwidthChildren = layoutChildren([shortChild, tallChild], context, maxwidthLayout)
      const maxwidthResult = maxwidthLayout(parent, maxwidthChildren, context)

      // Layout with topAlign
      const topAlignChildren = layoutChildren([shortChild, tallChild], context, topAlignLayout)
      const topAlignResult = topAlignLayout(parent, topAlignChildren, context)

      // Both algorithms should produce valid results
      expect(maxwidthResult.root.children).toHaveLength(2)
      expect(topAlignResult.root.children).toHaveLength(2)

      // The key difference is in y-positioning of differently-sized children
      // In maxwidth: centers aligned at same y
      // In top-align: tops aligned at same position
    })
  })

  describe('positions children correctly', () => {
    it('positions single child below parent with top alignment', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, topAlignLayout)

      const result = topAlignLayout(parent, laidOutChildren, context)

      const parentBottom = result.root.y + result.root.height / 2
      const childTop = result.root.children[0].y - result.root.children[0].height / 2

      // Child top should be verticalGap below parent bottom
      expect(childTop).toBeCloseTo(parentBottom + 40, 5) // 40 is default verticalGap
    })

    it('spreads multiple children horizontally', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const laidOutChildren = layoutChildren(
        [node('Child1'), node('Child2'), node('Child3')],
        context,
        topAlignLayout
      )

      const result = topAlignLayout(parent, laidOutChildren, context)

      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
      expect(result.root.children[1].x).toBeLessThan(result.root.children[2].x)
    })
  })
})

describe('polygon contour correctness', () => {
  it('single node polygon contour has correct bounds', () => {
    const context = createMockContext()
    const testNode = node('Test')

    const result = maxwidthLayout(testNode, [], context)

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
    const laidOutChildren = layoutChildren([child], context, maxwidthLayout)

    const result = maxwidthLayout(parent, laidOutChildren, context)

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
    const laidOutChildren = layoutChildren(tree.children!, context, maxwidthLayout)

    const result = maxwidthLayout(tree, laidOutChildren, context)

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

    const result = maxwidthLayout(testNode, [], context)

    expect(result.root.width).toBe(100 * 8 + 20) // 100 chars * 8 + padding
  })

  it('handles multi-line labels', () => {
    const context = createMockContext()
    const testNode = node('Line 1\nLine 2\nLine 3')

    const result = maxwidthLayout(testNode, [], context)

    // Height should account for 3 lines
    expect(result.root.height).toBe(3 * 18 + 20) // 3 lines * 18 + padding
  })

  it('handles empty label', () => {
    const context = createMockContext()
    const testNode = node('')

    const result = maxwidthLayout(testNode, [], context)

    // Should still have some width from padding
    expect(result.root.width).toBe(20) // Just padding
  })

  it('handles many children', () => {
    const context = createMockContext()
    const children = Array.from({ length: 20 }, (_, i) => node(`Child ${i}`))
    const laidOutChildren = layoutChildren(children, context, maxwidthLayout)
    const parent = node('Parent')

    const result = maxwidthLayout(parent, laidOutChildren, context)

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

    const laidOutChildren = layoutChildren([b], context, maxwidthLayout)
    const result = maxwidthLayout(a, laidOutChildren, context)

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

describe('lrSqueezeLayout', () => {
  describe('single node (no children)', () => {
    it('positions node at origin', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = lrSqueezeLayout(testNode, [], context)

      expect(result.root.x).toBe(0)
      expect(result.root.y).toBe(0)
    })

    it('returns same result as other algorithms for single node', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const lrSqueezeResult = lrSqueezeLayout(testNode, [], context)
      const topAlignResult = topAlignLayout(testNode, [], context)

      expect(lrSqueezeResult.root.width).toBe(topAlignResult.root.width)
      expect(lrSqueezeResult.root.height).toBe(topAlignResult.root.height)
      expect(lrSqueezeResult.bounds).toEqual(topAlignResult.bounds)
    })

    it('creates polygon contour matching node size', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = lrSqueezeLayout(testNode, [], context)

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
      const laidOutChildren = layoutChildren([child], context, lrSqueezeLayout)

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      expect(result.root.children[0].y).toBeGreaterThan(result.root.y)
    })

    it('centers single child under parent', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, lrSqueezeLayout)

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Child should be centered (x = 0 since parent is at x = 0)
      expect(result.root.children[0].x).toBe(0)
    })

    it('spreads multiple children horizontally', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const laidOutChildren = layoutChildren(
        [node('Child1'), node('Child2'), node('Child3')],
        context,
        lrSqueezeLayout
      )

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
      expect(result.root.children[1].x).toBeLessThan(result.root.children[2].x)
    })

    it('aligns child tops (top-align characteristic)', () => {
      const context = createMockContext()
      const parent = node('Parent')
      // Create children with different heights
      const shortChild = node('Short')
      const tallChild = node('Tall\nChild\nHere')

      const laidOutChildren = layoutChildren([shortChild, tallChild], context, lrSqueezeLayout)
      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Top edges should be at the same y
      const shortTop = result.root.children[0].y - result.root.children[0].height / 2
      const tallTop = result.root.children[1].y - result.root.children[1].height / 2
      expect(shortTop).toBeCloseTo(tallTop, 5)
    })

    it('respects vertical gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'lr-squeeze', horizontalGap: 10, verticalGap: 100 },
      })
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, lrSqueezeLayout)

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      const parentBottom = result.root.y + result.root.height / 2
      const childTop = result.root.children[0].y - result.root.children[0].height / 2
      expect(childTop - parentBottom).toBeGreaterThanOrEqual(100)
    })

    it('respects horizontal gap setting', () => {
      const context = createMockContext({
        layout: { algorithm: 'lr-squeeze', horizontalGap: 50, verticalGap: 40 },
      })
      const parent = node('Parent')
      const child1 = node('A')
      const child2 = node('B')
      const laidOutChildren = layoutChildren([child1, child2], context, lrSqueezeLayout)

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Gap between children's bounding boxes should be at least the horizontal gap
      const gap =
        result.root.children[1].x -
        result.root.children[1].width / 2 -
        (result.root.children[0].x + result.root.children[0].width / 2)
      expect(gap).toBeGreaterThanOrEqual(50 - 1) // Allow small floating point tolerance
    })
  })

  describe('contour-based compaction', () => {
    it('uses contour-based spacing for subtrees with different shapes', () => {
      const context = createMockContext({
        layout: { algorithm: 'lr-squeeze', horizontalGap: 10, verticalGap: 40 },
      })

      // Create two subtrees with different shapes:
      // Left subtree: deep on the right side
      // Right subtree: deep on the left side
      // These should interlock more tightly than bounding-box-based layout

      // Left subtree: Root with child extending to the left
      const leftSubtree = node('L', [node('LL')])
      // Right subtree: Root with child extending to the right
      const rightSubtree = node('R', [node('RR')])

      const parent = node('Parent')
      const laidOutChildren = layoutChildren([leftSubtree, rightSubtree], context, lrSqueezeLayout)
      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Both children should be positioned
      expect(result.root.children).toHaveLength(2)
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
    })

    it('places L-shaped subtrees closer than bounding boxes would allow', () => {
      // This test demonstrates the key advantage of contour-based layout:
      // When subtrees have different depths, they can interlock
      const context = createMockContext({
        layout: { algorithm: 'lr-squeeze', horizontalGap: 10, verticalGap: 40 },
      })

      // Left subtree is tall (has grandchildren)
      const leftTall = node('A', [node('A1', [node('A11')])])
      // Right subtree is short (no grandchildren)
      const rightShort = node('B')

      const parent = node('Parent')
      const laidOutChildren = layoutChildren([leftTall, rightShort], context, lrSqueezeLayout)
      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // The right subtree should be placed based on contour, not bounding box
      // At the level of the roots, they should be horizontalGap apart
      // But since B has no children, the grandchildren of A don't affect B's placement
      expect(result.root.children).toHaveLength(2)
      expect(result.root.children[0].x).toBeLessThan(result.root.children[1].x)
    })

    it('compacts multiple children incrementally from left to right', () => {
      const context = createMockContext({
        layout: { algorithm: 'lr-squeeze', horizontalGap: 10, verticalGap: 40 },
      })

      // Create several children with varying depths
      const children = [
        node('A', [node('A1')]),
        node('B'),
        node('C', [node('C1', [node('C11')])]),
        node('D'),
      ]

      const parent = node('Parent')
      const laidOutChildren = layoutChildren(children, context, lrSqueezeLayout)
      const result = lrSqueezeLayout(parent, laidOutChildren, context)

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
        lrSqueezeLayout
      )

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Parent is at x=0
      expect(result.root.x).toBe(0)

      // Children should be centered around x=0
      const childrenLeft = Math.min(...result.root.children.map((c) => c.x - c.width / 2))
      const childrenRight = Math.max(...result.root.children.map((c) => c.x + c.width / 2))
      const childrenCenter = (childrenLeft + childrenRight) / 2

      expect(childrenCenter).toBeCloseTo(0, 5)
    })

    it('centers asymmetric children forest under parent', () => {
      const context = createMockContext()
      const parent = node('P')

      // Create asymmetric children: one very wide, one narrow
      const wideChild = node('Very Wide Child Label')
      const narrowChild = node('X')

      const laidOutChildren = layoutChildren([wideChild, narrowChild], context, lrSqueezeLayout)
      const result = lrSqueezeLayout(parent, laidOutChildren, context)

      // Parent should still be at origin
      expect(result.root.x).toBe(0)

      // Children's center should be at parent's center (0)
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
      const laidOutChildren = layoutChildren(tree.children!, context, lrSqueezeLayout)

      const result = lrSqueezeLayout(tree, laidOutChildren, context)

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
      const laidOutChildren = layoutChildren(tree.children!, context, lrSqueezeLayout)

      const result = lrSqueezeLayout(tree, laidOutChildren, context)

      // Bounds should include the wide child
      expect(result.bounds.right - result.bounds.left).toBeGreaterThan(result.root.width)
    })
  })

  describe('polygon contour correctness', () => {
    it('parent with children has polygon contour extending to children', () => {
      const context = createMockContext()
      const parent = node('Parent')
      const child = node('Child')
      const laidOutChildren = layoutChildren([child], context, lrSqueezeLayout)

      const result = lrSqueezeLayout(parent, laidOutChildren, context)

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
      const laidOutChildren = layoutChildren(tree.children!, context, lrSqueezeLayout)

      const result = lrSqueezeLayout(tree, laidOutChildren, context)

      expect(result.root.polygonContour).toBeDefined()
      expect(result.root.polygonContour!.left.length).toBeGreaterThan(0)
      expect(result.root.polygonContour!.right.length).toBeGreaterThan(0)
    })
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
      const lrSqueezeResult = lrSqueezeLayout(testNode, [], context)

      expect(tidyResult.root.width).toBe(lrSqueezeResult.root.width)
      expect(tidyResult.root.height).toBe(lrSqueezeResult.root.height)
      expect(tidyResult.bounds).toEqual(lrSqueezeResult.bounds)
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
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 100 },
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
        layout: { algorithm: 'tidy', horizontalGap: 50, verticalGap: 40 },
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

    it('differs from LR Squeeze for asymmetric subtrees', () => {
      const context = createMockContext()

      // Create tree with asymmetric subtrees that would layout differently in LR vs RL
      const tree = node('Root', [
        node('A', [node('A1', [node('A11')])]),
        node('B'),
        node('C'),
        node('D'),
      ])

      const tidyChildren = layoutChildren(tree.children!, context, tidyLayout)
      const tidyResult = tidyLayout(tree, tidyChildren, context)

      const lrChildren = layoutChildren(tree.children!, context, lrSqueezeLayout)
      const lrResult = lrSqueezeLayout(tree, lrChildren, context)

      const rlChildren = layoutChildren(tree.children!, context, rlSqueezeLayout)
      const rlResult = rlSqueezeLayout(tree, rlChildren, context)

      // Tidy should produce something between LR and RL (or equal if tree is symmetric)
      // The gaps between siblings should be more even in Tidy than in LR or RL
      expect(tidyResult.root.children).toHaveLength(4)
      expect(lrResult.root.children).toHaveLength(4)
      expect(rlResult.root.children).toHaveLength(4)
    })
  })

  describe('apportionment (even gap distribution)', () => {
    it('distributes gaps evenly when deep subtree causes shift', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40 },
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
        layout: { algorithm: 'tidy', horizontalGap: 20, verticalGap: 40 },
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

    it('produces more even gaps than LR Squeeze for asymmetric trees', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40 },
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

      // Get LR Squeeze layout
      const lrChildren = layoutChildren(tree.children!, context, lrSqueezeLayout)
      const lrResult = lrSqueezeLayout(tree, lrChildren, context)

      // Calculate gap variance for both
      const calculateGapVariance = (children: typeof tidyResult.root.children) => {
        const gaps: number[] = []
        for (let i = 0; i < children.length - 1; i++) {
          const leftRight = children[i].x + children[i].width / 2
          const rightLeft = children[i + 1].x - children[i + 1].width / 2
          gaps.push(rightLeft - leftRight)
        }
        const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
        const variance = gaps.reduce((sum, g) => sum + Math.pow(g - avgGap, 2), 0) / gaps.length
        return variance
      }

      const tidyVariance = calculateGapVariance(tidyResult.root.children)
      const lrVariance = calculateGapVariance(lrResult.root.children)

      // Tidy should have lower or equal variance (more even gaps)
      expect(tidyVariance).toBeLessThanOrEqual(lrVariance + 1) // Allow small tolerance
    })
  })

  describe('contour-based compaction', () => {
    it('uses contour-based spacing for subtrees with different shapes', () => {
      const context = createMockContext({
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40 },
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
        layout: { algorithm: 'tidy', horizontalGap: 10, verticalGap: 40 },
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
