/**
 * tidy-tree.ts — tidy layout for general trees with variable-sized nodes.
 *
 * Self-contained: no imports, no DOM, no framework. Copy this one file into
 * any JavaScript or TypeScript project. It only computes positions; drawing is
 * up to you (canvas, SVG, absolutely positioned DOM, WebGL, ...). A small
 * optional canvas renderer lives next to it in tidy-tree-canvas.ts.
 *
 *   const tree = tidyTree(root, { nodeSize: (d) => ({ width: 120, height: 40 }) })
 *   for (const node of tree.nodes) drawBox(node.x, node.y, node.width, node.height)
 *
 * ALGORITHM
 *
 * The core is A. J. van der Ploeg's "Drawing Non-layered Tidy Trees in Linear
 * Time" (Software: Practice and Experience, 2014), the variable-node-size
 * successor to Reingold–Tilford, Walker and Buchheim et al. Each subtree is
 * laid out once and then treated as rigid. Sibling subtrees are pushed
 * together until their facing contours are exactly one gap apart, contours
 * are followed through "threads" so that a subtree is never re-scanned, and
 * moves are recorded as modifiers that a second walk turns into coordinates.
 * Time and memory are O(n) in the number of nodes, and nothing recurses, so
 * very deep trees are fine.
 *
 * On top of that, `symmetric` (on by default) runs the same pass on the
 * mirrored tree and averages the two results. The constraints a valid layout
 * has to satisfy (keep neighbours a gap apart, keep parents centred) are all
 * linear, so the average of two valid layouts is valid too, and it is exactly
 * left/right symmetric: mirroring the input mirrors the drawing.
 *
 * GUARANTEES
 *
 *  - No two nodes overlap. Nodes whose extents along the depth axis come
 *    within `levelGap` of each other are kept at least `nodeGap` apart.
 *  - Because of that margin, the band of height `levelGap` just before a row
 *    of children is clear of every other subtree for the full span of those
 *    children. Connectors routed through that band never cross a foreign
 *    node. (When not `layered` the band starts right at the parent, so any
 *    straight, curved or elbow connector qualifies. When `layered`, a short
 *    parent sits above the band: drop straight down to it first.)
 *  - A parent is centred over the span from its first child's leading edge
 *    to its last child's trailing edge.
 *  - Children keep their order, and identical subtrees are drawn identically
 *    wherever they appear.
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Which way the tree grows away from the root. */
export type TidyDirection = 'down' | 'up' | 'right' | 'left'

export interface TidySize {
  width: number
  height: number
}

/** One positioned node. `x`/`y` is the top-left corner of its box. */
export interface TidyNode<T> {
  /** The input object this node was created from. */
  data: T
  parent: TidyNode<T> | null
  children: TidyNode<T>[]
  /** 0 for the root, 1 for its children, and so on. */
  depth: number
  x: number
  y: number
  width: number
  height: number
}

export interface TidyTree<T> {
  root: TidyNode<T>
  /** Every node in breadth-first order; `nodes[0]` is the root. */
  nodes: TidyNode<T>[]
  /** Size of the whole drawing. Node boxes span (0,0)–(width,height). */
  width: number
  height: number
  /** The options the layout was made with, for whoever draws it. */
  direction: TidyDirection
  levelGap: number
  layered: boolean
}

export interface TidyTreeOptions<T> {
  /**
   * Returns a node's children. Default: `data.children`.
   * The input must be a tree: a cycle would never terminate.
   */
  children?: (data: T) => ArrayLike<T> | null | undefined
  /**
   * Size of each node's box, either one fixed size or a function.
   * Default: `data.width` × `data.height`, falling back to 80 × 40.
   */
  nodeSize?: TidySize | ((data: T) => TidySize)
  /** Minimum space between neighbouring nodes across the tree. Default 16. */
  nodeGap?: number
  /** Space between a parent and its children. Default 40. */
  levelGap?: number
  /**
   * Per-pair override of `nodeGap`. Called for nodes that end up facing each
   * other, `a` being the earlier one in sibling order. Must be symmetric in
   * meaning (it is called with the original order in both passes).
   */
  spacing?: (a: TidyNode<T>, b: TidyNode<T>) => number
  /** Growth direction. Default 'down' (root on top). */
  direction?: TidyDirection
  /**
   * When true, all nodes of the same depth start on a common line, as in a
   * classic layered tree. When false (default) children sit one `levelGap`
   * below their own parent, which is more compact when sizes vary.
   */
  layered?: boolean
  /**
   * When true (default) the layout is exactly mirror-symmetric at the cost of
   * a second pass. Turn off for roughly twice the speed on huge trees.
   */
  symmetric?: boolean
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const DEFAULT_WIDTH = 80
const DEFAULT_HEIGHT = 40
const DEFAULT_NODE_GAP = 16
const DEFAULT_LEVEL_GAP = 40

/** Finite and positive, or zero. Keeps bad input from poisoning the layout. */
function clean(value: unknown): number {
  const v = Number(value)
  return v > 0 && v < Infinity ? v : 0
}

function defaultChildren<T>(data: T): ArrayLike<T> | null | undefined {
  return (data as { children?: ArrayLike<T> | null } | null | undefined)?.children
}

function defaultSize(data: unknown): TidySize {
  const d = data as { width?: unknown; height?: unknown } | null | undefined
  return {
    width: typeof d?.width === 'number' ? d.width : DEFAULT_WIDTH,
    height: typeof d?.height === 'number' ? d.height : DEFAULT_HEIGHT,
  }
}

/**
 * Lay out a tree. Returns a new structure of positioned nodes; the input is
 * not modified.
 */
export function tidyTree<T>(rootData: T, options: TidyTreeOptions<T> = {}): TidyTree<T> {
  const getChildren = options.children ?? defaultChildren
  const sizeOption = options.nodeSize
  const getSize: (data: T) => TidySize =
    typeof sizeOption === 'function' ? sizeOption : sizeOption ? () => sizeOption : defaultSize
  const nodeGap = options.nodeGap === undefined ? DEFAULT_NODE_GAP : clean(options.nodeGap)
  const levelGap = options.levelGap === undefined ? DEFAULT_LEVEL_GAP : clean(options.levelGap)
  const spacing = options.spacing
  const direction = options.direction ?? 'down'
  const horizontal = direction === 'right' || direction === 'left'
  const layered = options.layered === true
  const symmetric = options.symmetric !== false

  // --- Build the node list, breadth first -----------------------------------
  // In breadth-first order the children of any node occupy consecutive
  // indices, so the tree structure fits in two integer arrays and no node
  // ever needs its own child-index list.

  const rootNode: TidyNode<T> = makeNode(rootData, null, 0, getSize)
  const nodes: TidyNode<T>[] = [rootNode]
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const kids = getChildren(node.data)
    if (!kids) continue
    for (let k = 0; k < kids.length; k++) {
      const child = makeNode(kids[k], node, node.depth + 1, getSize)
      node.children.push(child)
      nodes.push(child)
    }
  }

  const n = nodes.length
  const first = new Int32Array(n) // index of first child
  const count = new Int32Array(n) // number of children
  // "Breadth" runs across the tree (x for a top-down tree); "depth" runs from
  // the root towards the leaves (y for a top-down tree).
  const breadth = new Float64Array(n)
  const extent = new Float64Array(n) // size along the depth axis
  const top = new Float64Array(n) // start along the depth axis
  const bottom = new Float64Array(n) // end of the space the node claims

  let maxChildren = 0
  for (let i = 0, next = 1; i < n; i++) {
    const node = nodes[i]
    const k = node.children.length
    first[i] = next
    count[i] = k
    next += k
    if (k > maxChildren) maxChildren = k
    breadth[i] = horizontal ? node.height : node.width
    extent[i] = horizontal ? node.width : node.height
  }

  // --- Depth axis -----------------------------------------------------------
  // A node claims [top, bottom) where bottom includes the gap below it. Two
  // nodes need separating exactly when those claims overlap.

  let totalDepth = 0
  if (layered) {
    const levelStart: number[] = [0]
    const levelSize: number[] = []
    for (let i = 0; i < n; i++) {
      const d = nodes[i].depth
      if (!(levelSize[d] >= extent[i])) levelSize[d] = extent[i]
    }
    for (let d = 0; d < levelSize.length; d++) {
      levelStart[d + 1] = levelStart[d] + levelSize[d] + levelGap
    }
    for (let i = 0; i < n; i++) {
      const d = nodes[i].depth
      top[i] = levelStart[d]
      bottom[i] = levelStart[d + 1]
    }
    totalDepth = levelStart[levelSize.length] - levelGap
  } else {
    for (let i = 0; i < n; i++) {
      // Parents precede children, so top[i] is already final here.
      const end = top[i] + extent[i]
      bottom[i] = end + levelGap
      if (end > totalDepth) totalDepth = end
      for (let c = first[i], stop = c + count[i]; c < stop; c++) top[c] = bottom[i]
    }
  }

  // --- Breadth axis ---------------------------------------------------------

  const prelim = new Float64Array(n) // position relative to the parent frame
  const mod = new Float64Array(n) // offset applied to a whole subtree
  const shift = new Float64Array(n) // deferred spreading of in-between siblings
  const change = new Float64Array(n)
  const threadL = new Int32Array(n) // continuation of a left contour, or -1
  const threadR = new Int32Array(n) // continuation of a right contour, or -1
  const extremeL = new Int32Array(n) // deepest node on a subtree's left contour
  const extremeR = new Int32Array(n) // deepest node on a subtree's right contour
  const modSumL = new Float64Array(n) // sum of modifiers down to extremeL
  const modSumR = new Float64Array(n) // sum of modifiers down to extremeR
  // Stack of earlier siblings still visible from the right, deepest at the base.
  const visLow = new Float64Array(maxChildren + 1)
  const visIdx = new Int32Array(maxChildren + 1)

  /**
   * One van der Ploeg pass. `mirrored` lays the children out in reverse
   * order, i.e. it lays out the mirror image of the tree. Writes the leading
   * edge of every node along the breadth axis into `out`.
   */
  function pass(mirrored: boolean, out: Float64Array): void {
    prelim.fill(0)
    mod.fill(0)
    shift.fill(0)
    change.fill(0)
    threadL.fill(-1)
    threadR.fill(-1)
    const step = mirrored ? -1 : 1

    // First walk, children before parents (reverse breadth-first order).
    for (let t = n - 1; t >= 0; t--) {
      const k = count[t]
      if (k === 0) {
        extremeL[t] = extremeR[t] = t
        modSumL[t] = modSumR[t] = 0
        continue
      }
      const c0 = mirrored ? first[t] + k - 1 : first[t]
      let visTop = 0
      visLow[0] = bottom[extremeL[c0]]
      visIdx[0] = 0

      for (let i = 1; i < k; i++) {
        const ci = c0 + i * step
        const prev = ci - step
        // Read before separating: separating may repoint ci's extremes.
        const lowest = bottom[extremeR[ci]]

        // Walk the right contour of the siblings placed so far (sr) and the
        // left contour of the new subtree (cl) in lockstep, pushing the new
        // subtree right wherever the two would be closer than the gap.
        let sr = prev
        let cl = ci
        let sumR = mod[sr]
        let sumL = mod[cl]
        let vis = visTop
        let isRootPair = true
        while (sr !== -1 && cl !== -1) {
          while (vis > 0 && bottom[sr] > visLow[vis]) vis--
          const gap = spacing
            ? clean(mirrored ? spacing(nodes[cl], nodes[sr]) : spacing(nodes[sr], nodes[cl]))
            : nodeGap
          const dist = sumR + prelim[sr] + breadth[sr] + gap - (sumL + prelim[cl])
          // The two subtree roots always face each other, so the first pair
          // sets the baseline even when that means moving left; after that
          // the subtree only ever moves right.
          if (dist > 0 || isRootPair) {
            sumL += dist
            mod[ci] += dist
            modSumL[ci] += dist
            modSumR[ci] += dist
            // If the collision was with a sibling further back than the
            // previous one, spread the siblings in between evenly.
            const si = isRootPair ? i - 1 : visIdx[vis]
            if (si !== i - 1) {
              const parts = i - si
              shift[c0 + (si + 1) * step] += dist / parts
              shift[ci] -= dist / parts
              change[ci] -= dist - dist / parts
            }
          }
          isRootPair = false
          const sy = bottom[sr]
          const cy = bottom[cl]
          if (sy <= cy) {
            sr = count[sr] === 0 ? threadR[sr] : mirrored ? first[sr] : first[sr] + count[sr] - 1
            if (sr !== -1) sumR += mod[sr]
          }
          if (sy >= cy) {
            cl = count[cl] === 0 ? threadL[cl] : mirrored ? first[cl] + count[cl] - 1 : first[cl]
            if (cl !== -1) sumL += mod[cl]
          }
        }

        if (sr === -1 && cl !== -1) {
          // The new subtree is deeper than everything before it: the left
          // contour of the group continues into it. The thread's source gets
          // a modifier that makes modifier sums come out right across the
          // jump, and its prelim is compensated so it does not move.
          const from = extremeL[c0]
          threadL[from] = cl
          const diff = sumL - mod[cl] - modSumL[c0]
          mod[from] += diff
          prelim[from] -= diff
          extremeL[c0] = extremeL[ci]
          modSumL[c0] = modSumL[ci]
        } else if (sr !== -1 && cl === -1) {
          // The earlier siblings are deeper: the right contour continues
          // from the new subtree back into them.
          const from = extremeR[ci]
          threadR[from] = sr
          const diff = sumR - mod[sr] - modSumR[ci]
          mod[from] += diff
          prelim[from] -= diff
          extremeR[ci] = extremeR[prev]
          modSumR[ci] = modSumR[prev]
        }

        // Siblings no deeper than the new subtree are now hidden behind it.
        while (visTop >= 0 && lowest >= visLow[visTop]) visTop--
        visTop++
        visLow[visTop] = lowest
        visIdx[visTop] = i
      }

      // Centre the parent over its first and last child.
      const cLast = c0 + (k - 1) * step
      prelim[t] =
        (prelim[c0] + mod[c0] + mod[cLast] + prelim[cLast] + breadth[cLast]) / 2 - breadth[t] / 2
      extremeL[t] = extremeL[c0]
      modSumL[t] = modSumL[c0]
      extremeR[t] = extremeR[cLast]
      modSumR[t] = modSumR[cLast]
    }

    // Second walk, parents before children: apply the deferred spreading and
    // accumulate modifiers into absolute positions. modSumL is free by now
    // and is reused to carry each node's accumulated modifier.
    const acc = modSumL
    acc[0] = mod[0]
    out[0] = prelim[0] + mod[0]
    for (let t = 0; t < n; t++) {
      const k = count[t]
      if (k === 0) continue
      const c0 = mirrored ? first[t] + k - 1 : first[t]
      let spread = 0
      let delta = 0
      for (let i = 0; i < k; i++) {
        const c = c0 + i * step
        spread += shift[c]
        delta += spread + change[c]
        acc[c] = acc[t] + mod[c] + delta
        out[c] = prelim[c] + acc[c]
      }
    }
  }

  const pos = new Float64Array(n)
  pass(false, pos)
  if (symmetric && maxChildren > 1) {
    // Lay out the mirror image, reflect it back, line the roots up, average.
    const other = new Float64Array(n)
    pass(true, other)
    const a0 = pos[0]
    const b0 = -(other[0] + breadth[0])
    for (let i = 0; i < n; i++) {
      pos[i] = (pos[i] - a0 + (-(other[i] + breadth[i]) - b0)) / 2
    }
  }

  // --- Normalise and map onto x / y -----------------------------------------

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < n; i++) {
    if (pos[i] < min) min = pos[i]
    if (pos[i] + breadth[i] > max) max = pos[i] + breadth[i]
  }
  const totalBreadth = max - min
  const reversed = direction === 'up' || direction === 'left'
  for (let i = 0; i < n; i++) {
    const node = nodes[i]
    const across = pos[i] - min
    const along = reversed ? totalDepth - top[i] - extent[i] : top[i]
    if (horizontal) {
      node.x = along
      node.y = across
    } else {
      node.x = across
      node.y = along
    }
  }

  return {
    root: rootNode,
    nodes,
    width: horizontal ? totalDepth : totalBreadth,
    height: horizontal ? totalBreadth : totalDepth,
    direction,
    levelGap,
    layered,
  }
}

function makeNode<T>(
  data: T,
  parent: TidyNode<T> | null,
  depth: number,
  getSize: (data: T) => TidySize
): TidyNode<T> {
  const size = getSize(data)
  return {
    data,
    parent,
    children: [],
    depth,
    x: 0,
    y: 0,
    width: clean(size?.width),
    height: clean(size?.height),
  }
}

// ---------------------------------------------------------------------------
// Helpers for consumers
// ---------------------------------------------------------------------------

export interface TidyLink {
  /** Where the connector leaves the parent. */
  x1: number
  y1: number
  /** Where the connector enters the child. */
  x2: number
  y2: number
}

/**
 * Endpoints of the connector from a node's parent to the node: the middle of
 * the parent's side facing the children, and the middle of the node's side
 * facing the parent. Returns null for the root.
 *
 * The last `tree.levelGap` of the way to (x2, y2) is the band that is
 * guaranteed clear of other nodes.
 */
export function linkTo<T>(node: TidyNode<T>, direction: TidyDirection = 'down'): TidyLink | null {
  const p = node.parent
  if (!p) return null
  switch (direction) {
    case 'down':
      return { x1: p.x + p.width / 2, y1: p.y + p.height, x2: node.x + node.width / 2, y2: node.y }
    case 'up':
      return { x1: p.x + p.width / 2, y1: p.y, x2: node.x + node.width / 2, y2: node.y + node.height }
    case 'right':
      return { x1: p.x + p.width, y1: p.y + p.height / 2, x2: node.x, y2: node.y + node.height / 2 }
    case 'left':
      return { x1: p.x, y1: p.y + p.height / 2, x2: node.x + node.width, y2: node.y + node.height / 2 }
  }
}

/** The node whose box contains the point, or null. For clicks and hovers. */
export function nodeAt<T>(tree: TidyTree<T>, x: number, y: number): TidyNode<T> | null {
  const nodes = tree.nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (x >= node.x && x <= node.x + node.width && y >= node.y && y <= node.y + node.height) {
      return node
    }
  }
  return null
}
