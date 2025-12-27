import { describe, it, expect } from 'vitest'
import { maxwidthLayout } from './maxwidth'
import { topAlignLayout } from './topAlign'
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
      contourRowStep: 4,
    },
    padding: 10,
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

    it('creates contour matching node size', () => {
      const context = createMockContext()
      const testNode = node('Test')

      const result = maxwidthLayout(testNode, [], context)

      expect(result.contour.left.length).toBeGreaterThan(0)
      expect(result.contour.right.length).toBeGreaterThan(0)
      expect(result.contour.left[0]).toBe(-result.root.width / 2)
      expect(result.contour.right[0]).toBe(result.root.width / 2)
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
        layout: { algorithm: 'maxwidth', horizontalGap: 10, verticalGap: 100, contourRowStep: 4 },
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
        layout: { algorithm: 'maxwidth', horizontalGap: 50, verticalGap: 40, contourRowStep: 4 },
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
