import { describe, it, expect } from 'vitest'
import { layoutTree } from './index'
import type { TreeNode, TreeStyle, TreeExample } from '@/types'
import type { TextMeasurer } from './types'

/**
 * Create a mock text measurer for testing
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
 * Create a default tree style for testing
 */
function createTestStyle(overrides: Partial<TreeStyle['layout']> = {}): TreeStyle {
  return {
    node: {
      shape: 'rounded-rectangle',
      fillColor: '#ffffff',
      strokeColor: '#111111',
      strokeWidth: 2,
      padding: 10,
    },
    edge: {
      style: 'org-chart',
      color: '#000000',
      width: 2,
      arrowSize: 8,
    },
    layout: {
      algorithm: 'bounding-box',
      horizontalGap: 10,
      verticalGap: 40,
      reduceLeafSiblingGaps: false,
      ...overrides,
    },
  }
}

/**
 * Create a test tree example
 */
function createTestTreeData(root: TreeNode): TreeExample {
  return {
    id: 'test',
    name: 'Test Tree',
    sizingMode: 'fit-content',
    root,
  }
}

/**
 * Helper to create a node
 */
function node(label: string, children?: TreeNode[]): TreeNode {
  return {
    id: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    children,
  }
}

describe('layoutTree integration', () => {
  const measurer = createMockTextMeasurer()

  it('lays out a single node', () => {
    const root = node('Root')
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.id).toBe('root')
    expect(result.label).toBe('Root')
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(result.children).toEqual([])
  })

  it('lays out parent with children', () => {
    const root = node('Parent', [node('Child 1'), node('Child 2')])
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.children).toHaveLength(2)
    // Children should be positioned below parent
    expect(result.children[0].y).toBeGreaterThan(result.y)
    expect(result.children[1].y).toBeGreaterThan(result.y)
    // Children should be spread horizontally
    expect(result.children[0].x).not.toBe(result.children[1].x)
  })

  it('aligns child tops with bounding-box algorithm', () => {
    const root = node('Parent', [node('Short'), node('Tall\nChild')])
    const style = createTestStyle({ algorithm: 'bounding-box' })
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    // In bounding-box, children have their tops aligned
    const shortTop = result.children[0].y - result.children[0].height / 2
    const tallTop = result.children[1].y - result.children[1].height / 2
    expect(shortTop).toBeCloseTo(tallTop, 5)
  })

  it('handles deep nesting', () => {
    const root = node('L1', [node('L2', [node('L3', [node('L4', [node('L5')])])])])
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    // Verify all levels are present
    let current = result
    for (let level = 1; level <= 5; level++) {
      expect(current.label).toBe(`L${level}`)
      if (level < 5) {
        expect(current.children).toHaveLength(1)
        current = current.children[0]
      }
    }
  })

  it('handles wide trees', () => {
    const children = Array.from({ length: 10 }, (_, i) => node(`Child ${i + 1}`))
    const root = node('Root', children)
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.children).toHaveLength(10)
    // Children should all be at the same y level
    const firstY = result.children[0].y
    for (const child of result.children) {
      expect(child.y).toBe(firstY)
    }
    // Children should have increasing x positions
    for (let i = 1; i < result.children.length; i++) {
      expect(result.children[i].x).toBeGreaterThan(result.children[i - 1].x)
    }
  })

  it('respects fixed sizing mode', () => {
    const root = node('Root', [node('Child')])
    const style = createTestStyle()
    const treeData: TreeExample = {
      ...createTestTreeData(root),
      sizingMode: 'fixed',
      nodeWidth: 100,
      nodeHeight: 50,
    }

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.width).toBe(100)
    expect(result.height).toBe(50)
    expect(result.children[0].width).toBe(100)
    expect(result.children[0].height).toBe(50)
  })

  it('respects per-node sizing', () => {
    const root: TreeNode = {
      id: 'root',
      label: 'Root',
      width: 200,
      height: 100,
      children: [{ id: 'child', label: 'Child', width: 80, height: 40 }],
    }
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.children[0].width).toBe(80)
    expect(result.children[0].height).toBe(40)
  })

  it('includes polygon contour in result', () => {
    const root = node('Root', [node('Child')])
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    expect(result.polygonContour).toBeDefined()
    expect(result.polygonContour!.left.length).toBeGreaterThan(0)
    expect(result.polygonContour!.right.length).toBeGreaterThan(0)
  })

  it('respects horizontalGap setting', () => {
    const root = node('Root', [node('A'), node('B')])
    const style = createTestStyle({ horizontalGap: 50 })
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    const aRight = result.children[0].x + result.children[0].width / 2
    const bLeft = result.children[1].x - result.children[1].width / 2
    const gap = bLeft - aRight
    expect(gap).toBeCloseTo(50, 0)
  })

  it('respects verticalGap setting', () => {
    const root = node('Root', [node('Child')])
    const style = createTestStyle({ verticalGap: 80 })
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)

    const rootBottom = result.y + result.height / 2
    const childTop = result.children[0].y - result.children[0].height / 2
    const gap = childTop - rootBottom
    expect(gap).toBeGreaterThanOrEqual(80)
  })
})
