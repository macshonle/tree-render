import { describe, it, expect } from 'vitest'
import { tidyTree, linkTo, nodeAt } from './tidy-tree'
import source from './tidy-tree.ts?raw'
import type { TidyDirection, TidyNode, TidyTree, TidyTreeOptions } from './tidy-tree'

// ---------------------------------------------------------------------------
// Test trees
// ---------------------------------------------------------------------------

interface Item {
  name: string
  width: number
  height: number
  children: Item[]
}

let counter = 0
function item(width: number, height: number, children: Item[] = []): Item {
  return { name: `n${counter++}`, width, height, children }
}

/** Small deterministic PRNG so failures are reproducible from the seed. */
function rng(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Shape = 'bushy' | 'stringy' | 'mixed'

function randomTree(n: number, seed: number, shape: Shape = 'mixed', fixedSize = false): Item {
  const rnd = rng(seed)
  const size = (): [number, number] => {
    if (fixedSize) return [40, 40]
    // Mostly ordinary boxes, with the occasional extreme or empty one.
    const r = rnd()
    if (r < 0.04) return [0, 0]
    if (r < 0.1) return [200 + Math.floor(rnd() * 300), 10 + Math.floor(rnd() * 20)]
    if (r < 0.16) return [10 + Math.floor(rnd() * 20), 150 + Math.floor(rnd() * 200)]
    return [20 + Math.floor(rnd() * 100), 20 + Math.floor(rnd() * 80)]
  }
  const root = item(...size())
  const all = [root]
  for (let i = 1; i < n; i++) {
    let parent: Item
    if (shape === 'bushy') {
      parent = all[Math.floor(rnd() * all.length)]
    } else if (shape === 'stringy') {
      parent = all[Math.max(0, all.length - 1 - Math.floor(rnd() * 3))]
    } else {
      const window = 1 + Math.floor(rnd() * Math.min(all.length, 25))
      parent = all[all.length - window]
    }
    const child = item(...size())
    parent.children.push(child)
    all.push(child)
  }
  return root
}

function mirror(t: Item): Item {
  return { ...t, children: t.children.map(mirror).reverse() }
}

function clone(t: Item): Item {
  return { ...t, children: t.children.map(clone) }
}

// ---------------------------------------------------------------------------
// Independent checker
//
// Everything below re-derives what a correct layout must look like from the
// output coordinates alone, by brute force over all pairs of nodes. It shares
// no code or data structures with the implementation.
// ---------------------------------------------------------------------------

interface Box {
  node: TidyNode<Item>
  /** Extent across the tree. */
  b0: number
  b1: number
  /** Extent from the root towards the leaves. */
  d0: number
  d1: number
  /** End of the depth range the node keeps clear (includes the gap below). */
  claim: number
  pre: number
  size: number
}

const EPS = 1e-6

function boxes(tree: TidyTree<Item>, levelGap: number, layered: boolean): Box[] {
  const dir = tree.direction
  const horizontal = dir === 'right' || dir === 'left'
  const total = horizontal ? tree.width : tree.height
  const out: Box[] = []
  const levelEnd: number[] = []

  function visit(node: TidyNode<Item>): number {
    const b0 = horizontal ? node.y : node.x
    const b = horizontal ? node.height : node.width
    const d = horizontal ? node.width : node.height
    let d0 = horizontal ? node.x : node.y
    if (dir === 'up' || dir === 'left') d0 = total - d0 - d
    const box: Box = { node, b0, b1: b0 + b, d0, d1: d0 + d, claim: d0 + d + levelGap, pre: out.length, size: 1 }
    out.push(box)
    levelEnd[node.depth] = Math.max(levelEnd[node.depth] ?? 0, box.d1)
    for (const c of node.children) box.size += visit(c)
    return box.size
  }
  visit(tree.root)

  if (layered) {
    for (const box of out) box.claim = levelEnd[box.node.depth] + levelGap
  }
  return out
}

interface CheckOptions {
  nodeGap: number
  levelGap: number
  layered?: boolean
}

/** Throws with a description of the first violated guarantee. */
function assertValid(tree: TidyTree<Item>, opts: CheckOptions): void {
  const layered = opts.layered === true
  const bs = boxes(tree, opts.levelGap, layered)
  const byNode = new Map(bs.map((b) => [b.node, b]))

  // Bounds are tight and start at the origin.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of tree.nodes) {
    minX = Math.min(minX, n.x)
    minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width)
    maxY = Math.max(maxY, n.y + n.height)
  }
  expect(minX).toBeCloseTo(0, 6)
  expect(minY).toBeCloseTo(0, 6)
  expect(maxX).toBeCloseTo(tree.width, 6)
  expect(maxY).toBeCloseTo(tree.height, 6)

  for (const box of bs) {
    const kids = box.node.children.map((c) => byNode.get(c)!)
    if (kids.length === 0) continue

    // Children start one level gap past the parent (or the parent's level).
    const expectedTop = box.claim
    for (const k of kids) {
      if (Math.abs(k.d0 - expectedTop) > EPS) {
        throw new Error(`${k.node.data.name}: starts at ${k.d0}, expected ${expectedTop}`)
      }
    }
    // The parent is centred over its first and last child.
    const mid = (kids[0].b0 + kids[kids.length - 1].b1) / 2
    if (Math.abs(mid - (box.b0 + box.b1) / 2) > EPS) {
      throw new Error(`${box.node.data.name}: not centred over its children`)
    }
  }

  // Any two nodes that are not ancestor and descendant, and whose claimed
  // depth ranges overlap, are in tree order and at least nodeGap apart.
  for (let i = 0; i < bs.length; i++) {
    const a = bs[i]
    for (let j = a.pre + a.size; j < bs.length; j++) {
      const b = bs[j]
      if (Math.min(a.claim, b.claim) - Math.max(a.d0, b.d0) <= EPS) continue
      if (b.b0 - a.b1 < opts.nodeGap - EPS) {
        throw new Error(
          `${a.node.data.name} and ${b.node.data.name}: clearance ${b.b0 - a.b1}, need ${opts.nodeGap}`
        )
      }
    }
  }
}

/**
 * Smallest clearance between the subtree of `box` and everything that comes
 * before it under the same parent.
 */
function clearanceToEarlierSiblings(bs: Box[], parent: Box, box: Box): number {
  let best = Infinity
  for (let i = parent.pre + 1; i < box.pre; i++) {
    const a = bs[i]
    for (let j = box.pre; j < box.pre + box.size; j++) {
      const b = bs[j]
      if (Math.min(a.claim, b.claim) - Math.max(a.d0, b.d0) <= EPS) continue
      best = Math.min(best, b.b0 - a.b1)
    }
  }
  return best
}

function byName(tree: TidyTree<Item>): Map<string, TidyNode<Item>> {
  return new Map(tree.nodes.map((n) => [n.data.name, n]))
}

const GAPS = { nodeGap: 10, levelGap: 40 }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tidyTree: small cases worked by hand', () => {
  it('places a single node at the origin', () => {
    const tree = tidyTree(item(60, 30))
    expect(tree.nodes).toHaveLength(1)
    expect(tree.root).toMatchObject({ x: 0, y: 0, width: 60, height: 30, depth: 0, parent: null })
    expect(tree.width).toBe(60)
    expect(tree.height).toBe(30)
  })

  it('centres a parent over two leaves', () => {
    const tree = tidyTree(item(40, 40, [item(40, 40), item(40, 40)]), GAPS)
    const [root, a, b] = tree.nodes
    expect([a.x, a.y]).toEqual([0, 80])
    expect([b.x, b.y]).toEqual([50, 80])
    expect([root.x, root.y]).toEqual([25, 0])
    expect(tree.width).toBe(90)
    expect(tree.height).toBe(120)
  })

  it('centres a narrow child under a wide parent', () => {
    const tree = tidyTree(item(200, 40, [item(40, 40)]), GAPS)
    expect(tree.root.x).toBe(0)
    expect(tree.root.children[0].x).toBe(80)
    expect(tree.width).toBe(200)
  })

  it('puts children below their own parent, not on a shared level line', () => {
    // Left parent is short, right parent is tall.
    const tree = tidyTree(item(40, 40, [item(40, 20, [item(40, 40)]), item(40, 100, [item(40, 40)])]), GAPS)
    const [, short, tall, underShort, underTall] = tree.nodes
    expect(underShort.y).toBe(short.y + 20 + 40)
    expect(underTall.y).toBe(tall.y + 100 + 40)
  })

  it('lets a shallow subtree tuck in beside a deep one', () => {
    // Left child has wide grandchildren; right child is a leaf and should sit
    // right next to its sibling rather than clear of the whole left subtree.
    const left = item(40, 40, [item(40, 40, [item(300, 40)])])
    const right = item(40, 40)
    const tree = tidyTree(item(40, 40, [left, right]), GAPS)
    const [, l, r] = tree.nodes
    expect(r.x - (l.x + l.width)).toBe(10)
    assertValid(tree, GAPS)
  })

  it('spreads small subtrees evenly between two large ones', () => {
    const big = () => item(40, 40, [item(40, 40, [item(400, 40)])])
    const tree = tidyTree(item(40, 40, [big(), item(40, 40), item(40, 40), big()]), GAPS)
    const kids = tree.root.children
    const gaps = [0, 1, 2].map((i) => kids[i + 1].x - (kids[i].x + kids[i].width))
    expect(gaps[0]).toBeCloseTo(gaps[1], 9)
    expect(gaps[1]).toBeCloseTo(gaps[2], 9)
    expect(gaps[0]).toBeGreaterThan(10)
    assertValid(tree, GAPS)
  })

  it('keeps a leaf clear of the band that holds its sibling’s connectors', () => {
    // The leaf is taller than its sibling, so its lower part is level with
    // the connectors fanning out to the sibling's wide row of children.
    const parent = item(40, 40, [item(40, 40), item(40, 40), item(40, 40), item(40, 40), item(40, 40)])
    const tallLeaf = item(40, 60)
    const tree = tidyTree(item(40, 40, [parent, tallLeaf]), GAPS)
    const lastGrandchild = tree.nodes[tree.nodes.length - 1]
    const leaf = tree.root.children[1]
    expect(leaf.x).toBeGreaterThanOrEqual(lastGrandchild.x + lastGrandchild.width + 10)
  })
})

describe('tidyTree: guarantees on random trees', () => {
  const shapes: Shape[] = ['bushy', 'stringy', 'mixed']

  for (const shape of shapes) {
    for (const symmetric of [false, true]) {
      it(`no overlaps, centred parents, tree order (${shape}, symmetric=${symmetric})`, () => {
        for (let seed = 1; seed <= 400; seed++) {
          const tree = randomTree(2 + (seed % 70), seed, shape, seed % 5 === 0)
          const gaps = { nodeGap: seed % 7 === 0 ? 0 : 10, levelGap: seed % 11 === 0 ? 0 : 40 }
          try {
            assertValid(tidyTree(tree, { ...gaps, symmetric }), gaps)
          } catch (e) {
            throw new Error(`seed ${seed}: ${(e as Error).message}`)
          }
        }
      })
    }
  }

  it('holds on larger trees too', () => {
    for (const shape of shapes) {
      for (let seed = 1; seed <= 6; seed++) {
        assertValid(tidyTree(randomTree(1500, seed, shape), GAPS), GAPS)
      }
    }
  })

  it('wastes no space: a last child is exactly one gap from its earlier siblings', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const tree = tidyTree(randomTree(2 + (seed % 60), seed), { ...GAPS, symmetric: false })
      const bs = boxes(tree, GAPS.levelGap, false)
      const byNode = new Map(bs.map((b) => [b.node, b]))
      for (const parent of bs) {
        const kids = parent.node.children
        if (kids.length < 2) continue
        const last = byNode.get(kids[kids.length - 1])!
        const clearance = clearanceToEarlierSiblings(bs, parent, last)
        if (Math.abs(clearance - GAPS.nodeGap) > EPS) {
          throw new Error(`seed ${seed}: ${last.node.data.name} has clearance ${clearance}`)
        }
      }
    }
  })

  it('is no wider when symmetric than the average of the two one-sided layouts', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const tree = randomTree(40, seed)
      const leftBiased = tidyTree(tree, { ...GAPS, symmetric: false }).width
      const rightBiased = tidyTree(mirror(tree), { ...GAPS, symmetric: false }).width
      const balanced = tidyTree(tree, GAPS).width
      expect(balanced).toBeLessThanOrEqual((leftBiased + rightBiased) / 2 + EPS)
    }
  })
})

describe('tidyTree: symmetry and consistency', () => {
  it('mirrors the drawing when the tree is mirrored', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const source = randomTree(2 + (seed % 60), seed)
      const a = tidyTree(source, GAPS)
      const b = byName(tidyTree(mirror(source), GAPS))
      expect(b.size).toBe(a.nodes.length)
      for (const n of a.nodes) {
        const m = b.get(n.data.name)!
        expect(m.x).toBeCloseTo(a.width - n.x - n.width, 6)
        expect(m.y).toBeCloseTo(n.y, 6)
      }
    }
  })

  it('draws a tree that is its own mirror image symmetrically', () => {
    const arm = () => item(50, 30, [item(30, 30), item(90, 30, [item(20, 20)])])
    const source = item(40, 40, [arm(), item(40, 40), mirror(arm())])
    const tree = tidyTree(source, GAPS)
    const [left, middle, right] = tree.root.children
    const centre = tree.root.x + tree.root.width / 2
    expect(middle.x + middle.width / 2).toBeCloseTo(centre, 9)
    expect(centre - (left.x + left.width / 2)).toBeCloseTo(right.x + right.width / 2 - centre, 9)
    expect(centre).toBeCloseTo(tree.width / 2, 9)
  })

  it('draws identical subtrees identically wherever they appear', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const motif = randomTree(12, seed)
      const source = item(40, 40, [
        randomTree(9, seed + 1000),
        clone(motif),
        randomTree(15, seed + 2000),
        item(60, 60, [item(30, 30), clone(motif)]),
      ])
      const tree = tidyTree(source, GAPS)
      const first = tree.root.children[1]
      const second = tree.root.children[3].children[1]
      const offsets = (root: TidyNode<Item>): number[] => {
        const out: number[] = []
        const walk = (n: TidyNode<Item>) => {
          out.push(n.x - root.x, n.y - root.y)
          n.children.forEach(walk)
        }
        walk(root)
        return out
      }
      const a = offsets(first)
      const b = offsets(second)
      expect(a.length).toBe(b.length)
      a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6))
    }
  })

  it('is deterministic and leaves the input untouched', () => {
    const source = randomTree(50, 7)
    const before = JSON.stringify(source)
    const a = tidyTree(source, GAPS)
    const b = tidyTree(source, GAPS)
    expect(JSON.stringify(source)).toBe(before)
    expect(a.nodes.map((n) => [n.x, n.y])).toEqual(b.nodes.map((n) => [n.x, n.y]))
  })
})

describe('tidyTree: options', () => {
  it('reads children and sizes through accessors', () => {
    type Row = { id: string; kids?: Row[]; w: number }
    const source: Row = { id: 'a', w: 100, kids: [{ id: 'b', w: 30 }, { id: 'c', w: 30, kids: [] }] }
    const tree = tidyTree(source, {
      children: (d) => d.kids,
      nodeSize: (d) => ({ width: d.w, height: 20 }),
      nodeGap: 10,
      levelGap: 10,
    })
    expect(tree.nodes.map((n) => n.data.id)).toEqual(['a', 'b', 'c'])
    expect(tree.nodes.map((n) => n.width)).toEqual([100, 30, 30])
    expect(tree.root.children[0].parent).toBe(tree.root)
    expect(tree.root.children[1].depth).toBe(1)
  })

  it('accepts one fixed size for every node and has sensible defaults', () => {
    const bare = { children: [{}, {}] }
    const fixed = tidyTree(bare, { nodeSize: { width: 10, height: 10 }, nodeGap: 5, levelGap: 5 })
    expect(fixed.width).toBe(25)
    expect(fixed.height).toBe(25)
    const defaults = tidyTree(bare)
    expect(defaults.root.width).toBe(80)
    expect(defaults.root.height).toBe(40)
    expect(defaults.width).toBe(80 + 16 + 80)
    expect(defaults.height).toBe(40 + 40 + 40)
  })

  it('supports all four directions', () => {
    const transpose = (t: Item): Item => ({ ...t, width: t.height, height: t.width, children: t.children.map(transpose) })
    for (let seed = 1; seed <= 40; seed++) {
      const source = randomTree(30, seed)
      const down = tidyTree(source, GAPS)
      const up = byName(tidyTree(source, { ...GAPS, direction: 'up' }))
      const right = tidyTree(transpose(source), { ...GAPS, direction: 'right' })
      const rightNodes = byName(right)
      const left = byName(tidyTree(transpose(source), { ...GAPS, direction: 'left' }))
      expect(right.width).toBeCloseTo(down.height, 6)
      expect(right.height).toBeCloseTo(down.width, 6)
      for (const n of down.nodes) {
        const u = up.get(n.data.name)!
        expect([u.x, u.y]).toEqual([n.x, down.height - n.y - n.height])
        const r = rightNodes.get(n.data.name)!
        expect([r.x, r.y]).toEqual([n.y, n.x])
        const l = left.get(n.data.name)!
        expect([l.x, l.y]).toEqual([down.height - n.y - n.height, n.x])
      }
      for (const direction of ['up', 'right', 'left'] as TidyDirection[]) {
        assertValid(tidyTree(source, { ...GAPS, direction }), GAPS)
      }
    }
  })

  it('lines levels up when layered', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const source = randomTree(2 + (seed % 60), seed)
      for (const direction of ['down', 'left'] as TidyDirection[]) {
        const tree = tidyTree(source, { ...GAPS, layered: true, direction })
        try {
          assertValid(tree, { ...GAPS, layered: true })
        } catch (e) {
          throw new Error(`seed ${seed} ${direction}: ${(e as Error).message}`)
        }
      }
      const tree = tidyTree(source, { ...GAPS, layered: true })
      const levelY = new Map<number, number>()
      for (const n of tree.nodes) {
        if (!levelY.has(n.depth)) levelY.set(n.depth, n.y)
        expect(n.y).toBe(levelY.get(n.depth))
      }
    }
  })

  it('applies a custom spacing between facing nodes', () => {
    const source = item(40, 40, [item(40, 40), item(40, 40), item(40, 40, [item(40, 40)]), item(40, 40)])
    const isLeaf = (n: TidyNode<Item>) => n.children.length === 0
    const options: TidyTreeOptions<Item> = {
      ...GAPS,
      spacing: (a, b) => (a.parent === b.parent && isLeaf(a) && isLeaf(b) ? 4 : 10),
    }
    const kids = tidyTree(source, options).root.children
    const gaps = [0, 1, 2].map((i) => kids[i + 1].x - (kids[i].x + kids[i].width))
    expect(gaps).toEqual([4, 10, 10])
    // And it mirrors correctly.
    const mirrored = tidyTree(mirror(source), options).root.children
    const mirroredGaps = [0, 1, 2].map((i) => mirrored[i + 1].x - (mirrored[i].x + mirrored[i].width))
    expect(mirroredGaps).toEqual([10, 10, 4])
  })
})

describe('tidyTree: robustness and scale', () => {
  it('treats missing, negative and non-finite sizes as zero', () => {
    type Loose = { width?: number; height?: number; children?: Loose[] }
    const source: Loose = { children: [{ width: NaN, height: -5 }, { width: Infinity, height: 20 }, { width: 30, height: 20 }] }
    const tree = tidyTree(source, { nodeSize: (d) => ({ width: d.width as number, height: d.height as number }) })
    for (const n of tree.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true)
      expect(n.width).toBeGreaterThanOrEqual(0)
      expect(n.height).toBeGreaterThanOrEqual(0)
    }
    expect(tree.nodes.map((n) => n.width)).toEqual([0, 0, 0, 30])
    expect(Number.isFinite(tree.width) && Number.isFinite(tree.height)).toBe(true)
  })

  it('copes with trees made entirely of zero-sized nodes and zero gaps', () => {
    const tree = tidyTree(randomTree(40, 3), { nodeSize: { width: 0, height: 0 }, nodeGap: 0, levelGap: 0 })
    expect(tree.width).toBe(0)
    expect(tree.height).toBe(0)
  })

  it('handles a 200,000-node chain without overflowing the stack', () => {
    const root = item(40, 20)
    let tip = root
    for (let i = 1; i < 200_000; i++) {
      const next = item(40, 20)
      tip.children.push(next)
      tip = next
    }
    const tree = tidyTree(root, GAPS)
    expect(tree.nodes).toHaveLength(200_000)
    expect(tree.width).toBe(40)
    expect(tree.height).toBe(200_000 * 20 + 199_999 * 40)
  })

  it('handles a node with 100,000 children', () => {
    const root = item(40, 20)
    for (let i = 0; i < 100_000; i++) root.children.push(item(10, 10))
    const tree = tidyTree(root, { nodeGap: 5, levelGap: 5 })
    expect(tree.width).toBe(100_000 * 10 + 99_999 * 5)
    expect(tree.root.x + 20).toBeCloseTo(tree.width / 2, 6)
  })

  it('scales linearly', () => {
    const time = (n: number): number => {
      const source = randomTree(n, 99)
      let best = Infinity
      for (let run = 0; run < 3; run++) {
        const start = performance.now()
        tidyTree(source, GAPS)
        best = Math.min(best, performance.now() - start)
      }
      return best
    }
    time(20_000) // warm up
    const small = time(50_000)
    const large = time(400_000)
    // 8x the nodes. Linear would be about 8x the time; anything quadratic
    // would be about 64x. The bound is loose to tolerate noisy machines.
    expect(large / small).toBeLessThan(24)
  })
})

describe('helpers', () => {
  const source = item(40, 40, [item(40, 40), item(40, 40)])

  it('linkTo gives connector endpoints for each direction', () => {
    const down = tidyTree(source, GAPS)
    expect(linkTo(down.root)).toBeNull()
    expect(linkTo(down.root.children[0], down.direction)).toEqual({ x1: 45, y1: 40, x2: 20, y2: 80 })
    const up = tidyTree(source, { ...GAPS, direction: 'up' })
    expect(linkTo(up.root.children[0], 'up')).toEqual({ x1: 45, y1: 80, x2: 20, y2: 40 })
    const right = tidyTree(source, { ...GAPS, direction: 'right' })
    expect(linkTo(right.root.children[1], 'right')).toEqual({ x1: 40, y1: 45, x2: 80, y2: 70 })
    const left = tidyTree(source, { ...GAPS, direction: 'left' })
    expect(linkTo(left.root.children[1], 'left')).toEqual({ x1: 80, y1: 45, x2: 40, y2: 70 })
  })

  it('nodeAt finds the node under a point', () => {
    const tree = tidyTree(source, GAPS)
    expect(nodeAt(tree, 45, 20)).toBe(tree.root)
    expect(nodeAt(tree, 60, 100)).toBe(tree.root.children[1])
    expect(nodeAt(tree, 45, 100)).toBeNull()
    expect(nodeAt(tree, -1, -1)).toBeNull()
  })
})

describe('packaging', () => {
  it('is one self-contained file: it imports nothing', () => {
    expect(source.length).toBeGreaterThan(1000)
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\bimport\(/)
    expect(source).not.toMatch(/\brequire\(/)
  })

  it('carries its license notice, so that it can be copied on its own', () => {
    expect(source).toMatch(/^ \* Copyright \(c\) [\d-]+ Macneil Shonle\. MIT License/m)
    // The whole notice, in a comment that minifiers keep.
    const notice = source.slice(source.lastIndexOf('/*!'))
    expect(notice).toContain('MIT License')
    expect(notice).toContain('Copyright (c) 2025-2026 Macneil Shonle')
    expect(notice).toContain('Permission is hereby granted, free of charge')
    expect(notice).toContain('THE SOFTWARE IS PROVIDED "AS IS"')
    expect(notice.trimEnd().endsWith('*/')).toBe(true)
  })

  it('keeps the layout half free of the DOM', () => {
    const [layoutHalf, canvasHalf] = source.split('// CANVAS RENDERER')
    expect(layoutHalf).toContain('export function tidyTree')
    expect(canvasHalf).toContain('export function renderTree')
    // Code only: the header comment describes what the canvas half does.
    const code = layoutHalf.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(
      /\b(document|window|HTMLElement|HTMLCanvasElement|CanvasRenderingContext2D|devicePixelRatio|ResizeObserver)\b/
    )
  })

  it('loads and lays out where there is no DOM at all', () => {
    expect(typeof document).toBe('undefined')
    expect(tidyTree({ children: [{}, {}] }).nodes).toHaveLength(3)
  })
})
