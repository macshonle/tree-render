import { describe, it, expect } from 'vitest'
import { layoutTree } from './index'
import { subtreeContour } from './contour'
import type { TreeNode, TreeStyle, TreeExample, LayoutNode } from '@/types'
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

  it('returns a layout that a polygon contour can be built from', () => {
    const root = node('Root', [node('Child')])
    const style = createTestStyle()
    const treeData = createTestTreeData(root)

    const result = layoutTree(root, treeData, style, measurer)
    const contour = subtreeContour(result, style.edge.style)

    expect(contour.left.length).toBeGreaterThan(0)
    expect(contour.right.length).toBeGreaterThan(0)
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

describe('layoutTree scaling', () => {
  const measurer = createMockTextMeasurer()
  const all = (n: LayoutNode): LayoutNode[] => {
    // Iterative: these trees are far too deep to walk recursively.
    const out: LayoutNode[] = []
    const stack = [n]
    while (stack.length > 0) {
      const next = stack.pop()!
      out.push(next)
      for (let i = next.children.length - 1; i >= 0; i--) stack.push(next.children[i])
    }
    return out
  }

  for (const algorithm of ['bounding-box', 'tidy'] as const) {
    it(`${algorithm}: lays out a 50,000-node chain`, () => {
      const root: TreeNode = { id: 'n0', label: '', width: 40, height: 20 }
      let tip = root
      for (let i = 1; i < 50_000; i++) {
        const next: TreeNode = { id: `n${i}`, label: '', width: 40, height: 20 }
        tip.children = [next]
        tip = next
      }

      const result = layoutTree(root, createTestTreeData(root), createTestStyle({ algorithm }), measurer)

      const nodes = all(result)
      expect(nodes).toHaveLength(50_000)
      expect(nodes.every((n) => n.x === 0)).toBe(true)
      // Each level is one node height plus one vertical gap further down.
      expect(nodes[nodes.length - 1].y).toBe(49_999 * (20 + 40))

      // Outlining the whole tree for the debug overlay keeps up.
      const contour = subtreeContour(result, 'org-chart')
      expect(contour.left).toHaveLength(100_000)
      expect(contour.left[99_999]).toEqual({ x: -20, y: 49_999 * (20 + 40) + 10 })
    })

    it(`${algorithm}: lays out 50,000 nodes in a bushy tree`, () => {
      const root: TreeNode = { id: 'n0', label: '', width: 40, height: 20, children: [] }
      const pool = [root]
      for (let i = 1; i < 50_000; i++) {
        const child: TreeNode = { id: `n${i}`, label: '', width: 20 + (i % 7) * 10, height: 20, children: [] }
        // Deterministic and irregular: parents drawn from across the tree.
        pool[(i * 7919) % pool.length].children!.push(child)
        pool.push(child)
      }

      const result = layoutTree(root, createTestTreeData(root), createTestStyle({ algorithm }), measurer)

      const nodes = all(result)
      expect(nodes).toHaveLength(50_000)
      expect(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true)

      // Outlining the whole tree for the debug overlay keeps up.
      const contour = subtreeContour(result, 'org-chart')
      const deepest = nodes.reduce((y, n) => Math.max(y, n.y + n.height / 2), -Infinity)
      expect(contour.left[contour.left.length - 1].y).toBeCloseTo(deepest, 6)
      expect(contour.right[contour.right.length - 1].y).toBeCloseTo(deepest, 6)
    })
  }
})

describe('layoutTree with the tidy algorithm', () => {
  const measurer = createMockTextMeasurer()

  /** Count pairs of nodes whose boxes intersect. */
  function countOverlaps(root: LayoutNode): number {
    const all: LayoutNode[] = []
    const collect = (n: LayoutNode) => {
      all.push(n)
      n.children.forEach(collect)
    }
    collect(root)
    let overlaps = 0
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]
        const b = all[j]
        const dx = Math.abs(a.x - b.x) - (a.width + b.width) / 2
        const dy = Math.abs(a.y - b.y) - (a.height + b.height) / 2
        if (dx < -1e-6 && dy < -1e-6) overlaps++
      }
    }
    return overlaps
  }

  it('returns the app node shape: ids, labels, centre coordinates, root at origin', () => {
    const root = node('Root', [node('A', [node('A1')]), node('B')])
    const style = createTestStyle({ algorithm: 'tidy' })

    const result = layoutTree(root, createTestTreeData(root), style, measurer)

    expect(result).toMatchObject({ id: 'root', label: 'Root', x: 0, y: 0 })
    expect(result.children.map((c) => c.id)).toEqual(['a', 'b'])
    expect(result.children[0].children.map((c) => c.id)).toEqual(['a1'])
    const [a, b] = result.children
    expect(a.x).toBeLessThan(b.x)
    // Children are top-aligned one vertical gap below the parent.
    expect(a.y - a.height / 2).toBe(result.height / 2 + 40)
    expect(b.y - b.height / 2).toBe(result.height / 2 + 40)
    // Parent is centred over the span of its children.
    expect((a.x - a.width / 2 + b.x + b.width / 2) / 2).toBeCloseTo(0, 9)
  })

  it('respects gaps, fixed sizing and reduced leaf gaps', () => {
    const root = node('Root', [node('A'), node('B'), node('C', [node('C1')])])
    const treeData: TreeExample = { ...createTestTreeData(root), sizingMode: 'fixed', nodeWidth: 40, nodeHeight: 40 }
    const gapBetween = (l: LayoutNode, r: LayoutNode) => r.x - r.width / 2 - (l.x + l.width / 2)

    const plain = layoutTree(root, treeData, createTestStyle({ algorithm: 'tidy', horizontalGap: 20 }), measurer)
    expect(plain.width).toBe(40)
    expect(gapBetween(plain.children[0], plain.children[1])).toBe(20)
    expect(gapBetween(plain.children[1], plain.children[2])).toBe(20)

    const reduced = layoutTree(
      root,
      treeData,
      createTestStyle({ algorithm: 'tidy', horizontalGap: 20, reduceLeafSiblingGaps: true }),
      measurer
    )
    expect(gapBetween(reduced.children[0], reduced.children[1])).toBe(10)
    expect(gapBetween(reduced.children[1], reduced.children[2])).toBe(20)
  })

  it('gives every node a subtree a contour can be built for', () => {
    const root = node('Root', [node('A', [node('A1'), node('A2')]), node('B')])
    const treeData = createTestTreeData(root)
    const style = createTestStyle({ algorithm: 'tidy' })
    const all = (n: LayoutNode): LayoutNode[] => [n, ...n.children.flatMap(all)]

    const result = layoutTree(root, treeData, style, measurer)
    const boxes = all(result)
    for (const n of boxes) {
      const contour = subtreeContour(n, style.edge.style)
      // A contour is relative to its own node and starts at the node's top corners.
      expect(contour.left[0]).toEqual({ x: -n.width / 2, y: -n.height / 2 })
      expect(contour.right[0]).toEqual({ x: n.width / 2, y: -n.height / 2 })
    }
    // The root's contour reaches down to the deepest node and out to the widest.
    const whole = subtreeContour(result, style.edge.style)
    const points = [...whole.left, ...whole.right]
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(Math.max(...boxes.map((b) => b.y + b.height / 2)), 6)
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(Math.min(...boxes.map((b) => b.x - b.width / 2)), 6)
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(Math.max(...boxes.map((b) => b.x + b.width / 2)), 6)
    // Building contours leaves the layout as it was.
    expect(all(layoutTree(root, treeData, style, measurer))).toEqual(boxes)
  })

  it('keeps deep subtrees apart when shallow siblings sit between them', () => {
    // Two subtrees that are wide at the bottom, separated by a leaf, followed
    // by more leaves. Evening out the gaps between adjacent siblings must not
    // pull the two wide subtrees into each other.
    const wide = (name: string): TreeNode => ({
      id: name,
      label: name,
      children: [{ id: `${name}-mid`, label: '', children: [{ id: `${name}-wide`, label: '', width: 200, height: 40 }] }],
    })
    const root = node('Root', [wide('p'), node('A'), wide('q'), node('B'), node('C'), node('D')])
    const treeData: TreeExample = { ...createTestTreeData(root), sizingMode: 'fixed', nodeWidth: 40, nodeHeight: 40 }

    const result = layoutTree(root, treeData, createTestStyle({ algorithm: 'tidy' }), measurer)

    expect(countOverlaps(result)).toBe(0)
  })
})

describe('subtreeContour on laid-out trees', () => {
  const measurer = createMockTextMeasurer()
  type Side = { x: number; y: number }[]

  /** The outermost x a side has at height y, or null if it does not reach that height. */
  function sideAt(side: Side, y: number, outer: (a: number, b: number) => number): number | null {
    let best: number | null = null
    for (let i = 0; i + 1 < side.length; i++) {
      const p = side[i]
      const q = side[i + 1]
      if (y < p.y || y > q.y) continue
      const x = q.y === p.y ? outer(p.x, q.x) : p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x)
      best = best === null ? x : outer(best, x)
    }
    return best
  }

  const all = (n: LayoutNode): LayoutNode[] => [n, ...n.children.flatMap(all)]

  it('runs top to bottom and encloses every node, for every subtree, layout and edge style', () => {
    let seed = 20240
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296
    let checked = 0
    const problems: string[] = []

    for (let t = 0; t < 40; t++) {
      const size = 2 + Math.floor(random() * 50)
      const spread = [0.5, 1, 2][t % 3]
      const make = (i: number): TreeNode => ({
        id: `n${i}`,
        label: '',
        width: 20 + Math.floor(random() * 12) * 5,
        height: 15 + Math.floor(random() * 10) * 5,
        children: [],
      })
      const root = make(0)
      const pool = [root]
      for (let i = 1; i < size; i++) {
        const child = make(i)
        pool[Math.floor(Math.pow(random(), spread) * pool.length)].children!.push(child)
        pool.push(child)
      }

      for (const algorithm of ['bounding-box', 'tidy'] as const) {
        for (const edge of ['curve', 'straight-arrow', 'org-chart'] as const) {
          const style = createTestStyle({ algorithm })
          style.edge.style = edge
          const layout = layoutTree(root, createTestTreeData(root), style, measurer)

          for (const top of all(layout)) {
            const where = `tree ${t}, ${algorithm}, ${edge}, subtree ${top.id}`
            const contour = subtreeContour(top, edge)
            for (const side of [contour.left, contour.right]) {
              for (let i = 1; i < side.length; i++) {
                if (side[i].y < side[i - 1].y) problems.push(`${where}: point ${i} is above the one before it`)
              }
            }
            for (const n of all(top)) {
              const left = n.x - n.width / 2 - top.x
              const right = n.x + n.width / 2 - top.x
              for (const y of [n.y - n.height / 2 - top.y, n.y - top.y, n.y + n.height / 2 - top.y]) {
                const contourLeft = sideAt(contour.left, y, Math.min)
                const contourRight = sideAt(contour.right, y, Math.max)
                if (contourLeft === null || contourLeft > left + 1e-6) {
                  problems.push(`${where}: left side at y=${y} is ${contourLeft}, inside ${n.id} at ${left}`)
                }
                if (contourRight === null || contourRight < right - 1e-6) {
                  problems.push(`${where}: right side at y=${y} is ${contourRight}, inside ${n.id} at ${right}`)
                }
                checked++
              }
            }
          }
        }
      }
    }
    expect(problems).toEqual([])
    expect(checked).toBeGreaterThan(10_000)
  })
})

